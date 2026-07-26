import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { notify } from "@/lib/notifications/service";

/**
 * Boost subjects, targeting and the admin decision (Doc2 §13).
 *
 * Module 3 built the money half — checkout, `pending_approval`, the refund
 * sweep. This is the half that was missing:
 *
 *   · a boost can be a LISTING, a PROJECT or a REQUIREMENT (Doc2 §13; the
 *     requirement case is §9.2's "locked-but-top"), so eligibility, labels and
 *     the picker all have to be subject-aware rather than listings-only;
 *   · targeting has to resolve to real location ids at purchase time, because
 *     placement (lib/billing/placement.ts) matches those ids against the
 *     viewer — a text `target_label` can't rank anything;
 *   · APPROVAL. `pending_approval` → `active` had no code anywhere, so every
 *     paid boost died in the 48h timeout. `approveBoost` is that step, and it
 *     re-checks eligibility at the moment of approval (Doc2 §13 "race sealed"):
 *     a listing that went sold/hidden while it waited is rejected + refunded
 *     instead of quietly going live.
 *
 * Nothing here trusts a caller-supplied label, price or window. The duration
 * comes from the boost row (which came from the catalog), the geography from
 * the subject, and the money from the payment.
 */

const db = () => createServiceClient();

export type BoostSubjectKind = "listing" | "project" | "requirement";
export type BoostTargeting = "area" | "city" | "state" | "india";

export const SUBJECT_KINDS: BoostSubjectKind[] = ["listing", "project", "requirement"];
export const TARGETINGS: BoostTargeting[] = ["area", "city", "state", "india"];

const TABLE: Record<BoostSubjectKind, string> = {
  listing: "listings",
  project: "projects",
  requirement: "requirements",
};

// ---------------------------------------------------------------------------
// Subject resolution + eligibility
// ---------------------------------------------------------------------------

export interface BoostSubject {
  kind: BoostSubjectKind;
  id: string;
  title: string;
  priceLabel: string;
  coverUrl: string | null;
  areaId: string | null;
  areaLabel: string | null;
  cityId: string | null;
  stateId: string | null;
  /** server verdict — the ONLY thing checkout and approval trust */
  eligible: boolean;
  /** why not, for the design's dimmed lock chip */
  lockLabel: string | null;
}

const STATUS_LOCK: Record<string, string> = {
  pending_review: "Under review",
  changes_requested: "Changes requested",
  hidden: "Hidden",
  archived: "Archived",
  rejected: "Rejected",
  draft: "Draft",
  expired: "Expired",
  paused: "Paused",
};
const AVAIL_LOCK: Record<string, string> = { sold: "Sold", rented: "Rented", completed: "Completed" };

/**
 * Read one subject as a boost candidate, scoped to its OWNER. A subject id from
 * another account resolves to null rather than to a real title, so the picker
 * and the checkout can't be used to read someone else's data (Doc9 §API1).
 */
export async function getBoostSubject(
  profileId: string,
  kind: BoostSubjectKind,
  id: string,
): Promise<BoostSubject | null> {
  if (!SUBJECT_KINDS.includes(kind)) return null;

  if (kind === "listing") {
    const { data } = await db()
      .from("listings")
      .select("id,title,price_paise,price_on_request,area_id,area_label,city_id,state_id,cover_url,status,availability,deleted_at")
      .eq("id", id).eq("profile_id", profileId).maybeSingle();
    return data ? listingSubject(data as Record<string, any>) : null;
  }

  if (kind === "project") {
    const { data } = await db()
      .from("projects")
      .select("id,name,area_id,area_label,city_id,state_id,cover_url,status,deleted_at")
      .eq("id", id).eq("profile_id", profileId).maybeSingle();
    return data ? projectSubject(data as Record<string, any>) : null;
  }

  const { data } = await db()
    .from("requirements")
    .select("id,type_code,bhk,kind,budget_min_paise,budget_max_paise,area_ids,area_label,city_id,status,is_active,deleted_at")
    .eq("id", id).eq("profile_id", profileId).maybeSingle();
  return data ? await requirementSubject(data as Record<string, any>) : null;
}

