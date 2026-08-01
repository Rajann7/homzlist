import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { consumeQuota, releaseQuota } from "@/lib/billing/service";
import { stopBoostsForSubject, pauseBoostsForSubject, resumeBoostsForSubject } from "@/lib/billing/boost";
import { scanAndRecord } from "@/lib/moderation/rules";

/**
 * Requirements — the "Post a requirement" flow (P6 S4, Doc7 §62).
 *
 * Module 4 owns CREATION only. Browsing, matching and proposals (Doc7 §63-76)
 * are Module 5; nothing here decides who may *see* a requirement.
 *
 * The quota rule is the subtle part (Doc2 §4.2): posting consumes one
 * `requirement` unit from the pooled plan balance, and turning a requirement
 * off — or deleting it — does NOT give it back. Only turning it back on after a
 * renewal consumes again. So the consumption happens exactly once, here, at
 * submit, and is recorded on the row.
 */

const db = () => createServiceClient();

/** How long a live requirement stays up before expiring (Doc7 §62). */
export const REQUIREMENT_DAYS = 30;

/** Preferred-areas cap from the design's "Select up to 5" note. */
export const MAX_AREAS = 5;

const NOTES_MAX = 500;

export interface RequirementRow {
  id: string;
  profile_id: string;
  kind: "sell" | "rent";
  type_code: string;
  bhk: number | null;
  budget_min_paise: number | null;
  budget_max_paise: number | null;
  area_ids: string[];
  area_label: string | null;
  city_id: string | null;
  urgency: "immediate" | "1_3_months" | "exploring";
  notes: string | null;
  status: "draft" | "pending_review" | "changes_requested" | "rejected" | "live" | "paused" | "fulfilled" | "expired" | "deleted";
  is_active: boolean;
  flagged_reason: string | null;
  reject_reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface RequirementInput {
  kind: "sell" | "rent";
  typeCode: string;
  bhk?: number | null;
  budgetMinPaise?: number | null;
  budgetMaxPaise?: number | null;
  areaIds?: string[];
  urgency?: "immediate" | "1_3_months" | "exploring";
  notes?: string | null;
}

export interface RequirementValidation {
  errors: Record<string, string>;
  warnings: Record<string, string>;
  flaggedReason: string | null;
}

/**
 * Types where BHK is meaningless. The form hides the chips for these; this is
 * the server's copy of that rule, so a posted `bhk` on a plot is dropped rather
 * than stored and later shown.
 */
/**
 * These are the REAL `property_types.code` values — an earlier version guessed
 * at names ("plot", "commercial", "warehouse") that exist nowhere in the
 * catalog, so the guard silently matched nothing and plot requirements were
 * happily storing a BHK.
 */
const NO_BHK_TYPES = new Set([
  "plot_res", "plot_com", "plot_agri", "plot_farm",
  "office", "shop", "showroom", "godown",
]);

export function bhkApplies(typeCode: string): boolean {
  return !NO_BHK_TYPES.has(typeCode);
}

/**
 * Validate a requirement. Same split as listings: errors block, warnings never
 * do (Doc2 §5.3). The browser runs the same rules for feedback; this one is the
 * control.
 */
export function validateRequirement(
  input: RequirementInput,
  typeExists: boolean,
  kindAllowed = true,
  /** The caller's already-awaited scan against `number_patterns` (P6). */
  contentFlag = false,
): RequirementValidation {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!typeExists) errors.typeCode = "Choose a property type";
  else if (!kindAllowed) {
    errors.typeCode = input.kind === "rent"
      ? "That property type isn't available to rent"
      : "That property type isn't available to buy";
  }
  if (input.kind !== "sell" && input.kind !== "rent") errors.kind = "Choose Buy or Rent";

