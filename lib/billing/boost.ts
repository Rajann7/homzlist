import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { notify } from "@/lib/notifications/service";
import { listingBrief, projectBrief, requirementBrief } from "@/lib/notifications/subjects";

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
/**
 * `area` is retained in the TYPE but not in `TARGETINGS`: boosts sold before
 * 27 Jul 2026 still carry it in `boosts.targeting` and placement must keep
 * honouring them for the rest of their window. It is simply no longer sellable.
 */
export type BoostTargeting = "area" | "city" | "state" | "india";

export const SUBJECT_KINDS: BoostSubjectKind[] = ["listing", "project", "requirement"];
/**
 * The scopes a buyer may CHOOSE: city, state, all-India. Area-only targeting was
 * removed on Rajan's instruction — three scopes, nothing narrower.
 * `resolveTarget` still maps a legacy `area` request down to the city that
 * contains it rather than rejecting it.
 */
export const TARGETINGS: BoostTargeting[] = ["city", "state", "india"];

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
  // Area-only targeting is no longer sold. A request that still asks for it
  // (an old client, a renewal of a legacy boost) is widened to the city that
  // contains the area rather than refused — the buyer gets more reach, never
  // less, and nothing can be placed into a scope the product no longer offers.
  if (targeting === "area") targeting = subject.cityId ? "city" : subject.stateId ? "state" : "india";
  // A scope we cannot resolve to an id is a scope we cannot place. Selling it
  // would take money for a boost that reaches nobody, so it falls back to the
  // widest scope that IS resolvable rather than silently storing nulls.
  if (targeting === "city" && !subject.cityId) targeting = subject.stateId ? "state" : "india";
  if (targeting === "state" && !subject.stateId) targeting = "india";

  // The area name is no longer read: with `area` gone, no sellable scope has an
  // area in its label or its ids, so a boost is never narrowed below city.
  const [cityName, stateName] = await Promise.all([
    subject.cityId ? locationName(subject.cityId) : Promise.resolve(null),
    subject.stateId ? locationName(subject.stateId) : Promise.resolve(null),
  ]);

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
  ownerId: string;
  price: string;
  pricePaise: number;
  durationLabel: string;
  durationDays: number;
  targetLabel: string;
  paidAt: string | null;
  createdAt: string;
  /** the eligibility checks the P13-15 boost panel lists */
  checks: { label: string; pass: boolean }[];
  // ---- what A6's table and detail sheet render (Doc5 A6) -------------------
  /** The boosted thing's cover, for the row thumb and the promoted-card preview. */
  coverUrl: string | null;
  /** The subject's own status — A6's "Listing" column. */
  subjectStatus: string | null;
  /** The subject's headline price, for the promoted-card preview. */
  subjectPrice: string | null;
  /** Payment identity for the payment block, and the row to deep-link to. */
  payment: { id: string | null; ref: string | null; method: string | null; verified: boolean };
  /** Hours the request has been waiting, for the SLA colour A6 shares with A3. */
  hours: number;
  /** Open reports on the boosted thing — the design's fourth eligibility check. */
  openReports: number;
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

  /**
   * Each row needs five reads (subject, poster, payment, city cap, open reports).
   * Done in a serial `for` loop that was 17 rows × 5 sequential round-trips and A6
   * took 18 seconds to paint — the N+1 rule in Doc3 §5, which this file's own
   * comments cite, broken by the reader itself.
   *
   * The rows are independent, so they resolve together. The city cap is memoised
   * across them because a queue is mostly one city and that query counts every
   * live boost in it.
   */
  const capCache = new Map<string, Promise<{ used: number; cap: number }>>();
  const capFor = (cityId: string | null) => {
    const key = cityId ?? "-";
    let p = capCache.get(key);
    if (!p) {
      p = cityCapUsage(cityId);
      capCache.set(key, p);
    }
    return p;
  };

  // Poster names, payments and open-report counts are three queries TOTAL rather
  // than three per row — the pattern lib/admin/queues.ts already uses. Only the
  // subject read stays per-row, because it is scoped to its owner by design.
  const posterIds = [...new Set(rows.map((b) => b.profile_id as string).filter(Boolean))];
  const orderIds = [...new Set(rows.map((b) => b.order_id as string).filter(Boolean))];
  const subjectIds = [...new Set(rows.map((b) => b.listing_id as string).filter(Boolean))];

  const [{ data: profs }, { data: pays }, { data: reportRows }] = await Promise.all([
    posterIds.length
      ? db().from("profiles").select("id,name").in("id", posterIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    orderIds.length
      ? db()
          .from("payments")
          .select("id,order_id,razorpay_payment_id,method,status,created_at")
          .in("order_id", orderIds)
          .eq("status", "success")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // The design's fourth eligibility check: "No active reports". It was drawn
    // but never computed, so a boost could be approved onto content that three
    // people had just reported.
    subjectIds.length
      ? db().from("reports").select("subject_type,subject_id").in("subject_id", subjectIds).in("status", ["open", "reviewing"])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const nameById = new Map(((profs ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, (p.name as string) ?? null]));
  const payByOrder = new Map(((pays ?? []) as Record<string, unknown>[]).map((p) => [p.order_id as string, p]));
  const reportCounts = new Map<string, number>();
  for (const r of (reportRows ?? []) as Record<string, unknown>[]) {
    const k = `${r.subject_type}:${r.subject_id}`;
    reportCounts.set(k, (reportCounts.get(k) ?? 0) + 1);
  }

  const out = await Promise.all(rows.map(async (b): Promise<BoostQueueRow> => {
    const [subject, cap] = await Promise.all([
      getBoostSubject(b.profile_id, b.subject_kind, b.listing_id),
      capFor(b.target_city_id),
    ]);
    const openReports = reportCounts.get(`${b.subject_kind}:${b.listing_id}`) ?? 0;

    const payment = (payByOrder.get(b.order_id as string) ?? null) as Record<string, unknown> | null;
    const posterName = nameById.get(b.profile_id as string) ?? null;
    const word = labelForKind(b.subject_kind);

    return {
      id: b.id,
      boostId: b.id,
      subjectKind: b.subject_kind,
      subjectId: b.listing_id,
      subjectTitle: subject?.title ?? "(no longer available)",
      ownerName: posterName,
      ownerId: b.profile_id,
      price: `₹${(b.price_paise / 100).toLocaleString("en-IN")}`,
      pricePaise: b.price_paise,
      durationLabel: b.duration_days >= 30 ? "1 Month" : `${b.duration_days} Days`,
      durationDays: b.duration_days,
      targetLabel: b.target_label,
      paidAt: (payment?.created_at as string) ?? null,
      createdAt: b.created_at,
      checks: [
        { label: `${word} is live`, pass: !!subject?.eligible },
        { label: "Payment verified", pass: !!payment },
        { label: openReports === 0 ? "No active reports" : `${openReports} open report${openReports === 1 ? "" : "s"}`, pass: openReports === 0 },
        { label: `City boost cap: ${cap.used} of ${cap.cap} used`, pass: cap.used < cap.cap },
      ],
      coverUrl: subject?.coverUrl ?? null,
      // `lockLabel` is the reason a subject is NOT eligible ("Under review",
      // "Sold"); when it is eligible the subject is live by definition.
      subjectStatus: subject ? (subject.eligible ? "Live" : (subject.lockLabel ?? "Not eligible")) : null,
      subjectPrice: subject?.priceLabel ?? null,
      payment: {
        id: (payment?.id as string) ?? null,
        ref: (payment?.razorpay_payment_id as string) ?? null,
        method: (payment?.method as string) ?? null,
        verified: Boolean(payment),
      },
      hours: Math.floor((Date.now() - new Date(b.created_at as string).getTime()) / 3_600_000),
      openReports,
    };
  }));
  return out;
}

function labelForKind(kind: BoostSubjectKind): string {
  return kind === "requirement" ? "Requirement" : kind === "project" ? "Project" : "Listing";
}

/**
 * The boosted thing's own name, for notification copy ("…live on 3 BHK Flat,
 * Mavdi"). `boosts.listing_id` is the subject id for every kind — the column
 * predates projects and requirements becoming boostable.
 */
async function subjectBrief(kind: BoostSubjectKind, subjectId: string | null) {
  if (kind === "project") return projectBrief(subjectId);
  if (kind === "requirement") return requirementBrief(subjectId);
  return listingBrief(subjectId);
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
    // designs/P11 S7: "Your boost is <b>live</b> on 3 BHK Flat, Mavdi".
    title: queued
      ? `Your boost is **approved and queued** on ${(await subjectBrief(boost.subject_kind, boost.listing_id)).title}`
      : `Your boost is **live** on ${(await subjectBrief(boost.subject_kind, boost.listing_id)).title}`,
    body: queued
      ? `It starts when your current boost ends, and runs till ${dateLabel(endsAt)}.`
      : `Running till ${dateLabel(endsAt)} · ${boost.target_label}`,
    data: { boostId, subjectKind: boost.subject_kind, subjectId: boost.listing_id, deepLink: "/boost" },
  });

  return { ok: true, status: "active", startsAt, endsAt, queuedAfter: queued ? startsAt : null };
}