function listingSubject(l: Record<string, any>): BoostSubject {
  const eligible = l.status === "live" && l.availability === "available" && !l.deleted_at;
  return {
    kind: "listing",
    id: l.id,
    title: l.title ?? l.area_label ?? "Listing",
    priceLabel: l.price_on_request || l.price_paise === null ? "Price on request" : formatShortRupees(l.price_paise),
    coverUrl: l.cover_url ?? null,
    areaId: l.area_id ?? null,
    areaLabel: l.area_label ?? null,
    cityId: l.city_id ?? null,
    stateId: l.state_id ?? null,
    eligible,
    lockLabel: eligible ? null : (AVAIL_LOCK[l.availability] ?? STATUS_LOCK[l.status] ?? "Not eligible"),
  };
}

function projectSubject(p: Record<string, any>): BoostSubject {
  const eligible = p.status === "live" && !p.deleted_at;
  return {
    kind: "project",
    id: p.id,
    title: p.name ?? "Project",
    priceLabel: "Project",
    coverUrl: p.cover_url ?? null,
    areaId: p.area_id ?? null,
    areaLabel: p.area_label ?? null,
    cityId: p.city_id ?? null,
    stateId: p.state_id ?? null,
    eligible,
    lockLabel: eligible ? null : (STATUS_LOCK[p.status] ?? "Not eligible"),
  };
}

/**
 * Requirements carry `area_ids[]` (multi-area) and no `state_id`. The first area
 * is the anchor for `area` targeting and the state is walked up from the city,
 * so a requirement boost can be targeted exactly like a listing one.
 *
 * `is_active` matters as much as `status`: a requirement toggled OFF is not in
 * anybody's browse list, so boosting it would be selling placement for
 * something invisible.
 */
async function requirementSubject(r: Record<string, any>): Promise<BoostSubject> {
  const eligible = r.status === "live" && r.is_active === true && !r.deleted_at;
  const areaId = (r.area_ids ?? [])[0] ?? null;
  // `requirements.city_id` is nullable and some live rows have it empty. Without
  // this fallback, targeting resolved to all-nulls and the boost placed nowhere —
  // paid-for placement that silently reaches no one.
  const cityId = r.city_id ?? (areaId ? await parentOf(areaId) : null);
  const summary = [r.bhk ? `${r.bhk} BHK` : null, r.kind === "rent" ? "Rent" : "Buy", r.area_label ? `${r.area_label} area` : null]
    .filter(Boolean).join(" · ");
  return {
    kind: "requirement",
    id: r.id,
    title: summary || "Requirement",
    priceLabel: budgetLabel(r.budget_min_paise, r.budget_max_paise),
    coverUrl: null,
    areaId,
    areaLabel: r.area_label ?? null,
    cityId,
    stateId: cityId ? await stateOfCity(cityId) : null,
    eligible,
    lockLabel: eligible ? null : (r.is_active === false ? "Turned off" : STATUS_LOCK[r.status] ?? "Not eligible"),
  };
}

async function parentOf(locationId: string): Promise<string | null> {
  freshLocationCache();
  const hit = parentCache.get(locationId);
  if (hit !== undefined) return hit;
  const { data } = await db().from("locations").select("parent_id").eq("id", locationId).maybeSingle();
  const parent = (data as { parent_id: string | null } | null)?.parent_id ?? null;
  parentCache.set(locationId, parent);
  return parent;
}

function budgetLabel(min: number | null, max: number | null): string {
  if (min && max) return `${formatShortRupees(min)} – ${formatShortRupees(max)}`;
  if (max) return `Up to ${formatShortRupees(max)}`;
  if (min) return `${formatShortRupees(min)}+`;
  return "Budget not set";
}

/**
 * Walk `locations` upward from a city to its state. The tree is
 * state → district → taluka → city → area, so this is a bounded climb rather
 * than a single parent read (the first version read one level and got the
 * taluka, which meant state targeting matched nothing).
 */
export async function stateOfCity(cityId: string): Promise<string | null> {
  freshLocationCache();
  const hit = stateCache.get(cityId);
  if (hit !== undefined) return hit;
  let cursor: string | null = cityId;
  for (let i = 0; i < 6 && cursor; i++) {
    const { data } = await db().from("locations").select("id,level,parent_id").eq("id", cursor).maybeSingle();
    const row = data as { id: string; level: string; parent_id: string | null } | null;
    if (!row) break;
    if (row.level === "state") { stateCache.set(cityId, row.id); return row.id; }
    cursor = row.parent_id;
  }
  stateCache.set(cityId, null);
  return null;
}