  const min = input.budgetMinPaise ?? null;
  const max = input.budgetMaxPaise ?? null;
  if (min !== null && min < 0) errors.budgetMin = "Enter a valid amount";
  if (max !== null && max < 0) errors.budgetMax = "Enter a valid amount";
  // The design's exact copy for this case.
  if (min !== null && max !== null && max < min) errors.budgetMax = "Max budget must be higher than min";
  if (min === null && max === null) errors.budgetMin = "Add a budget so we can match you";

  const areas = input.areaIds ?? [];
  if (!areas.length) errors.areas = "Choose at least one preferred area";
  if (areas.length > MAX_AREAS) errors.areas = `Select up to ${MAX_AREAS} areas`;

  const notes = (input.notes ?? "").trim();
  if (notes.length > NOTES_MAX) errors.notes = `Keep notes under ${NOTES_MAX} characters`;

  // Number in the notes → warn the user AND flag for the admin queue, but never
  // block the post (Doc2 §5.3 warnings-only).
  let flaggedReason: string | null = null;
  if (notes && contentFlag) {
    warnings.notes = "Sharing your number here is risky — buyers can request it safely in chat.";
    flaggedReason = "number_in_notes";
  }

  return { errors, warnings, flaggedReason };
}

/** How many requirement posts this user can still make, server-computed. */
export async function requirementQuota(profileId: string): Promise<{ left: number; unlimited: boolean }> {
  const { data } = await db()
    .from("user_plans")
    .select("requirement_quota, requirement_used")
    .eq("profile_id", profileId)
    .eq("status", "active");

  const rows = (data ?? []) as { requirement_quota: number; requirement_used: number }[];
  if (rows.some((r) => r.requirement_quota < 0)) return { left: -1, unlimited: true };
  const left = rows.reduce((n, r) => n + Math.max(0, r.requirement_quota - r.requirement_used), 0);
  return { left, unlimited: false };
}

export type CreateResult =
  | { ok: true; requirement: RequirementRow }
  | { ok: false; reason: "validation"; errors: Record<string, string> }
  | { ok: false; reason: "no_quota" };

/**
 * Create + submit a requirement in one step.
 *
 * Unlike a listing there is no photo stage, so the form's "Submit for Review"
 * is the only write — which means the quota draw and the row insert happen
 * together. `consume_quota` is the atomic gate (migration 0004): if it returns
 * null the pool is genuinely empty and nothing is written, so a user can never
 * end up with a requirement that no plan paid for.
 */
export async function createRequirement(profileId: string, input: RequirementInput): Promise<CreateResult> {
  const { data: type } = await db()
    .from("property_types")
    .select("code,kinds")
    .eq("code", input.typeCode)
    .eq("is_active", true)
    .maybeSingle();

  // The type must support the chosen kind. A "plot for rent" requirement can
  // never be matched by any listing, because a plot can't BE listed for rent —
  // the form hides those now, and this is the wall behind it (Doc9: never
  // trust the browser).
  const kindOk = Boolean(type) && ((type as { kinds?: string[] } | null)?.kinds ?? []).includes(input.kind);

  // The number rules are rows now (P6) — read them here, count the match, and
  // hand the validator the answer rather than a second hardcoded regex.
  const scan = await scanAndRecord(input.notes ?? "", {
    entityType: "requirement",
    field: "notes",
    profileId,
  });
  const v = validateRequirement(
    input,
    Boolean(type),
    kindOk,
    Boolean(scan.blocked || scan.flagged.length),
  );
  if (Object.keys(v.errors).length) return { ok: false, reason: "validation", errors: v.errors };

  const areaIds = (input.areaIds ?? []).slice(0, MAX_AREAS);

  // Draw the quota FIRST. If this fails nothing else has happened yet.
  const userPlanId = await consumeQuota(profileId, "requirement", 1, {
    type: "requirement",
    note: "Requirement posted",
  });
  if (!userPlanId) return { ok: false, reason: "no_quota" };

  const now = new Date();
  const expires = new Date(now.getTime() + REQUIREMENT_DAYS * 86_400_000);

  // From here the quota is already SPENT, so every failure path below has to
  // hand it back. Without this the insert throwing left the user charged for a
  // requirement that was never created — observed on dev as plan_consumptions
  // rows with no matching requirement (migration 0024 adds the release plus a
  // backfill for the rows it already stranded). The label/city lookups are
  // inside the guard too: they are network calls that can fail just as easily
  // as the insert, and they used to sit un-awaited inside the insert payload.
  try {
    const { data, error } = await db()
      .from("requirements")
      .insert({
        profile_id: profileId,
        kind: input.kind,
        type_code: input.typeCode,
        bhk: bhkApplies(input.typeCode) ? (input.bhk ?? null) : null,
        budget_min_paise: input.budgetMinPaise ?? null,
        budget_max_paise: input.budgetMaxPaise ?? null,
        area_ids: areaIds,
        area_label: await areaLabelFor(areaIds),
        city_id: await cityIdFor(areaIds),
        urgency: input.urgency ?? "immediate",
        notes: (input.notes ?? "").trim() || null,
        status: "pending_review",
        flagged_reason: v.flaggedReason,
        slot_consumed_at: now.toISOString(),
        submitted_at: now.toISOString(),
        expires_at: expires.toISOString(),
      })
      .select("*")
      .single();

    if (error) throw error;
    return { ok: true, requirement: data as RequirementRow };
  } catch (e) {
    await releaseQuota(profileId, userPlanId, "requirement", 1, "Requirement create failed");
    throw e;
  }
}