/**
 * Payment landed on a boost whose subject is ALREADY APPROVED → start it now.
 *
 * A moderator approving a boost was never reviewing the boost: the subject had
 * already passed moderation, the money had already cleared, and the duration and
 * geography are the server's. The click added latency and a dead-end (Module 9's
 * own finding: every paid boost sat in `pending_approval` until someone came).
 * So an eligible subject — and `eligible` means live and available, i.e.
 * approved — starts its window immediately.
 *
 * The two REAL gates are kept, because they are the ones with a reason:
 *  · the city cap, which stops the feed becoming all-boost. Hitting it does NOT
 *    lose the sale — the boost falls back to `pending_approval` so a human can
 *    place it, which is the compensating path for money already captured.
 *  · consecutive queueing, so two boosts on one subject don't overlap.
 *
 * `approveBoost` above stays: legacy rows still sitting in `pending_approval`,
 * and the cap-fallback rows, are approved through it.
 */
export async function startBoostNow(boostId: string): Promise<"active" | "pending_approval"> {
  const { data } = await db().from("boosts").select("*").eq("id", boostId).maybeSingle();
  const boost = data as Record<string, any> | null;
  if (!boost || boost.status !== "pending_payment") return "pending_approval";

  const cap = await cityCapUsage(boost.target_city_id);
  if (cap.used >= cap.cap) {
    // Cap full — a human decides. The buyer is not charged twice and not left
    // in limbo: this is the same queue the admin panel already works.
    await db().from("boosts").update({ status: "pending_approval" }).eq("id", boostId).eq("status", "pending_payment");
    return "pending_approval";
  }

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
    .update({ status: "active", approved_at: nowIso, starts_at: startsAt, ends_at: endsAt, reject_reason: null })
    .eq("id", boostId)
    .eq("status", "pending_payment") // concurrency guard, same shape as approveBoost
    .select("id")
    .maybeSingle();
  if (!updated) return "pending_approval";

  await logReview(boostId, null, "approve", "Subject already approved — boost started automatically");

  const queued = startsAt !== nowIso;
  const brief = await subjectBrief(boost.subject_kind, boost.listing_id);
  await notify({
    profileId: boost.profile_id,
    type: "boost_approved",
    title: queued ? `Your boost is **queued** on ${brief.title}` : `Your boost is **live** on ${brief.title}`,
    body: queued
      ? `It starts when your current boost ends, and runs till ${dateLabel(endsAt)}.`
      : `Running till ${dateLabel(endsAt)} · ${boost.target_label}`,
    data: { boostId, subjectKind: boost.subject_kind, subjectId: boost.listing_id, deepLink: "/boost" },
  });
  return "active";
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
    title: "Your boost **wasn't approved**",
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
    title: "Your boost was **stopped**",
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
    .select("id,profile_id,ends_at,paused_at,status");

  const { data: refunding } = await db()
    .from("boosts")
    .update({
      status: "cancelled",
      stopped_reason: `${reason.slice(0, 240)} before it went live — refunded in full`,
    })
    .eq("listing_id", subjectId)
    .eq("status", "pending_approval")
    .select("id,profile_id,price_paise");

  for (const b of (stopped ?? []) as { id: string; profile_id: string; ends_at: string | null; paused_at: string | null; status: string }[]) {
    await logReview(b.id, null, "auto_stop", reason.slice(0, 300));
    // The days the seller paid for and did not get are handed back as a CREDIT
    // they can spend on another subject. Money still doesn't come back — but
    // succeeding (selling the flat) must not destroy placement already bought.
    const days = await issueBoostCredit(b, reason);
    await notify({
      profileId: b.profile_id,
      type: "boost_stopped",
      title: "Your boost **stopped**",
      body: days
        ? `${reason.slice(0, 140)}. Your ${days} unused boost ${days === 1 ? "day is" : "days are"} saved — apply them to another listing, project or requirement for free.`
        : `${reason.slice(0, 160)}. Unused days aren't refunded — see the Refund Policy.`,
      data: { boostId: b.id, deepLink: "/boost" },
    });
  }
  for (const b of (refunding ?? []) as { id: string; profile_id: string; price_paise: number }[]) {
    await logReview(b.id, null, "auto_stop", `${reason.slice(0, 240)} before approval — refunding`);
    await notify({
      profileId: b.profile_id,
      type: "boost_stopped",
      title: "Your boost was **cancelled and refunded**",
      body: `It never went live, so ₹${(b.price_paise / 100).toLocaleString("en-IN")} is being refunded (5–7 days).`,
      data: { boostId: b.id, deepLink: "/boost" },
    });
  }

  return { stopped: (stopped ?? []).length, refunding: (refunding ?? []).length };
}