/** Every subject this user could boost — listings, projects and requirements. */
export async function listBoostSubjects(profileId: string): Promise<BoostSubject[]> {
  const [listings, projects, requirements] = await Promise.all([
    db().from("listings")
      .select("id,title,price_paise,price_on_request,area_id,area_label,city_id,state_id,cover_url,status,availability,deleted_at")
      .eq("profile_id", profileId).is("deleted_at", null)
      .in("status", ["live", "pending_review", "hidden", "archived"])
      .order("created_at", { ascending: false }).limit(30),
    db().from("projects")
      .select("id,name,area_id,area_label,city_id,state_id,cover_url,status,deleted_at")
      .eq("profile_id", profileId).is("deleted_at", null)
      .in("status", ["live", "pending_review", "hidden"])
      .order("created_at", { ascending: false }).limit(20),
    db().from("requirements")
      .select("id,type_code,bhk,kind,budget_min_paise,budget_max_paise,area_ids,area_label,city_id,status,is_active,deleted_at")
      .eq("profile_id", profileId).is("deleted_at", null)
      .in("status", ["live", "pending_review"])
      .order("created_at", { ascending: false }).limit(20),
  ]);

  const out: BoostSubject[] = [
    ...((listings.data ?? []) as Record<string, any>[]).map(listingSubject),
    ...((projects.data ?? []) as Record<string, any>[]).map(projectSubject),
    ...(await Promise.all(((requirements.data ?? []) as Record<string, any>[]).map(requirementSubject))),
  ];
  // Eligible first (the design preselects the first eligible card), then the
  // dimmed/locked ones.
  return out.sort((a, b) => Number(b.eligible) - Number(a.eligible));
}