/** "Mavdi, Rajkot" style label built from the chosen areas (first one wins). */
async function areaLabelFor(areaIds: string[]): Promise<string | null> {
  if (!areaIds.length) return null;
  const { data } = await db().from("locations").select("id,name,parent_id").in("id", areaIds);
  const rows = (data ?? []) as { id: string; name: string; parent_id: string | null }[];
  const first = rows.find((r) => r.id === areaIds[0]) ?? rows[0];
  if (!first) return null;
  if (!first.parent_id) return first.name;
  const { data: parent } = await db().from("locations").select("name").eq("id", first.parent_id).maybeSingle();
  const city = (parent as { name: string } | null)?.name;
  const extra = areaIds.length > 1 ? ` +${areaIds.length - 1}` : "";
  return city ? `${first.name}, ${city}${extra}` : `${first.name}${extra}`;
}

/** The city the first preferred area sits in — used for city-scoped matching. */
async function cityIdFor(areaIds: string[]): Promise<string | null> {
  if (!areaIds.length) return null;
  const { data } = await db().from("locations").select("parent_id").eq("id", areaIds[0]).maybeSingle();
  return (data as { parent_id: string | null } | null)?.parent_id ?? null;
}

/** The poster's own requirements (P8 "My requirements" reads through here). */
export async function myRequirements(profileId: string): Promise<RequirementRow[]> {
  const { data } = await db()
    .from("requirements")
    .select("*")
    .eq("profile_id", profileId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });
  return (data ?? []) as RequirementRow[];
}

/** Ownership-checked fetch — someone else's requirement is simply not found. */
export async function getOwnRequirement(id: string, profileId: string): Promise<RequirementRow | null> {
  const { data } = await db()
    .from("requirements")
    .select("*")
    .eq("id", id)
    .eq("profile_id", profileId)
    .neq("status", "deleted")
    .maybeSingle();
  return (data as RequirementRow) ?? null;
}

/**
 * Requirement as seen by a specific viewer (Doc7 §64).
 *
 * Three outcomes, decided HERE and never in the browser:
 *   - own      → everything, plus the controls only a poster gets
 *   - unlocked → full data (viewer holds an active ₹2,999 Requirement Access)
 *   - locked   → preview fields ONLY. The budget and the poster are not in the
 *                payload at all, so a locked viewer opening DevTools finds
 *                nothing to un-blur (Doc9 §17 — stripped server-side).
 */
export type RequirementAccess = "own" | "unlocked" | "locked";