// ---------------------------------------------------------------------------
// Boost credits (migration 0050)
// ---------------------------------------------------------------------------

/**
 * Turn the unused half of an interrupted boost into a spendable credit.
 *
 * Whole days only, floored — a boost with 19 hours left is worth 0 days, not a
 * free extra one. A PAUSED boost is measured from when it was paused, because
 * its `ends_at` has not yet been extended by the pause (that happens on resume),
 * so measuring from `now` would silently eat the paused stretch.
 *
 * Idempotent by the unique index on `source_boost_id`: a retried stop, or two
 * status changes racing, cannot mint a second credit for the same boost.
 * Returns the days credited, or 0 if there was nothing left to credit.
 */
async function issueBoostCredit(
  boost: { id: string; profile_id: string; ends_at: string | null; paused_at: string | null; status: string },
  reason: string,
): Promise<number> {
  if (!boost.ends_at) return 0;
  const from = boost.status === "paused" && boost.paused_at ? new Date(boost.paused_at).getTime() : Date.now();
  const days = Math.floor((new Date(boost.ends_at).getTime() - from) / 86_400_000);
  if (days < 1) return 0;

  const { error } = await db().from("boost_credits").insert({
    profile_id: boost.profile_id,
    source_boost_id: boost.id,
    days,
    reason: reason.slice(0, 300),
  });
  // A duplicate is the idempotency guard doing its job, not a failure.
  if (error && !String(error.code) .includes("23505")) return 0;
  return days;
}