/** Checkout + webhook + approval all funnel through this one verdict. */
export async function isBoostSubjectEligible(
  profileId: string,
  kind: BoostSubjectKind,
  id: string,
): Promise<boolean> {
  try {
    const s = await getBoostSubject(profileId, kind, id);
    return !!s?.eligible;
  } catch {
    return false; // fail closed
  }
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

export interface ResolvedTarget {
  targeting: BoostTargeting;
  label: string;
  areaId: string | null;
  cityId: string | null;
  stateId: string | null;
}

/**
 * Turn the buyer's chosen scope into the ids placement compares against, plus
 * the label the design shows ("Whole city — Rajkot", not "City").
 *
 * The label is BUILT HERE from the locations table, never taken from the
 * request body: the old checkout accepted `targetLabel` from the client, which
 * meant a boost could claim any reach it liked on the status screen.
 */
export async function resolveTarget(subject: BoostSubject, targeting: BoostTargeting): Promise<ResolvedTarget> {
  // A scope we cannot resolve to an id is a scope we cannot place. Selling it
  // would take money for a boost that reaches nobody, so it falls back to the
  // widest scope that IS resolvable rather than silently storing nulls.
  if (targeting === "area" && !subject.areaId) targeting = subject.cityId ? "city" : subject.stateId ? "state" : "india";
  if (targeting === "city" && !subject.cityId) targeting = subject.stateId ? "state" : "india";
  if (targeting === "state" && !subject.stateId) targeting = "india";

  const [areaName, cityName, stateName] = await Promise.all([
    subject.areaId ? locationName(subject.areaId) : Promise.resolve(null),
    subject.cityId ? locationName(subject.cityId) : Promise.resolve(null),
    subject.stateId ? locationName(subject.stateId) : Promise.resolve(null),
  ]);

  if (targeting === "area") {
    const label = [areaName ?? subject.areaLabel, cityName].filter(Boolean).join(", ") || "This area";
    return { targeting, label, areaId: subject.areaId, cityId: subject.cityId, stateId: subject.stateId };
  }
  if (targeting === "city") {
    return { targeting, label: cityName ?? "Your city", areaId: null, cityId: subject.cityId, stateId: subject.stateId };
  }
  if (targeting === "state") {
    return { targeting, label: stateName ?? "Your state", areaId: null, cityId: null, stateId: subject.stateId };
  }
  return { targeting, label: "All India", areaId: null, cityId: null, stateId: null };
}

/**
 * Location lookups are memoised for the life of the process.
 *
 * `resolveTarget` reads three names, and the boost picker calls it for four
 * scopes on every subject — 12 reads per card, so a broker with 25 listings was
 * making ~300 sequential round-trips and the screen sat on its skeleton for
 * seconds. The `locations` master is small and effectively static (Module 4's
 * admin master-data screen is the only writer), so caching names and the
 * city→state climb turns that into a handful of queries.
 */
const LOCATION_TTL_MS = 5 * 60_000;
let locationCacheAt = Date.now();
const nameCache = new Map<string, string | null>();
const stateCache = new Map<string, string | null>();
const parentCache = new Map<string, string | null>();

/**
 * Expire the whole set every few minutes. The admin master-data screen can rename
 * or re-parent a location, and a permanently-cached name would keep a renamed area
 * on boost cards until the next deploy. Only PUBLIC location master data is ever
 * held here — never anything per-user — so a shared process-wide map is safe.
 */
function freshLocationCache() {
  if (Date.now() - locationCacheAt < LOCATION_TTL_MS) return;
  nameCache.clear();
  stateCache.clear();
  parentCache.clear();
  locationCacheAt = Date.now();
}

async function locationName(id: string): Promise<string | null> {
  freshLocationCache();
  const hit = nameCache.get(id);
  if (hit !== undefined) return hit;
  const { data } = await db().from("locations").select("name").eq("id", id).maybeSingle();
  const name = (data as { name: string } | null)?.name ?? null;
  nameCache.set(id, name);
  return name;
}

// ---------------------------------------------------------------------------
// The admin decision (Doc2 §13: "Admin-approved post-payment")
// ---------------------------------------------------------------------------

export interface BoostQueueRow {
  id: string;
  boostId: string;
  subjectKind: BoostSubjectKind;
  subjectId: string;
  subjectTitle: string;
  ownerName: string | null;
  price: string;
  durationLabel: string;
  targetLabel: string;
  paidAt: string | null;
  createdAt: string;
  /** the eligibility checks the P13-15 boost panel lists */
  checks: { label: string; pass: boolean }[];
}

/** The pending-approval queue, oldest first (review is FIFO). */
export async function boostQueue(limit = 50): Promise<BoostQueueRow[]> {
  const { data } = await db()
    .from("boosts")
    .select("*")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as Record<string, any>[];
  const out: BoostQueueRow[] = [];

  for (const b of rows) {
    const subject = await getBoostSubject(b.profile_id, b.subject_kind, b.listing_id);
    const { data: prof } = await db().from("profiles").select("name").eq("id", b.profile_id).maybeSingle();
    const { data: pay } = await db()
      .from("payments").select("status,created_at").eq("order_id", b.order_id ?? "").eq("status", "success").maybeSingle();
    const cap = await cityCapUsage(b.target_city_id);

    out.push({
      id: b.id,
      boostId: b.id,
      subjectKind: b.subject_kind,
      subjectId: b.listing_id,
      subjectTitle: subject?.title ?? "(no longer available)",
      ownerName: (prof as { name: string | null } | null)?.name ?? null,
      price: `₹${(b.price_paise / 100).toLocaleString("en-IN")}`,
      durationLabel: b.duration_days >= 30 ? "1 Month" : `${b.duration_days} Days`,
      targetLabel: b.target_label,
      paidAt: (pay as { created_at: string } | null)?.created_at ?? null,
      createdAt: b.created_at,
      checks: [
        { label: `${labelForKind(b.subject_kind)} is live`, pass: !!subject?.eligible },
        { label: "Payment verified", pass: !!pay },
        { label: `City boost cap: ${cap.used} of ${cap.cap} used`, pass: cap.used < cap.cap },
      ],
    });
  }
  return out;
}

function labelForKind(kind: BoostSubjectKind): string {
  return kind === "requirement" ? "Requirement" : kind === "project" ? "Project" : "Listing";
}

/**
 * How many boosts are already live in a city vs the admin cap. The P13-15 boost
 * panel shows this as an eligibility check; here it is actually ENFORCED, so
 * approval refuses rather than merely displaying a red line.
 */
export async function cityCapUsage(cityId: string | null): Promise<{ used: number; cap: number }> {
  // Read `billing_settings` directly rather than importing service.ts's
  // getSettings — service.ts imports this module (the webhook re-check), and a
  // cycle between the two is how you get an undefined function at runtime.
  const { data: setting } = await db().from("billing_settings").select("value").eq("key", "boost_city_cap").maybeSingle();
  const raw = Number((setting as { value: unknown } | null)?.value ?? 10);
  const cap = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
  if (!cityId) return { used: 0, cap };
  const nowIso = new Date().toISOString();
  const { count } = await db()
    .from("boosts")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("target_city_id", cityId)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  return { used: count ?? 0, cap };
}

export type BoostDecision =
  | { ok: true; status: "active"; startsAt: string; endsAt: string; queuedAfter: string | null }
  | { ok: true; status: "rejected"; reason: string }
  | { ok: true; status: "paused" | "active_resumed" | "stopped" }
  | { ok: false; reason: "not_found" | "bad_state" | "ineligible" | "city_cap" | "validation" };

/**
 * Approve → the boost goes LIVE.
 *
 * Three things make this safe to expose to a human clicking fast:
 *
 *  1. The status predicate is in the UPDATE, so two moderators approving the
 *     same boost produce one winner and one `bad_state` — the window can't be
 *     doubled.
 *  2. Eligibility is re-read HERE. This is the other half of Doc2 §13's "race
 *     sealed": the webhook checked at payment time, and between then and now the
 *     seller may have marked the listing sold. Approving that would sell
 *     placement for something nobody can buy, so it is rejected + refunded
 *     instead (the hourly sweep does the money).
 *  3. CONSECUTIVE QUEUEING (Doc2 §13). If the subject already has a live boost,
 *     this one starts when that one ends instead of overlapping — otherwise
 *     buying two boosts back-to-back would burn both windows at once.
 */
export async function approveBoost(boostId: string, actorId: string): Promise<BoostDecision> {
  const { data } = await db().from("boosts").select("*").eq("id", boostId).maybeSingle();
  const boost = data as Record<string, any> | null;
  if (!boost) return { ok: false, reason: "not_found" };
  if (boost.status !== "pending_approval") return { ok: false, reason: "bad_state" };

  // (2) re-check eligibility at the moment of approval
  if (!(await isBoostSubjectEligible(boost.profile_id, boost.subject_kind, boost.listing_id))) {
    await rejectBoost(boostId, actorId, `${labelForKind(boost.subject_kind)} is no longer live — automatically refunded`);
    return { ok: false, reason: "ineligible" };
  }

  // (3) city cap
  const cap = await cityCapUsage(boost.target_city_id);
  if (cap.used >= cap.cap) return { ok: false, reason: "city_cap" };

  // (4) consecutive queueing — start after any boost already running on this subject
  const nowIso = new Date().toISOString();
  const { data: running } = await db()
    .from("boosts")
    .select("ends_at")
    .eq("listing_id", boost.listing_id)
    .in("status", ["active", "paused"])
    .not("ends_at", "is", null)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const runningEnd = (running as { ends_at: string } | null)?.ends_at ?? null;
  const startsAt = runningEnd && runningEnd > nowIso ? runningEnd : nowIso;
  const endsAt = new Date(new Date(startsAt).getTime() + boost.duration_days * 86_400_000).toISOString();

  const { data: updated } = await db()
    .from("boosts")
    .update({
      status: "active",
      approved_at: nowIso,
      approved_by: actorId,
      starts_at: startsAt,
      ends_at: endsAt,
      reject_reason: null,
    })
    .eq("id", boostId)
    .eq("status", "pending_approval") // (1) concurrency guard
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: false, reason: "bad_state" };

  await logReview(boostId, actorId, "approve", null);

  // Doc2 §14 event catalog: "boost approval/active".
  const queued = startsAt !== nowIso;
  await notify({
    profileId: boost.profile_id,
    type: "boost_approved",
    title: queued ? "Your boost is approved and queued" : "Your boost is live",
    body: queued
      ? `It starts when your current boost ends, and runs till ${dateLabel(endsAt)}.`
      : `Running till ${dateLabel(endsAt)} · ${boost.target_label}`,
    data: { boostId, subjectKind: boost.subject_kind, subjectId: boost.listing_id, deepLink: "/boost" },
  });

  return { ok: true, status: "active", startsAt, endsAt, queuedAfter: queued ? startsAt : null };
}

