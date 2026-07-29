import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { consumeQuota, releaseQuota, reserveSlot, transitionSlot } from "@/lib/billing/service";
import { formatShortRupees } from "@/lib/billing/money";
import { getAmenityLabels, getAmenityMeta, getFieldDefinitions, getFieldGroups, posterCard, releaseSlotAndRefundQuota, sanitizeAmenities, type FieldDefinitionRow } from "./service";
import { pauseBoostsForSubject, resumeBoostsForSubject, stopBoostsForSubject } from "@/lib/billing/boost";
import { visibleKeys } from "./visibility";
import { scopedGroups } from "./groupLabel";
import { STATUS_BADGE, renderAttrValue, resolveKeySpecs, topUpSpecs, type KeySpecCandidate } from "./dto";

/**
 * Builder projects (Doc2 §6, Doc7 §59-61).
 *
 * A project consumes the SAME listing-slot pool as a property, drawn from the
 * ₹9,999 Builder plan — so payment-first holds identically here (Doc9 §11).
 *
 * One deliberate difference from listings: project contact numbers are ALWAYS
 * public (Doc2 §6), so there's no number-privacy branch in the project DTO.
 */

const db = () => createServiceClient();

export class NoProjectSlotError extends Error {
  constructor() {
    super("PLAN_REQUIRED");
  }
}

export interface ProjectTypeRow {
  code: string;
  label: string;
  category: "residential" | "commercial" | "plot" | "mixed";
  /** Unit names this kind of scheme offers in its "Add unit type" sheet. */
  unit_types: string[];
  field_config: { fields?: string[]; required?: string[]; key_specs?: KeySpecCandidate[] };
  sort_order: number;
}

/**
 * The project types a builder can post (migration 0062).
 *
 * There was no such thing before: a plotting scheme, a shopping complex and an
 * apartment tower all filled in one identical five-step form, which asked all
 * of them for towers and floors and none of them for the site area.
 */
export async function getProjectTypes(): Promise<ProjectTypeRow[]> {
  const { data } = await db().from("project_types").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []) as ProjectTypeRow[];
}

export async function getProjectType(code: string | null): Promise<ProjectTypeRow | null> {
  if (!code) return null;
  const { data } = await db().from("project_types").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  return (data as ProjectTypeRow) ?? null;
}

/**
 * The project mirror of `sanitizeAttributes` — same two jobs, same evaluator.
 * A key the chosen scheme never asks for is dropped (mass assignment), and so
 * is one whose condition doesn't hold: no Occupancy Certificate on a scheme
 * that is still under construction, no launch date on a finished one.
 */