export async function getRequirementForViewer(id: string, viewerId: string | null) {
  const { data } = await db()
    .from("requirements")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .maybeSingle();
  const r = (data as RequirementRow) ?? null;
  if (!r) return null;

  // A requirement that isn't live is visible to its owner only.
  const isOwn = Boolean(viewerId && r.profile_id === viewerId);
  if (!isOwn && r.status !== "live") return null;

  const access: RequirementAccess = isOwn
    ? "own"
    : (await hasRequirementAccess(viewerId)) ? "unlocked" : "locked";

  return { row: r, access };
}

/** Does this viewer hold a plan that unlocks full requirement data? */
export async function hasRequirementAccess(viewerId: string | null): Promise<boolean> {
  if (!viewerId) return false;
  const { data } = await db()
    .from("user_plans")
    .select("terms")
    .eq("profile_id", viewerId)
    .eq("status", "active");
  return (data ?? []).some((p: { terms?: Record<string, unknown> }) => Boolean(p.terms?.requirement_access));
}

/** Proposal count for the poster's own view (Module 5 fills the list itself). */
export async function requirementProposalCount(requirementId: string): Promise<number> {
  const { count, error } = await db()
    .from("proposals")
    .select("id", { count: "exact", head: true })
    .eq("requirement_id", requirementId);
  // The proposals table lands in Module 5; until then this is honestly zero
  // rather than a fabricated number.
  return error ? 0 : (count ?? 0);
}

/**
 * Edit an existing requirement (P6 S4 in edit mode).
 *
 * Deliberately NOT a second createRequirement: the quota was drawn when the
 * requirement was first posted, and `expires_at` keeps running from then — an
 * edit must never mint a fresh 30-day window or spend another post.
 *
 * A content change goes back to `pending_review`, same as a listing edit: the
 * budget and areas an admin approved are exactly what's being changed. Rows
 * already fulfilled or deleted are out of scope, so the status filter is the
 * guard rather than a separate lookup.
 */