/**
 * Reject → full refund. The money is NOT moved here: marking the boost
 * `rejected` with `refunded_at` still null is exactly what the hourly sweep in
 * lib/billing/reconcile.ts claims and refunds, single-flight (migration 0011).
 * Doing the Razorpay call inline as well would be the second refunder that
 * migration was written to prevent.
 *
 * ONLY from `pending_approval`, and that limit is the point. Reject means "this
 * never should have run", so it refunds the whole amount — applying it to a boost
 * 20 days into a 30-day window would refund ₹1,499 for placement that was
 * delivered. An already-live boost is ended with `stopBoost` (no refund, Doc2
 * §13's fraud case) or held with `pauseBoost`, which is also exactly the split the
 * P13-15 panel draws: "Reject & refund" on a queued boost, "Pause boost" on a
 * running one.
 */
export async function rejectBoost(boostId: string, actorId: string, reason: string): Promise<BoostDecision> {
  const clean = (reason ?? "").trim().slice(0, 300);
  if (clean.length < 3) return { ok: false, reason: "validation" };

  const { data } = await db()
    .from("boosts")
    .update({ status: "rejected", reject_reason: clean })
    .eq("id", boostId)
    .eq("status", "pending_approval")
    .select("id,profile_id,price_paise,subject_kind")
    .maybeSingle();
  const row = data as { id: string; profile_id: string; price_paise: number; subject_kind: string } | null;
  if (!row) return { ok: false, reason: "bad_state" };

  await logReview(boostId, actorId, "reject", clean);
  await notify({
    profileId: row.profile_id,
    type: "boost_rejected",
    title: "Your boost wasn't approved",
    body: `${clean} · ₹${(row.price_paise / 100).toLocaleString("en-IN")} is being refunded (5–7 days).`,
    data: { boostId, deepLink: "/boost" },
  });
  return { ok: true, status: "rejected", reason: clean };
}