export interface BoostCredit {
  id: string;
  days: number;
  reason: string | null;
  expiresAt: string;
}

/** Unspent, unexpired credits for one seller — newest-expiring first so the
 *  strip can tell them what they are about to lose. */
export async function listBoostCredits(profileId: string): Promise<BoostCredit[]> {
  const { data } = await db()
    .from("boost_credits")
    .select("id,days,reason,expires_at")
    .eq("profile_id", profileId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });
  return ((data ?? []) as Record<string, any>[]).map((c) => ({
    id: c.id, days: c.days, reason: c.reason, expiresAt: c.expires_at,
  }));
}

export type CreditApplyResult =
  | { ok: true; boostId: string; days: number; endsAt: string; targetLabel: string }
  | { ok: false; reason: "no_credit" | "ineligible" | "not_found" | "city_cap" };

/**
 * Spend a credit on another subject. No money moves — this is placement the
 * seller already paid for on a subject that stopped being placeable.
 *
 * The credit is CLAIMED FIRST, in a statement whose `consumed_at is null`
 * predicate is the double-spend guard: two parallel calls produce one winner
 * and one `no_credit`. Only then is the boost written, and if anything after
 * the claim fails the credit is released back — so the failure mode is "you
 * still have your days", never "your days vanished and no boost exists".
 */