export async function updateRequirementContent(
  id: string,
  profileId: string,
  input: RequirementInput,
): Promise<{ ok: true } | { ok: false; reason: "validation" | "not_found"; errors?: Record<string, string> }> {
  const { data: type } = await db()
    .from("property_types")
    .select("code,kinds")
    .eq("code", input.typeCode)
    .eq("is_active", true)
    .maybeSingle();

  const kindOk = Boolean(type) && ((type as { kinds?: string[] } | null)?.kinds ?? []).includes(input.kind);
  const editScan = await scanAndRecord(input.notes ?? "", {
    entityType: "requirement",
    field: "notes",
    profileId,
  });
  const v = validateRequirement(
    input,
    Boolean(type),
    kindOk,
    Boolean(editScan.blocked || editScan.flagged.length),
  );
  if (Object.keys(v.errors).length) return { ok: false, reason: "validation", errors: v.errors };

  const areaIds = (input.areaIds ?? []).slice(0, MAX_AREAS);

  const { data } = await db()
    .from("requirements")
    .update({
      kind: input.kind,
      type_code: input.typeCode,
      bhk: bhkApplies(input.typeCode) ? (input.bhk ?? null) : null,
      budget_min_paise: input.budgetMinPaise ?? null,
      budget_max_paise: input.budgetMaxPaise ?? null,
      area_ids: areaIds,
      area_label: await areaLabelFor(areaIds),
      city_id: await cityIdFor(areaIds),
      urgency: input.urgency ?? "immediate",
      notes: (input.notes ?? "").trim() || null,
      status: "pending_review",
      // Content diverged from what was approved — so switching it off and on
      // again will NOT re-live it silently (migration 0050).
      edited_since_approval: true,
      flagged_reason: v.flaggedReason,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("profile_id", profileId)
    .in("status", ["pending_review", "changes_requested", "rejected", "live", "paused"])
    .select("id")
    .maybeSingle();

  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Poster actions (P4 S4c): pause/resume, mark fulfilled, delete. */
export async function setRequirementActive(id: string, profileId: string, active: boolean) {
  // Turning a requirement back ON re-lives it only if its content still matches
  // what was approved. An edit since then puts it back in the queue instead of
  // letting the on/off switch publish unreviewed content (migration 0050).
  const { data: current } = await db()
    .from("requirements")
    .select("edited_since_approval,live_at")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();
  const c = current as { edited_since_approval: boolean; live_at: string | null } | null;
  const relives = Boolean(c?.live_at) && !c?.edited_since_approval;

  const { data } = await db()
    .from("requirements")
    .update({ is_active: active, status: active ? (relives ? "live" : "pending_review") : "paused" })
    .eq("id", id)
    .eq("profile_id", profileId)
    .in("status", ["live", "paused"])
    .select("id")
    .maybeSingle();
  if (!data) return false;

  // A requirement boost (Doc2 §13) is placed only while the requirement is
  // browsable, so toggling it off pauses the boost instead of burning days on
  // something nobody can see — and turning it back on resumes it.
  if (active) await resumeBoostsForSubject(id);
  else await pauseBoostsForSubject(id, "Requirement turned off · boost paused");
  return true;
}

export async function fulfillRequirement(id: string, profileId: string) {
  const { data } = await db()
    .from("requirements")
    .update({ status: "fulfilled", is_active: false, fulfilled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profileId)
    .in("status", ["live", "paused"])
    .select("id")
    .maybeSingle();
  if (!data) return false;
  // Fulfilled is this subject's version of "sold" — the boost auto-stops.
  await stopBoostsForSubject(id, "Requirement marked fulfilled · boost stopped automatically");
  return true;
}

/**
 * Reopen a fulfilled requirement (P8 S4 fulfilled card → "Reopen").
 *
 * The design's dialog is explicit: "It will use a requirement slot from your
 * current plan." So reopening consumes a fresh `requirement` unit, exactly like
 * posting — the same atomic draw, and the same strand-safety (release on
 * failure) as createRequirement. A fulfilled requirement whose 30-day window has
 * passed also gets a fresh window.
 */
export async function reopenRequirement(
  id: string,
  profileId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "no_quota" }> {
  const { data: cur } = await db()
    .from("requirements")
    .select("id, status, expires_at")
    .eq("id", id)
    .eq("profile_id", profileId)
    .eq("status", "fulfilled")
    .maybeSingle();
  if (!cur) return { ok: false, reason: "not_found" };

  const userPlanId = await consumeQuota(profileId, "requirement", 1, { type: "requirement", id, note: "Requirement reopened" });
  if (!userPlanId) return { ok: false, reason: "no_quota" };

  try {
    const now = new Date();
    const stillValid = (cur as { expires_at: string | null }).expires_at
      && new Date((cur as { expires_at: string }).expires_at).getTime() > now.getTime();
    const expires = stillValid
      ? (cur as { expires_at: string }).expires_at
      : new Date(now.getTime() + REQUIREMENT_DAYS * 86_400_000).toISOString();
    const { data, error } = await db()
      .from("requirements")
      .update({ status: "live", is_active: true, fulfilled_at: null, expires_at: expires, slot_consumed_at: now.toISOString() })
      .eq("id", id)
      .eq("profile_id", profileId)
      .eq("status", "fulfilled")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) { await releaseQuota(profileId, userPlanId, "requirement", 1, "Reopen lost the row"); return { ok: false, reason: "not_found" }; }
    return { ok: true };
  } catch (e) {
    await releaseQuota(profileId, userPlanId, "requirement", 1, "Requirement reopen failed");
    throw e;
  }
}

/**
 * Soft-delete. Doc2 §4.2 is explicit that deleting does NOT return the quota —
 * the slot stays consumed, which is why nothing is refunded here.
 */
export async function deleteRequirement(id: string, profileId: string) {
  const { data } = await db()
    .from("requirements")
    .update({ status: "deleted", is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("id")
    .maybeSingle();
  if (!data) return false;
  await stopBoostsForSubject(id, "Requirement deleted · boost stopped");
  return true;
}