/**
 * Kill a LIVE boost without refunding it — Doc2 §13's "fraud → no refund".
 *
 * The counterpart to `rejectBoost`: reject is for a boost that never ran and
 * returns everything; stop is for one that did and returns nothing. `stopped` is
 * also the state the sold-mid-boost path uses, so the P11 past card already reads
 * "No refund for unused days" and the refund sweep already ignores it — no new
 * money path is introduced.
 */
export async function stopBoost(boostId: string, actorId: string, reason: string): Promise<BoostDecision> {
  const clean = (reason ?? "").trim().slice(0, 300);
  if (clean.length < 3) return { ok: false, reason: "validation" };

  const { data } = await db()
    .from("boosts")
    .update({ status: "stopped", stopped_reason: clean, paused_at: null })
    .eq("id", boostId)
    .in("status", ["active", "paused"])
    .select("id,profile_id")
    .maybeSingle();
  const row = data as { id: string; profile_id: string } | null;
  if (!row) return { ok: false, reason: "bad_state" };

  await logReview(boostId, actorId, "auto_stop", clean);
  await notify({
    profileId: row.profile_id,
    type: "boost_stopped",
    title: "Your boost was stopped",
    body: `${clean}. Unused days aren't refunded — see the Refund Policy.`,
    data: { boostId, deepLink: "/boost" },
  });
  return { ok: true, status: "stopped" };
}

/**
 * Admin-hide → pause (Doc2 §13). A paused boost stops being placed anywhere
 * (placement only reads `active`) but keeps its window, so resuming extends
 * `ends_at` by exactly the paused duration — the buyer loses no days to a
 * moderation hold that turned out to be nothing.
 */
export async function pauseBoost(boostId: string, actorId: string, reason: string | null): Promise<BoostDecision> {
  const { data } = await db()
    .from("boosts")
    .update({ status: "paused", paused_at: new Date().toISOString(), stopped_reason: reason?.slice(0, 300) ?? "Paused by admin" })
    .eq("id", boostId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, reason: "bad_state" };
  await logReview(boostId, actorId, "pause", reason ?? null);
  return { ok: true, status: "paused" };
}

export async function resumeBoost(boostId: string, actorId: string | null): Promise<BoostDecision> {
  const { data } = await db().from("boosts").select("*").eq("id", boostId).maybeSingle();
  const boost = data as Record<string, any> | null;
  if (!boost) return { ok: false, reason: "not_found" };
  if (boost.status !== "paused") return { ok: false, reason: "bad_state" };

  // Give back the days the pause ate.
  const pausedMs = boost.paused_at ? Date.now() - new Date(boost.paused_at).getTime() : 0;
  const endsAt = boost.ends_at
    ? new Date(new Date(boost.ends_at).getTime() + Math.max(pausedMs, 0)).toISOString()
    : null;

  const { data: updated } = await db()
    .from("boosts")
    .update({ status: "active", paused_at: null, stopped_reason: null, ends_at: endsAt })
    .eq("id", boostId)
    .eq("status", "paused")
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: false, reason: "bad_state" };

  await logReview(boostId, actorId, "resume", null);
  return { ok: true, status: "active_resumed" };
}