export async function sanitizeProjectAttributes(
  raw: Record<string, unknown>,
  type: ProjectTypeRow | null,
  /**
   * Values that drive visibility but live in COLUMNS, not in the attribute bag
   * — `build_status` is the only one today. It must be handed in rather than
   * read out of `raw`: it was briefly both a column and a scheme field, and the
   * duplicate inside `attributes` is what the rules ended up reading, so a
   * ready-to-move scheme lost its Occupancy Certificate (migration 0064).
   */
  context: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (!type) return {};
  const defs = await getFieldDefinitions();
  const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
  const asked = (type.field_config.fields ?? []).filter((k) => byKey[k]);
  const out: Record<string, unknown> = {};
  // Context LAST: a hand-made payload must not be able to smuggle its own
  // `build_status` into the bag and unlock a field the real column forbids.
  for (const k of visibleKeys(asked, byKey, { ...(raw ?? {}), ...context })) {
    const v = (raw ?? {})[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v) && !(v as { value?: unknown }).value) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Everything `projectDTO` needs to turn stored codes into labels: the field
 * definitions, the section list, and the type map. Loaded once per call site
 * rather than per project, so a builder's 60-project tab is still three
 * queries and not three per row.
 */
async function projectContext() {
  const [defs, groups, types, amenityMeta] = await Promise.all([
    getFieldDefinitions(), getFieldGroups(), getProjectTypes(), getAmenityMeta(),
  ]);
  const byCode = new Map(types.map((t) => [t.code, t]));
  return { defs, groups, amenityMeta, forRow: (p: { project_type?: string | null }) => byCode.get(p.project_type ?? "") ?? null };
}

/** A stored option CODE rendered through its own definition's label. */
function optionLabel(defs: FieldDefinitionRow[] | undefined, key: string, value: string | null): string | null {
  if (!value) return null;
  const def = defs?.find((d) => d.key === key);
  return def?.options?.find((o) => o.value === value)?.label ?? value;
}

/** Project attributes → the detail screen's titled blocks, like a listing's. */
function projectAttributeGroups(
  attrs: Record<string, unknown>,
  type: ProjectTypeRow | null,
  defs: FieldDefinitionRow[] | undefined,
  groups: { key: string; label: string; icon?: string | null; tone?: string | null }[] | undefined,
) {
  if (!defs?.length || !type) return [];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  // Only what this scheme type asks for — same rule as a listing's
  // `attributeRows` (0073). A trailing "everything else" block put fields from
  // a previously-chosen scheme type on the screen with no way to edit them.
  const keys = (type.field_config.fields ?? []).filter((k) => k in attrs);

  const rows: { key: string; label: string; value: string; group: string | null }[] = [];
  for (const key of keys) {
    const raw = attrs[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const def = byKey.get(key);
    const label = def?.label ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    // The SAME renderer a listing uses (dto.renderAttrValue). This branch used
    // to be a second, thinner copy: it printed the raw unit code ("50 vigha"
    // rather than "50 Vigha") and no thousands grouping ("150000" under
    // "Booking amount (₹)"), so a scheme described its answers differently from
    // a property describing the identical field.
    const value = renderAttrValue(def, raw);
    if (value === null) continue;
    rows.push({ key, label, value, group: def?.group ?? null });
  }

  const known = groups ?? [];
  // Icon + tone travel with the block, exactly as they do for a listing.
  const out: { key: string; label: string; icon: string | null; tone: string | null; rows: typeof rows }[] = [];
  for (const g of known) {
    const items = rows.filter((r) => r.group === g.key);
    if (items.length) out.push({ key: g.key, label: g.label, icon: g.icon ?? null, tone: g.tone ?? null, rows: items });
  }
  const rest = rows.filter((r) => !r.group || !known.some((g) => g.key === r.group));
  if (rest.length) out.push({ key: "other", label: "Scheme details", icon: "list", tone: "neutral", rows: rest });
  return out;
}

export interface ProjectUnitInput {
  unitType?: string;
  areaSqft?: number;
  carpetSqft?: number;
  priceFromPaise?: number;
  unitsAvailable?: number;
  floorPlanUrl?: string;
}

export async function createProject(
  profileId: string,
  input: {
    name: string;
    reraNumber: string | null;
    reraExempt: boolean;
    reraExemptReason: string | null;
    buildStatus: string | null;
    possessionDate: string | null;
    towers: number | null;
    floors: number | null;
    totalUnits: number | null;
    availableUnits: number | null;
    bankApprovals: string[];
    amenities: string[];
    description: string | null;
    stateId: string | null;
    districtId: string | null;
    talukaId: string | null;
    cityId: string;
    areaId: string | null;
    areaLabel: string | null;
    pincode: string | null;
    projectType: string | null;
    attributes: Record<string, unknown>;
    units: ProjectUnitInput[];
  },
) {
  // Payment-first: draw the slot before writing anything.
  //
  // A PROJECT unit, not a listing one (migration 0065). Drawing "listing" here
  // meant any ₹999 plan funded a builder project — eight of them went out
  // against one 50-slot listing grant on dev while the review step promised
  // "₹9,999 · 6 months · 1 project". Only the ₹9,999 plan carries this quota.
  const userPlanId = await consumeQuota(profileId, "project", 1, { type: "project", note: "project submitted" });
  if (!userPlanId) throw new NoProjectSlotError();
  const slotId = await reserveSlot(profileId, userPlanId);

  // 6-month validity from the plan; the 1-year expiry cycle runs off `expires_at`.
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();

  const { data, error } = await db()
    .from("projects")
    .insert({
      profile_id: profileId,
      slot_id: slotId,
      name: input.name,
      status: "pending_review",
      // Projects have no draft step — created = submitted for review.
      submitted_at: new Date().toISOString(),
      rera_number: input.reraNumber,
      rera_exempt: input.reraExempt,
      rera_exempt_reason: input.reraExemptReason,
      build_status: input.buildStatus,
      possession_date: input.possessionDate,
      towers: input.towers,
      floors: input.floors,
      total_units: input.totalUnits,
      available_units: input.availableUnits,
      bank_approvals: input.bankApprovals,
      // Codes from the master list — the form used to send LABELS, which is why
      // no project amenity ever resolved an icon (amenityMeta is keyed by code).
      amenities: await sanitizeAmenities(input.amenities),
      description: input.description,
      state_id: input.stateId,
      district_id: input.districtId,
      taluka_id: input.talukaId,
      city_id: input.cityId,
      area_id: input.areaId,
      area_label: input.areaLabel,
      pincode: input.pincode,
      project_type: input.projectType,
      attributes: input.attributes,
      expires_at: expires,
    })
    .select("*")
    .single();

  if (error) {
    // Both halves, not just the slot. Releasing the slot alone left
    // `project_used` incremented, so a builder whose insert failed was charged
    // their one ₹9,999 project and had nothing to show for it — the exact
    // separation of money and benefit migration 0024 exists to prevent.
    await transitionSlot(slotId, profileId, "released", "project insert failed");
    await releaseQuota(profileId, userPlanId, "project", 1, "project insert failed");
    throw error;
  }

  const project = data as { id: string };

  // Unit-type repeater (Doc2 §6) — rendered as an expandable table on detail.
  const units = input.units
    .filter((u) => typeof u.unitType === "string" && u.unitType.trim())
    .slice(0, 40)
    .map((u, i) => ({
      project_id: project.id,
      unit_type: String(u.unitType).slice(0, 40),
      area_sqft: Number.isFinite(u.areaSqft) ? Math.trunc(u.areaSqft as number) : null,
      carpet_sqft: Number.isFinite(u.carpetSqft) ? Math.trunc(u.carpetSqft as number) : null,
      units_available: Number.isFinite(u.unitsAvailable) ? Math.trunc(u.unitsAvailable as number) : null,
      price_from_paise: Number.isFinite(u.priceFromPaise) ? Math.trunc(u.priceFromPaise as number) : null,
      floor_plan_url: typeof u.floorPlanUrl === "string" ? u.floorPlanUrl.slice(0, 500) : null,
      position: i,
    }));
  if (units.length) await db().from("project_units").insert(units);

  await db().from("listing_slots").update({ listing_id: project.id }).eq("id", slotId);
  const ctx = await projectContext();
  return projectDTO(data, units, undefined, { defs: ctx.defs, groups: ctx.groups, type: ctx.forRow(data as any), amenityMeta: ctx.amenityMeta });
}

/**
 * Edit a project the caller already owns (P6 S5 in edit mode).
 *
 * No slot is drawn and `expires_at` is left alone — the ₹9,999 was paid when
 * the project was created, and an edit must not restart or re-charge that.
 * Units are replaced wholesale because the form edits them as one repeater;
 * they carry no state of their own worth preserving row-by-row.
 *
 * Like a listing edit, the project returns to `pending_review`: the RERA
 * number, unit prices and possession date are exactly what review checks.
 */
export async function updateProject(
  projectId: string,
  profileId: string,
  input: Omit<Parameters<typeof createProject>[1], never>,
) {
  const { data: owned } = await db()
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!owned) return null;

  const { data, error } = await db()
    .from("projects")
    .update({
      name: input.name,
      status: "pending_review",
      // Content diverged from what was approved (migration 0050).
      edited_since_approval: true,
      submitted_at: new Date().toISOString(),
      rera_number: input.reraNumber,
      rera_exempt: input.reraExempt,
      rera_exempt_reason: input.reraExemptReason,
      build_status: input.buildStatus,
      possession_date: input.possessionDate,
      towers: input.towers,
      floors: input.floors,
      total_units: input.totalUnits,
      available_units: input.availableUnits,
      bank_approvals: input.bankApprovals,
      // Codes from the master list — the form used to send LABELS, which is why
      // no project amenity ever resolved an icon (amenityMeta is keyed by code).
      amenities: await sanitizeAmenities(input.amenities),
      description: input.description,
      state_id: input.stateId,
      district_id: input.districtId,
      taluka_id: input.talukaId,
      city_id: input.cityId,
      area_id: input.areaId,
      area_label: input.areaLabel,
      pincode: input.pincode,
      project_type: input.projectType,
      attributes: input.attributes,
    })
    .eq("id", projectId)
    .eq("profile_id", profileId)
    .select("*")
    .single();
  if (error) throw error;

  const units = input.units
    .filter((u) => typeof u.unitType === "string" && u.unitType.trim())
    .slice(0, 40)
    .map((u, i) => ({
      project_id: projectId,
      unit_type: String(u.unitType).slice(0, 40),
      area_sqft: Number.isFinite(u.areaSqft) ? Math.trunc(u.areaSqft as number) : null,
      carpet_sqft: Number.isFinite(u.carpetSqft) ? Math.trunc(u.carpetSqft as number) : null,
      units_available: Number.isFinite(u.unitsAvailable) ? Math.trunc(u.unitsAvailable as number) : null,
      price_from_paise: Number.isFinite(u.priceFromPaise) ? Math.trunc(u.priceFromPaise as number) : null,
      floor_plan_url: typeof u.floorPlanUrl === "string" ? u.floorPlanUrl.slice(0, 500) : null,
      position: i,
    }));
  await db().from("project_units").delete().eq("project_id", projectId);
  if (units.length) await db().from("project_units").insert(units);

  const ctx = await projectContext();
  return projectDTO(data, units, undefined, { defs: ctx.defs, groups: ctx.groups, type: ctx.forRow(data as any), amenityMeta: ctx.amenityMeta });
}

/**
 * Record a project lead (migration 0051).
 *
 * Fired when a signed-in viewer taps Call or WhatsApp on a live project that
 * isn't theirs — the only two contact affordances a project detail has, and
 * until now both left no trace whatsoever.
 *
 * Idempotent per (builder, person, project) via the partial unique index: a
 * buyer tapping Call four times is ONE lead whose activity moves forward, not
 * four. A guest cannot be a lead — `leads.lead_profile_id` is not nullable and
 * an anonymous "someone" is not something a builder can follow up.
 *
 * Never throws: failing to record a lead must not stop the call connecting.
 */
export async function recordProjectLead(
  projectId: string,
  ownerId: string,
  leadProfileId: string,
  activity: string,
): Promise<boolean> {
  if (ownerId === leadProfileId) return false;
  try {
    const { error } = await db().from("leads").upsert(
      {
        owner_id: ownerId,
        lead_profile_id: leadProfileId,
        project_id: projectId,
        // 'project' is the source family for anything that came off a project
        // (0081). This wrote 'inquiry' — the same family a property inquiry
        // uses — so a builder's pipeline mixed the two, and the same person
        // arriving by Call and then by chat produced two different labels on
        // one row depending on which happened last.
        source: "project",
        stage: "new",
        last_activity: activity.slice(0, 120),
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,lead_profile_id,project_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * The builder's insight count for one project: LEADS, and only leads.
 *
 * Views and shares were briefly built here and are deliberately gone — a
 * builder's question is "who wants this project", not "how many people
 * scrolled past it", and two of the four cards would have been noise. Nothing
 * else about a project is countable today without inventing it.
 */
export async function ownerProjectLeadCount(projectId: string): Promise<number> {
  const { count } = await db()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_relevant", true);
  return count ?? 0;
}

export async function listMyProjects(profileId: string) {
  const { data } = await db()
    .from("projects")
    .select("*, project_units(*)")
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const [amenityLabels, ctx] = await Promise.all([getAmenityLabels(), projectContext()]);
  return ((data ?? []) as any[]).map((p) =>
    projectDTO(p, p.project_units ?? [], amenityLabels, { defs: ctx.defs, groups: ctx.groups, type: ctx.forRow(p), amenityMeta: ctx.amenityMeta }));
}

// ---------------------------------------------------------------------------
// Lifecycle — hide / unhide / delete / restore / purge (migration 0079)
//
// A listing has had all of this since Module 4. A project had none of it: no
// status route, no DELETE route, and a `deleted_at` filter over a column
// nothing ever wrote. So a scheme posted by mistake could not be taken down,
// and the ₹9,999 slot behind it could never be released.
//
// Every rule here is the LISTING rule, applied to the same shared enum:
//  - hide pauses a running boost (the project is placed nowhere, so the days
//    the builder paid for must not run down against an invisible row),
//  - going live again resumes it,
//  - delete stops a running boost and refunds one still awaiting approval,
//  - the slot comes back ONLY if the project was never approved — otherwise a
//    single ₹9,999 could be recycled by publishing, deleting and re-posting.
// ---------------------------------------------------------------------------

/** Ownership failed. Distinct from "illegal transition", which is a 400. */
export const PROJECT_NOT_OWNED = Symbol("PROJECT_NOT_OWNED");

export type ProjectStatusAction = "hide" | "unhide" | "restore";

export async function setProjectStatus(id: string, profileId: string, action: ProjectStatusAction) {
  // Owner-scoped, NOT visibility-scoped: `restore` exists precisely to act on a
  // row that every viewer gate treats as gone.
  const { data: row } = await db().from("projects").select("*").eq("id", id).maybeSingle();
  const current = row as Record<string, any> | null;
  if (!current || current.profile_id !== profileId) return PROJECT_NOT_OWNED;
  if (action !== "restore" && current.status === "deleted") return null;

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;

  switch (action) {
    case "hide":
      // Only something currently visible can be hidden. Hiding a project that
      // is still under review would strand it: review has no queue entry for a
      // hidden row, so it could never be approved OR rejected.
      if (current.status !== "live") return null;
      patch = { status: "hidden", hidden_at: now };
      break;
    case "unhide":
      if (current.status !== "hidden") return null;
      // Hiding is not an edit. Content a moderator already approved and which
      // has not been touched since goes straight back live; anything else
      // queues for the pass it still owes. `edited_since_approval` is the same
      // flag the listing rule reads.
      patch = {
        status: current.approved_at && !current.edited_since_approval ? "live" : "pending_review",
        hidden_at: null,
      };
      break;
    case "restore":
      if (current.status !== "deleted") return null;
      // Back to review, never straight to live: the row spent up to 30 days
      // out of moderation's sight, and a project carries a RERA number whose
      // validity is exactly what review checks.
      patch = { status: "pending_review", deleted_at: null, hidden_at: null, submitted_at: now };
      break;
  }

  const { data } = await db()
    .from("projects")
    .update(patch)
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("*")
    .maybeSingle();
  if (!data) return null;

  if (action === "hide") await pauseBoostsForSubject(id, "Project hidden · boost paused");
  if ((data as { status: string }).status === "live") await resumeBoostsForSubject(id);

  return data as Record<string, any>;
}

/**
 * Soft delete → 30-day trash, mirroring `softDeleteListing`.
 *
 * The slot is released ONLY when the project never reached `live`: the builder
 * paid ₹9,999 for a published scheme and never got one. Once it has been live
 * the slot stays consumed — otherwise one plan could be recycled forever.
 */
export async function softDeleteProject(id: string, profileId: string): Promise<boolean> {
  const { data: row } = await db()
    .from("projects")
    .select("id,profile_id,status,slot_id,approved_at,live_at,deleted_at")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();
  const before = row as { id: string; status: string; slot_id: string | null; live_at: string | null; deleted_at: string | null } | null;
  if (!before || before.deleted_at) return false;

  // "Never published" is measured by `live_at`, not by the CURRENT status — a
  // project that went live and was later hidden HAS had its slot's worth.
  const neverPublished = !before.live_at;

  const { data } = await db()
    .from("projects")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .select("id,slot_id")
    .maybeSingle();
  if (!data) return false;

  const slotId = (data as { slot_id: string | null }).slot_id;
  if (neverPublished && slotId) {
    // The PROJECT quota, not the listing one — a project slot is drawn from
    // `project_used` (migration 0065), and refunding the wrong counter would
    // hand back a listing the builder never bought.
    await releaseSlotAndRefundQuota(slotId, profileId, "project deleted before approval", "project");
    await db().from("projects").update({ slot_id: null }).eq("id", id);
  }

  await stopBoostsForSubject(id, "Project deleted · boost stopped");
  return true;
}

/**
 * "Delete now" from trash — the same thing the 30-day cron does, on demand.
 *
 * The `status = 'deleted'` filter is applied IN the statement rather than
 * checked first, so two parallel calls cannot race past it and this can never
 * hard-delete a live project. The consumed slot is not returned.
 */
export async function purgeProject(id: string, profileId: string): Promise<boolean> {
  // Same order as the listing purge: objects before rows. A project also
  // carries a BROCHURE in the private bucket, which is a column rather than a
  // photo row, so nothing would ever have cascaded it (migration 0080).
  const { data: owned } = await db()
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("profile_id", profileId)
    .eq("status", "deleted")
    .maybeSingle();
  if (!owned) return false;

  const { purgeSubjectStorage, PROJECT_PHOTOS } = await import("./photos");
  await purgeSubjectStorage([id], PROJECT_PHOTOS, "project purged");

  const { data } = await db()
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .eq("status", "deleted")
    .select("id");
  return (data ?? []).length > 0;
}

/** Trash (P10 S4) — the builder's soft-deleted projects. */
export async function listTrashProjects(profileId: string) {
  const { data } = await db()
    .from("projects")
    .select("id,name,status,cover_url,area_label,photo_count,deleted_at,project_units(price_from_paise)")
    .eq("profile_id", profileId)
    .eq("status", "deleted")
    .order("deleted_at", { ascending: false })
    .limit(100);

  return ((data ?? []) as any[]).map((p) => ({
    subjectKind: "project" as const,
    id: p.id,
    title: p.name,
    price: projectPriceLabel(p.project_units),
    areaLabel: p.area_label,
    coverUrl: p.cover_url,
    photoCount: p.photo_count ?? 0,
    badge: STATUS_BADGE[p.status] ?? { kind: "expired", label: p.status },
    status: p.status,
    availability: null,
    reviewNotes: null,
    rejectReason: null,
    isLocked: false,
    canBoost: false,
    canReactivate: false,
    stillAvailableAsked: false,
    deletedAt: p.deleted_at as string | null,
  }));
}

/** Cheapest priced unit — what a project shows where a listing shows its price. */
function projectPriceLabel(units: { price_from_paise: number | null }[] | null): string {
  const from = (units ?? [])
    .map((u) => u.price_from_paise)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b)[0];
  return from ? `From ${formatShortRupees(from)}` : "Price on request";
}

/**
 * A builder's projects as the MY LISTINGS manager renders them (P6 S6).
 *
 * The manager only ever read the `listings` table, so a builder — who cannot
 * post a property at all (migration 0067) — created a project, tapped "My
 * Listings" and was told "No listings yet" while the row sat in `projects`.
 * This returns those rows in the same card shape the manager already draws,
 * tagged with `subjectKind` so the screen knows which routes to open.
 *
 * Deliberately lighter than `listMyProjects`: the manager card needs a cover,
 * a title, a price line, a badge and the moderator's notes — not the amenity
 * labels, key specs and attribute groups the detail screen builds.
 */
export async function listMyProjectCards(profileId: string) {
  const { data } = await db()
    .from("projects")
    .select("id,name,status,cover_url,area_label,photo_count,review_notes,reject_reason,is_locked,created_at,project_units(price_from_paise)")
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  return ((data ?? []) as any[]).map((p) => {
    return {
      subjectKind: "project" as const,
      id: p.id,
      title: p.name,
      // Same "from the cheapest priced unit" rule the project card uses,
      // computed here rather than left for the client to reduce over.
      price: projectPriceLabel(p.project_units),
      // The two lifecycle actions a project supports. The manager reads these
      // rather than re-deriving the rule from `status`, so the sheet and the
      // endpoint can never disagree about what is allowed.
      canHide: p.status === "live",
      canUnhide: p.status === "hidden",
      areaLabel: p.area_label,
      coverUrl: p.cover_url,
      photoCount: p.photo_count ?? 0,
      badge: STATUS_BADGE[p.status] ?? { kind: "expired", label: p.status },
      status: p.status,
      // A project has no sold/rented state of its own — units are marked sold
      // individually — so the manager's availability filters never match one.
      availability: null,
      reviewNotes: p.review_notes,
      rejectReason: p.reject_reason,
      isLocked: p.is_locked,
      // Only an approved, live scheme can be boosted, exactly as for a listing.
      canBoost: p.status === "live",
      canReactivate: false,
      stillAvailableAsked: false,
      createdAt: p.created_at as string,
    };
  });
}

/**
 * A builder's projects as a VISITOR may see them (P9 S2 Projects tab).
 *
 * The visitor profile's Projects tab used to fall through to the same `listings`
 * array the Sell/Rent tab renders, so a builder's projects were nowhere on their
 * public profile and the tab silently lied — the header could say "1 Project"
 * while the tab showed five listings. This is the query behind that tab.
 *
 * `live` only, mirroring `listPublicByProfile` for listings: a project still in
 * review is not public, and the count on the same screen is computed the same
 * way, so the tab and the number can never disagree.
 */
export async function listPublicProjectsByProfile(profileId: string) {
  const { data } = await db()
    .from("projects")
    .select("*, project_units(*)")
    .eq("profile_id", profileId)
    .eq("status", "live")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const [amenityLabels, ctx] = await Promise.all([getAmenityLabels(), projectContext()]);
  return ((data ?? []) as any[]).map((p) =>
    projectDTO(p, p.project_units ?? [], amenityLabels, { defs: ctx.defs, groups: ctx.groups, type: ctx.forRow(p), amenityMeta: ctx.amenityMeta }));
}

/**
 * Project detail. Numbers are always public here by design (Doc2 §6), so unlike
 * a listing there is no contact-withholding branch.
 */
export async function getProject(id: string, viewerId: string | null) {
  const { data } = await db().from("projects").select("*, project_units(*)").eq("id", id).maybeSingle();
  const p = data as any | null;
  if (!p || p.deleted_at) return null;

  const isOwner = viewerId !== null && p.profile_id === viewerId;
  // Same state-access matrix as listings: non-live is owner-only.
  if (p.status !== "live" && !isOwner) return null;

  // Doc2 §6: a builder's number is ALWAYS public for a project. Projects carry
  // no contact column of their own, so the public number is the builder's
  // profile phone — surfaced here so the detail bar's Call/WhatsApp are real.
  const { data: poster } = await db()
    .from("profiles")
    .select("phone,name")
    .eq("id", p.profile_id)
    .maybeSingle();

  const [amenityLabels, ctx, builder] = await Promise.all([getAmenityLabels(), projectContext(), posterCard(p.profile_id)]);
  return {
    ...projectDTO(p, p.project_units ?? [], amenityLabels, { defs: ctx.defs, groups: ctx.groups, type: ctx.forRow(p), amenityMeta: ctx.amenityMeta }),
    isOwner,
    /**
     * The builder, as the feed card already names them. `builderName` was read
     * by the detail screen from the first day and has never been in this
     * payload, so "by <builder>" simply never rendered — the one line that
     * tells a buyer whose scheme this is.
     */
    builder,
    builderName: builder?.name ?? null,
    // The builder's profile id. Needed to write a lead against them when a
    // viewer taps Call/WhatsApp, and no more sensitive than the poster id the
    // feed already publishes on every card.
    profileId: p.profile_id,
    contact: (poster as { phone?: string | null } | null)?.phone
      ? { number: (poster as { phone: string }).phone, name: (poster as { name?: string | null }).name ?? null }
      : null,
    pincode: p.pincode ?? null,
    brochureScanned: p.brochure_scanned,
    // Owner-only: the raw values the edit form re-opens on. The public payload
    // carries labels (`rera`, `areaLabel`), not the location ids.
    ...(isOwner
      ? {
          owner: {
            // The moderator's words, and the counters behind the lock. Same
            // owner-only treatment a listing gives them — a visitor never sees
            // why a project was sent back.
            reviewNotes: p.review_notes,
            rejectReason: p.reject_reason,
            rejectCount: p.reject_count,
            isLocked: p.is_locked,
            editedSinceApproval: p.edited_since_approval,
            reraNumber: p.rera_number,
            reraExempt: p.rera_exempt,
            reraExemptReason: p.rera_exempt_reason,
            stateId: p.state_id,
            districtId: p.district_id,
            talukaId: p.taluka_id,
            cityId: p.city_id,
            areaId: p.area_id,
          },
        }
      : {}),
  };
}

export async function updateProjectUnits(projectId: string, profileId: string, units: { id: string; available: boolean }[]) {
  // Ownership is checked once on the parent, not per unit row.
  const { data } = await db().from("projects").select("id").eq("id", projectId).eq("profile_id", profileId).maybeSingle();
  if (!data) return false;
  for (const u of units.slice(0, 40)) {
    await db().from("project_units").update({ available: u.available === true }).eq("id", u.id).eq("project_id", projectId);
  }
  return true;
}

function projectDTO(
  p: any,
  units: any[],
  amenityLabels?: Map<string, string>,
  extra?: {
    defs?: FieldDefinitionRow[];
    groups?: { key: string; label: string; icon?: string | null; tone?: string | null }[];
    type?: ProjectTypeRow | null;
    amenityMeta?: Map<string, { label: string; icon: string | null; category: string | null }>;
  },
) {
  // Titled for a SCHEME, not for a flat (0072): a project's launch date + OC +
  // BU permission are "Approvals & timeline", and its booking amount is its own
  // "Booking & payment" section rather than a building fact.
  const attrGroups = projectAttributeGroups(
    p.attributes ?? {}, extra?.type ?? null, extra?.defs,
    scopedGroups(extra?.groups, { kind: "project", category: extra?.type?.category }),
  );

  // Cheapest unit — what a project card shows where a listing shows its price.
  const from = (units ?? [])
    .map((u) => u.price_from_paise)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b)[0];

  return {
    // Projects live on the same `listing_state` enum as listings, so they carry
    // the same badge rather than a parallel one (designs/P9 S1 Projects tab).
    badge: STATUS_BADGE[p.status] ?? { kind: "expired", label: p.status },
    priceFrom: from ? formatShortRupees(from) : null,
    // The label comes from `field_definitions.build_status` options — the same
    // row the form renders its chips from. It used to be a second copy of those
    // three strings in here, so renaming one renamed it in only one place.
    buildStatusLabel: p.build_status
      ? optionLabel(extra?.defs, "build_status", p.build_status)
      : null,
    possessionLabel: p.possession_date
      ? new Date(p.possession_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      : null,
    id: p.id,
    name: p.name,
    status: p.status,
    // Same rule for the exemption reason: a stored code, rendered through its
    // option label. It used to be free text typed into the row.
    rera: p.rera_exempt
      ? { exempt: true as const, reason: optionLabel(extra?.defs, "rera_exempt_reason", p.rera_exempt_reason) }
      : { exempt: false as const, number: p.rera_number },
    projectType: p.project_type ?? null,
    projectTypeLabel: extra?.type?.label ?? null,
    /** Type-specific answers, rendered in the same titled blocks a listing uses. */
    attributeGroups: attrGroups,
    /**
     * The facts strip, from `project_types.field_config.key_specs` (0071).
     *
     * It used to be computed inside the detail COMPONENT — four hardcoded
     * facts (towers / floors / total units / available), which is the client
     * deriving business values CLAUDE.md rule 7 bans, and which drew empty
     * tiles on a plotting scheme that has no towers and no floors. The four
     * `source: 'column'` candidates are merged in so a config entry can name a
     * column or an attribute without the screen knowing the difference.
     */
    keySpecs: topUpSpecs(
      resolveKeySpecs(
        extra?.type?.field_config?.key_specs,
        {
          ...((p.attributes ?? {}) as Record<string, unknown>),
          towers: p.towers,
          floors: p.floors,
          total_units: p.total_units,
          available_units: p.available_units,
        },
        extra?.defs,
      ),
      attrGroups.flatMap((g) => g.rows),
      extra?.groups,
    ),
    /** The raw map, so the edit form can re-open its controls on real values. */
    attributes: (p.attributes ?? {}) as Record<string, unknown>,
    buildStatus: p.build_status,
    possessionDate: p.possession_date,
    towers: p.towers,
    floors: p.floors,
    totalUnits: p.total_units,
    availableUnits: p.available_units,
    bankApprovals: p.bank_approvals ?? [],
    // Labels, not stored codes — same rule as the listing detail DTO.
    amenities: (p.amenities ?? []).map((a: string) => amenityLabels?.get(a) ?? a),
    /** The same list with icons (migration 0070), for the tile grid. */
    amenityItems: (p.amenities ?? []).map((a: string) => ({
      code: a,
      label: extra?.amenityMeta?.get(a)?.label ?? amenityLabels?.get(a) ?? a,
      icon: extra?.amenityMeta?.get(a)?.icon ?? null,
      category: extra?.amenityMeta?.get(a)?.category ?? null,
    })),
    description: p.description,
    areaLabel: p.area_label,
    pincode: p.pincode ?? null,
    coverUrl: p.cover_url,
    /** The "12 photos" marker on the project row — the row's own counter. */
    photoCount: p.photo_count ?? 0,
    /** "12 Jul 2026" — the detail screen prints when the scheme was posted. */
    postedOn: p.live_at || p.created_at
      ? new Date(p.live_at ?? p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
      : null,
    /** Whether a brochure is attached at all — the URL is signed separately. */
    hasBrochure: Boolean(p.brochure_key),
    units: (units ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((u) => ({
        id: u.id,
        unitType: u.unit_type,
        areaSqft: u.area_sqft,
        carpetSqft: u.carpet_sqft,
        unitsAvailable: u.units_available,
        priceFrom: u.price_from_paise ? formatShortRupees(u.price_from_paise) : null,
        priceFromPaise: u.price_from_paise ?? null,
        floorPlanUrl: u.floor_plan_url,
        available: u.available,
      })),
  };
}