export async function applyBoostCredit(
  profileId: string,
  kind: BoostSubjectKind,
  subjectId: string,
  targeting: BoostTargeting,
): Promise<CreditApplyResult> {
  const subject = await getBoostSubject(profileId, kind, subjectId);
  if (!subject) return { ok: false, reason: "not_found" };
  if (!subject.eligible) return { ok: false, reason: "ineligible" };

  const credits = await listBoostCredits(profileId);
  const credit = credits[0];
  if (!credit) return { ok: false, reason: "no_credit" };

  const target = await resolveTarget(subject, targeting);
  const cap = await cityCapUsage(target.cityId);
  // The cap protects the feed from being all-boost. A credit cannot buy past it.
  if (cap.used >= cap.cap) return { ok: false, reason: "city_cap" };

  // (1) claim — the predicate is the guard, not a prior read
  const { data: claimed } = await db()
    .from("boost_credits")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", credit.id)
    .is("consumed_at", null)
    .select("id,days")
    .maybeSingle();
  if (!claimed) return { ok: false, reason: "no_credit" };

  const release = async () => {
    await db().from("boost_credits").update({ consumed_at: null, consumed_boost_id: null }).eq("id", credit.id);
  };

  // (2) same consecutive-queueing rule a paid boost gets — a credit must not
  // overlap a window already running on this subject.
  const nowIso = new Date().toISOString();
  const { data: running } = await db()
    .from("boosts")
    .select("ends_at")
    .eq("listing_id", subjectId)
    .in("status", ["active", "paused"])
    .not("ends_at", "is", null)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const runningEnd = (running as { ends_at: string } | null)?.ends_at ?? null;
  const startsAt = runningEnd && runningEnd > nowIso ? runningEnd : nowIso;
  const endsAt = new Date(new Date(startsAt).getTime() + credit.days * 86_400_000).toISOString();

  const { data: created, error } = await db()
    .from("boosts")
    .insert({
      profile_id: profileId,
      listing_id: subjectId,
      subject_kind: kind,
      // Reuses the catalog code only as a label anchor; no order, no charge.
      catalog_code: credit.days >= 30 ? "boost30" : "boost7",
      duration_days: credit.days,
      targeting: target.targeting,
      target_label: target.label,
      target_area_id: target.areaId,
      target_city_id: target.cityId,
      target_state_id: target.stateId,
      // Zero, and no `order_id` — so this never enters the refund sweep, which
      // only ever looks at boosts with a captured payment behind them.
      price_paise: 0,
      status: "active",
      approved_at: nowIso,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    await release();
    return { ok: false, reason: "not_found" };
  }
  const boostId = (created as { id: string }).id;
  await db().from("boost_credits").update({ consumed_boost_id: boostId }).eq("id", credit.id);
  await logReview(boostId, null, "approve", `Applied ${credit.days} reclaimed boost day(s) — no charge`);

  await notify({
    profileId,
    type: "boost_approved",
    title: `Your boost is **live** on ${(await subjectBrief(kind, subjectId)).title}`,
    body: `${credit.days} reclaimed ${credit.days === 1 ? "day" : "days"} applied at no charge · running till ${dateLabel(endsAt)} · ${target.label}`,
    data: { boostId, deepLink: "/boost" },
  });

  return { ok: true, boostId, days: credit.days, endsAt, targetLabel: target.label };
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
      // designs/P11 S7: "Your <b>boost ends tomorrow</b>" + a priced Renew
      // button. The price is the SERVER's number, rendered into the label —
      // the button still opens the normal server-priced checkout, so nothing
      // here can charge anything.
      title: milestone === 1 ? "Your **boost ends tomorrow**" : `Your **boost ends in ${milestone} days**`,
      body: `${b.duration_days >= 30 ? "1 Month" : `${b.duration_days} Days`} · ${b.target_label} · ${price}`,
      actions: [{ key: "renew_boost", label: `Renew — ${price}`, style: "primary" }],
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
      title: "Your **boost has ended**",
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