// ---------------------------------------------------------------------------
// Subject lifecycle → boost lifecycle
// ---------------------------------------------------------------------------

/**
 * The subject stopped being placeable (sold / rented / completed / deleted), so
 * its boosts stop. Doc2 §13: "Sold mid-boost → stop, no refund (T&C)".
 *
 * The important distinction — and the bug this replaces — is between a boost
 * that RAN and one that never did:
 *
 *   active | paused        → `stopped`, no refund. Placement was delivered; the
 *                            unused days genuinely aren't refundable, and the
 *                            P11 past-card says exactly that.
 *   pending_approval       → `cancelled`, WHICH REFUNDS. This boost was paid for
 *                            and never went live for a single minute. The three
 *                            call sites all used to mark it `stopped` too, which
 *                            (a) kept ₹1,499 for nothing and (b) put it in a
 *                            state the refund sweep doesn't look at, so nothing
 *                            downstream would ever have caught it.
 *   pending_payment        → left alone; no money was captured.
 *
 * `cancelled` is deliberately the same state the user's own "Cancel and refund"
 * button produces, so the existing single-flight refund sweep (migration 0011)
 * handles the money with no second refunder.
 */
export async function stopBoostsForSubject(subjectId: string, reason: string): Promise<{ stopped: number; refunding: number }> {
  const { data: stopped } = await db()
    .from("boosts")
    .update({ status: "stopped", stopped_reason: reason.slice(0, 300) })
    .eq("listing_id", subjectId)
    .in("status", ["active", "paused"])
    .select("id,profile_id");

  const { data: refunding } = await db()
    .from("boosts")
    .update({
      status: "cancelled",
      stopped_reason: `${reason.slice(0, 240)} before it went live — refunded in full`,
    })
    .eq("listing_id", subjectId)
    .eq("status", "pending_approval")
    .select("id,profile_id,price_paise");

  for (const b of (stopped ?? []) as { id: string; profile_id: string }[]) {
    await logReview(b.id, null, "auto_stop", reason.slice(0, 300));
    await notify({
      profileId: b.profile_id,
      type: "boost_stopped",
      title: "Your boost stopped",
      body: `${reason.slice(0, 160)}. Unused days aren't refunded — see the Refund Policy.`,
      data: { boostId: b.id, deepLink: "/boost" },
    });
  }
  for (const b of (refunding ?? []) as { id: string; profile_id: string; price_paise: number }[]) {
    await logReview(b.id, null, "auto_stop", `${reason.slice(0, 240)} before approval — refunding`);
    await notify({
      profileId: b.profile_id,
      type: "boost_stopped",
      title: "Your boost was cancelled and refunded",
      body: `It never went live, so ₹${(b.price_paise / 100).toLocaleString("en-IN")} is being refunded (5–7 days).`,
      data: { boostId: b.id, deepLink: "/boost" },
    });
  }

  return { stopped: (stopped ?? []).length, refunding: (refunding ?? []).length };
}

/**
 * The subject went out of view without ending (hidden). Pausing rather than
 * stopping is the honest handling: nothing is being placed, so the buyer should
 * not lose days for it, and resuming hands those days back (`resumeBoost`
 * extends `ends_at` by the paused duration).
 *
 * Doc2 §13 names admin-hide explicitly; an owner hiding their own listing has
 * the identical consequence — the listing is out of the feed either way — so it
 * takes the same path.
 */
export async function pauseBoostsForSubject(subjectId: string, reason: string): Promise<number> {
  const { data } = await db()
    .from("boosts")
    .update({ status: "paused", paused_at: new Date().toISOString(), stopped_reason: reason.slice(0, 300) })
    .eq("listing_id", subjectId)
    .eq("status", "active")
    .select("id");
  for (const b of (data ?? []) as { id: string }[]) await logReview(b.id, null, "pause", reason.slice(0, 300));
  return (data ?? []).length;
}

/** The subject is live again → resume every boost that was paused for it. */
export async function resumeBoostsForSubject(subjectId: string): Promise<number> {
  const { data } = await db().from("boosts").select("id").eq("listing_id", subjectId).eq("status", "paused");
  let n = 0;
  for (const b of (data ?? []) as { id: string }[]) {
    const res = await resumeBoost(b.id, null); // system action, not a person
    if (res.ok) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Expiry → the 1-tap renew notice (Doc2 §13 / §14)
// ---------------------------------------------------------------------------

/**
 * Tell the owner their boost is about to end, with the Renew action attached.
 *
 * This is the job behind P11's "Your boost ends tomorrow · Renew in 1 tap" — the
 * banner was previously computed on read (`daysLeft <= 1`), so it only existed
 * while the user was already on the boost screen. Doc2 §13 makes renewal a
 * NOTIFICATION precisely because nothing auto-charges: with no notice, a boost
 * silently expires and the seller never gets the chance to renew.
 *
 * `boost_reminders` (migration 0040) makes it once-only — the failed insert IS
 * the "already sent" signal, so the hourly cron is safe to re-run.
 */
export async function sendBoostExpiryReminders(): Promise<number> {
  const { data: setting } = await db()
    .from("billing_settings").select("value").eq("key", "boost_expiry_notice_days").maybeSingle();
  const raw = Number((setting as { value: unknown } | null)?.value ?? 1);
  const milestone = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 30) : 1;

  const now = Date.now();
  const { data } = await db()
    .from("boosts")
    .select("id,profile_id,ends_at,price_paise,duration_days,target_label,catalog_code")
    .eq("status", "active")
    .not("ends_at", "is", null)
    .gt("ends_at", new Date(now).toISOString())
    .lte("ends_at", new Date(now + milestone * 86_400_000).toISOString());

  let sent = 0;
  for (const b of (data ?? []) as {
    id: string; profile_id: string; ends_at: string; price_paise: number;
    duration_days: number; target_label: string;
  }[]) {
    // Respect the same opt-out the My Plan reminder toggle writes.
    const { data: prefs } = await db()
      .from("notification_prefs").select("expiry_reminders").eq("profile_id", b.profile_id).maybeSingle();
    if ((prefs as { expiry_reminders: boolean } | null)?.expiry_reminders === false) continue;

    const { error } = await db().from("boost_reminders").insert({
      boost_id: b.id, profile_id: b.profile_id, milestone, ends_at: b.ends_at,
    });
    if (error) continue; // unique index → already sent

    const price = `₹${(b.price_paise / 100).toLocaleString("en-IN")}`;
    await notify({
      profileId: b.profile_id,
      type: "boost_expiring",
      title: "Your boost ends tomorrow",
      body: `${b.duration_days >= 30 ? "1 Month" : `${b.duration_days} Days`} · ${b.target_label} · ${price}`,
      // `renew` is what the notification's inline button acts on — it opens the
      // normal server-priced checkout. Nothing here charges anything.
      data: { boostId: b.id, action: "renew", price, deepLink: "/boost" },
    });
    sent++;
  }
  return sent;
}

/**
 * Boosts whose window has passed → `expired`, and the owner is told.
 *
 * Replaces the fire-and-forget UPDATE in service.ts: that one flipped the status
 * and returned nothing, so a boost could end with the seller never learning it
 * had (the Doc2 §14 catalog lists "boost expiry" as a notified event).
 */
export async function expireBoostsAndNotify(): Promise<number> {
  const { data } = await db()
    .from("boosts")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("ends_at", new Date().toISOString())
    .select("id,profile_id,target_label,subject_kind");

  const rows = (data ?? []) as { id: string; profile_id: string; target_label: string; subject_kind: string }[];
  for (const b of rows) {
    await logReview(b.id, null, "auto_expire", null);
    await notify({
      profileId: b.profile_id,
      type: "boost_expired",
      title: "Your boost has ended",
      body: `${labelForKind((b.subject_kind ?? "listing") as BoostSubjectKind)} is back to its normal position. Boost again in 1 tap.`,
      data: { boostId: b.id, action: "renew", deepLink: "/boost" },
    });
  }
  return rows.length;
}

async function logReview(boostId: string, actorId: string | null, action: string, reason: string | null) {
  await db().from("boost_reviews").insert({ boost_id: boostId, actor_id: actorId, action, reason });
}

export async function boostReviewHistory(boostId: string) {
  const { data } = await db()
    .from("boost_reviews")
    .select("action,reason,created_at,actor_id")
    .eq("boost_id", boostId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
