import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { consumeQuota, releaseQuota, reserveSlot, transitionSlot } from "@/lib/billing/service";
import { stopBoostsForSubject, pauseBoostsForSubject, resumeBoostsForSubject } from "@/lib/billing/boost";
import { primaryAreaSqft } from "./validate";
import { notify } from "@/lib/notifications/service";
import { rupees } from "@/lib/notifications/subjects";

/**
 * Listings persistence + state machine (Doc2 §5, Doc7 §4, Doc9 §11).
 *
 * The two rules this file exists to enforce:
 *  1. PAYMENT-FIRST — a listing cannot be created without a slot drawn from a
 *     paid plan. The gate is here, server-side; the plan wall is only its UI.
 *  2. STATE-ACCESS MATRIX — who may see a listing depends on its state, and
 *     that is decided here, never by the client (Doc2 §5.4).
 */

const db = () => createServiceClient();

export type ListingState =
  | "draft" | "payment_pending" | "pending_review" | "changes_requested"
  | "rejected" | "live" | "hidden" | "archived" | "deleted";

export interface ListingRow {
  id: string;
  profile_id: string;
  slot_id: string | null;
  type_code: string;
  kind: "sell" | "rent";
  status: ListingState;
  availability: "available" | "sold" | "rented" | "completed";
  title: string | null;
  description: string | null;
  price_paise: number | null;
  price_on_request: boolean;
  is_negotiable: boolean;
  area_label: string | null;
  state_id: string | null;
  district_id: string | null;
  taluka_id: string | null;
  city_id: string | null;
  area_id: string | null;
  pincode: string | null;
  deposit_paise: number | null;
  maintenance_paise: number | null;
  maintenance_included: boolean;
  available_from: string | null;
  attributes: Record<string, unknown>;
  amenities: string[];
  contact_public: boolean;
  contact_number: string | null;
  alt_number: string | null;
  whatsapp_number: string | null;
  ownership_proof_type: string | null;
  ownership_proof_key: string | null;
  cover_url: string | null;
  photo_count: number;
  reject_count: number;
  review_notes: Record<string, string> | null;
  reject_reason: string | null;
  is_locked: boolean;
  still_available_asked_at: string | null;
  area_sqft: number | null;
  created_at: string;
  live_at: string | null;
  deleted_at: string | null;
}

// ---------------------------------------------------------------------------
// Config (Doc7 §43) — drives the dynamic form; new types need no code
// ---------------------------------------------------------------------------

export interface PropertyTypeRow {
  code: string;
  label: string;
  category: "residential" | "commercial" | "plot" | "pg";
  roles: string[];
  kinds: ("sell" | "rent")[];
  field_config: { fields?: string[]; hidden?: string[]; required?: string[]; area_units?: boolean };
  sort_order: number;
}

/** Role-filtered type list. A Builder never receives PG/Hostel (Doc2 §5.1). */
export async function getPropertyTypes(role: string | null): Promise<PropertyTypeRow[]> {
  const { data } = await db().from("property_types").select("*").eq("is_active", true).order("sort_order");
  const rows = (data ?? []) as PropertyTypeRow[];
  return role ? rows.filter((r) => r.roles.includes(role)) : rows;
}

export interface FieldDefinitionRow {
  key: string;
  label: string;
  control: "chips" | "select" | "multi" | "stepper" | "toggle" | "number" | "text" | "area";
  options: { value: string; label: string }[];
  placeholder: string | null;
  hint: string | null;
  /** Show this field only while another field holds one of these values. */
  showIf: { field: string; in: string[] } | null;
  /** Area unit set: 'land' (Vigha/Guntha) | 'built' (metric) | null (type flag). */
  units: "land" | "built" | null;
}

/**
 * Field definitions + amenity master list (Doc2 §5.1 "new types = config only").
 *
 * These used to live in a React file, which meant adding one BHK option or one
 * amenity needed a code change. They're data now, so the form renders whatever
 * the database says.
 */
export async function getFieldDefinitions(): Promise<FieldDefinitionRow[]> {
  const { data } = await db()
    .from("field_definitions")
    .select("key,label,control,options,placeholder,hint,show_if,units")
    .eq("is_active", true)
    .order("sort_order");
  // show_if is snake_case in Postgres; the form reads camelCase like every
  // other DTO field, so normalise here rather than in the component.
  return ((data ?? []) as (Omit<FieldDefinitionRow, "showIf"> & { show_if: FieldDefinitionRow["showIf"] })[])
    .map(({ show_if, ...f }) => ({ ...f, showIf: show_if ?? null }));
}

export async function getAmenities(category?: string) {
  const { data } = await db()
    .from("amenities")
    .select("code,label,category,categories")
    .eq("is_active", true)
    .order("sort_order");
  const rows = (data ?? []) as { code: string; label: string; category: string; categories: string[] }[];
  // Empty `categories` means "offered everywhere".
  return category ? rows.filter((a) => !a.categories.length || a.categories.includes(category)) : rows;
}

/**
 * The listings shown on someone ELSE's public profile grid (P9 S2).
 *
 * Same visibility rule as `getPublicProfileCounts` — live + available only, so
 * the grid can never disagree with the "N Listings" stat above it. Ordered
 * newest-live-first, matching the feed.
 */
export async function listPublicByProfile(profileId: string): Promise<ListingRow[]> {
  const { data } = await db()
    .from("listings")
    .select("*")
    .eq("profile_id", profileId)
    .eq("status", "live")
    .eq("availability", "available")
    .order("live_at", { ascending: false })
    .limit(60);
  return (data ?? []) as ListingRow[];
}

/**
 * Counts for someone ELSE's public profile (P9 S2).
 *
 * Deliberately narrower than `getProfileCounts`: a visitor may only be told
 * about what they can actually see, so this counts `live` + `available` only.
 * The owner's own count includes pending_review/hidden/archived; leaking those
 * totals to a stranger would tell them how much is sitting unpublished.
 */
export async function getPublicProfileCounts(profileId: string, role: string | null) {
  const { count: listings } = await db()
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "live")
    .eq("availability", "available");

  let projects = 0;
  if (role === "builder") {
    const { count } = await db()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("status", "live");
    projects = count ?? 0;
  }
  return { listings: listings ?? 0, projects };
}

/**
 * code → label for the amenity master ("power_backup" → "Power backup").
 *
 * The creation form submits CODES (that's what `getAmenities` hands it), but
 * every detail payload used to echo the stored value straight back, so a real
 * listing rendered "power_backup" / "swimming_pool" on screen. Resolved here so
 * the labels stay data (Doc2 §5.1: a new amenity is a row, not a code change).
 * Unknown values pass through untouched — older rows stored the label itself.
 */
export async function getAmenityLabels(): Promise<Map<string, string>> {
  const rows = await getAmenities();
  return new Map(rows.map((a) => [a.code, a.label]));
}

export function labelAmenities(values: string[] | null | undefined, labels: Map<string, string>): string[] {
  return (values ?? []).map((v) => labels.get(v) ?? v);
}

export async function getPropertyType(code: string): Promise<PropertyTypeRow | null> {
  const { data } = await db().from("property_types").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  return (data as PropertyTypeRow) ?? null;
}

// ---------------------------------------------------------------------------
// Drafts (Doc7 §44-46) — max 3, 90-day expiry
// ---------------------------------------------------------------------------

const MAX_DRAFTS = 3;

export async function listDrafts(profileId: string, kind = "listing") {
  const { data } = await db()
    .from("listing_drafts")
    .select("*")
    .eq("profile_id", profileId)
    .eq("kind", kind)
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });
  return (data ?? []) as { id: string; payload: Record<string, unknown>; title: string | null; expires_at: string; updated_at: string }[];
}

export async function saveDraft(profileId: string, args: { id?: string; kind?: string; payload: Record<string, unknown>; title?: string | null }) {
  if (args.id) {
    const { data } = await db()
      .from("listing_drafts")
      .update({ payload: args.payload, title: args.title ?? null })
      .eq("id", args.id)
      .eq("profile_id", profileId) // ownership-scoped (Doc9 §API1)
      .select("id")
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  // Cap at 3 (Doc2 §5.3) — the caller surfaces this as "delete one first".
  const existing = await listDrafts(profileId, args.kind ?? "listing");
  if (existing.length >= MAX_DRAFTS) throw new Error("DRAFT_LIMIT");

  const { data, error } = await db()
    .from("listing_drafts")
    .insert({ profile_id: profileId, kind: args.kind ?? "listing", payload: args.payload, title: args.title ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Ownership-scoped. Reports whether a row actually matched, so the route can
 *  answer 404 instead of claiming a delete that never happened. */
export async function deleteDraft(id: string, profileId: string): Promise<boolean> {
  const { data } = await db()
    .from("listing_drafts")
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("id");
  return Boolean(data?.length);
}

// ---------------------------------------------------------------------------
// Create (Doc7 §47) — PAYMENT-FIRST gate
// ---------------------------------------------------------------------------

export class NoSlotError extends Error {
  constructor() {
    super("PLAN_REQUIRED");
  }
}

/**
 * Create a listing as a DRAFT and reserve its slot.
 *
 * The listing is NOT submitted here. Doc4's creation flow is
 * form → photos → preview → "Submit for Review", so it stays `draft` until
 * `submitListing()` is called from the preview screen. Creating it as
 * `pending_review` would tell the user their listing is under review before
 * they'd added a single photo.
 *
 * The slot is drawn NOW though, not at submit: the quota is what entitles the
 * user to a listing at all, and drawing it late would let someone fill in
 * unlimited drafts with no plan. `reserved` becomes `consumed` on admin
 * approval and `released` on reject (Doc2 §4.2 slot state machine).
 *
 * If there's no quota, nothing is written at all: the caller gets
 * PLAN_REQUIRED and the client shows the plan wall. This is the real
 * payment-first control — posting straight to the API skips nothing.
 */
export async function createListing(
  profileId: string,
  input: {
    typeCode: string;
    kind: "sell" | "rent";
    title: string | null;
    description: string | null;
    pricePaise: number | null;
    priceOnRequest: boolean;
    isNegotiable: boolean;
    depositPaise?: number | null;
    maintenancePaise?: number | null;
    maintenanceIncluded?: boolean;
    availableFrom?: string | null;
    location: { stateId?: string | null; districtId?: string | null; talukaId?: string | null; cityId?: string | null; areaId?: string | null; pincode?: string | null; label?: string | null };
    attributes: Record<string, unknown>;
    amenities: string[];
    contact: { public: boolean; number?: string | null; alt?: string | null; whatsapp?: string | null };
    ownershipProof?: { type?: string | null; key?: string | null };
    flaggedReason?: string | null;
  },
): Promise<ListingRow> {
  // Entitlement is CHECKED here but not spent: Doc2 §4.2 reserves the slot on
  // SUBMIT, not on draft creation. Consuming it now would mean a user who opens
  // the form and walks away silently loses a paid listing slot forever.
  if (!(await hasListingQuota(profileId))) throw new NoSlotError();

  const { data, error } = await db()
    .from("listings")
    .insert({
      profile_id: profileId,
      type_code: input.typeCode,
      kind: input.kind,
      // Draft until the user presses "Submit for Review" on the preview screen.
      status: "draft",
      title: input.title,
      description: input.description,
      // "Price on request" stores NO figure at all (Doc2 §5.1).
      price_paise: input.priceOnRequest ? null : input.pricePaise,
      price_on_request: input.priceOnRequest,
      is_negotiable: input.isNegotiable,
      deposit_paise: input.depositPaise ?? null,
      maintenance_paise: input.maintenancePaise ?? null,
      maintenance_included: input.maintenanceIncluded ?? false,
      available_from: input.availableFrom ?? null,
      state_id: input.location.stateId ?? null,
      district_id: input.location.districtId ?? null,
      taluka_id: input.location.talukaId ?? null,
      city_id: input.location.cityId ?? null,
      area_id: input.location.areaId ?? null,
      pincode: input.location.pincode ?? null,
      // Derive the display label from the chosen area when the client didn't
      // send one. The feed card's location line reads this, so leaving it null
      // because a caller omitted it would print an empty pin row.
      area_label: input.location.label ?? (await areaLabelFor(input.location.areaId ?? null, input.location.cityId ?? null)),
      attributes: input.attributes,
      // Vigha/Guntha/acre → sq ft at write time (Doc2 §5.1). The seller's own
      // unit stays in `attributes`; this is the comparable figure.
      area_sqft: primaryAreaSqft(input.attributes),
      amenities: input.amenities,
      contact_public: input.contact.public,
      contact_number: input.contact.number ?? null,
      alt_number: input.contact.alt ?? null,
      whatsapp_number: input.contact.whatsapp ?? null,
      ownership_proof_type: input.ownershipProof?.type ?? null,
      ownership_proof_key: input.ownershipProof?.key ?? null,
      flagged_reason: input.flaggedReason ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  // No slot is held yet — it's drawn in submitListing(), so abandoning this
  // draft costs the user nothing.
  return data as ListingRow;
}

/**
 * Does the caller have a listing slot available right now?
 *
 * A read-only check used to gate the creation form (payment-first UX). It does
 * NOT reserve anything — `consume_quota` at submit is the atomic one, so two
 * concurrent submits still can't share a slot even though both passed here.
 */
export async function hasListingQuota(profileId: string): Promise<boolean> {
  const { data } = await db()
    .from("user_plans")
    .select("listing_quota,listing_used")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  return ((data ?? []) as { listing_quota: number; listing_used: number }[]).some(
    (p) => p.listing_quota < 0 || p.listing_used < p.listing_quota,
  );
}

/**
 * "Submit for Review" (Doc4 §27). Moves a draft into the moderation queue.
 *
 * Only from `draft` or `changes_requested` — re-submitting something already
 * pending or live is a no-op, which is what stops a double-tap (or a stale
 * preview screen someone navigated back into) from re-queueing a listing.
 *
 * At least one photo is required: a listing with no photos is not reviewable
 * (Doc2 §5.2 "Min 1").
 */
/** Statuses a seller may (re)submit from. `rejected` is here on purpose. */
const RESUBMITTABLE = ["draft", "changes_requested", "rejected"];

export async function submitListing(
  id: string,
  profileId: string,
): Promise<{ ok: boolean; reason?: "no_photos" | "not_found" | "already" | "no_slot" | "locked" }> {
  const current = await getListingForViewer(id, profileId);
  if (!current || current.profile_id !== profileId) return { ok: false, reason: "not_found" };

  // `rejected` is resubmittable — that is the whole point of the 3-reject
  // counter (Doc2 §5.4). It used to be excluded, which made `rejected` a
  // terminal state: the seller's paid slot was already consumed, the listing
  // could never go back into review, and `reject_count` could never reach 2,
  // so the lock below was unreachable code. The LOCK is what stops the loop,
  // not the status.
  if (!RESUBMITTABLE.includes(current.status)) {
    return { ok: false, reason: "already" };
  }
  if (current.is_locked) return { ok: false, reason: "locked" };
  if ((current.photo_count ?? 0) < 1) return { ok: false, reason: "no_photos" };

  // Claim the status FIRST. This is what serialises a double-submit, so the
  // slot below can only ever be drawn once per listing.
  const { data: claimed } = await db()
    .from("listings")
    .update({ status: "pending_review", submitted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profileId)
    .in("status", RESUBMITTABLE)
    .eq("is_locked", false)
    .select("id,slot_id")
    .maybeSingle();

  if (!claimed) return { ok: false, reason: "already" };
  const row = claimed as { id: string; slot_id: string | null };

  // A re-submit after changes-requested already holds its slot — don't take a
  // second one.
  if (row.slot_id) return { ok: true };

  // THE slot draw (Doc2 §4.2: reserved on submit). Atomic + FIFO.
  const userPlanId = await consumeQuota(profileId, "listing", 1, {
    type: "listing",
    id,
    note: "listing submitted",
  });

  if (!userPlanId) {
    // Out of quota — put the listing back to draft so nothing is half-submitted
    // and the user keeps their work.
    await db().from("listings").update({ status: "draft", submitted_at: null }).eq("id", id);
    return { ok: false, reason: "no_slot" };
  }

  // Quota is spent from here, so a failure reserving or attaching the slot has
  // to hand it back — otherwise the user pays for a submit that left the
  // listing with no slot_id at all (same class of leak as the requirement
  // create; see migration 0024).
  try {
    const slotId = await reserveSlot(profileId, userPlanId);
    await db().from("listing_slots").update({ listing_id: id }).eq("id", slotId);
    await db().from("listings").update({ slot_id: slotId }).eq("id", id);
  } catch (e) {
    await releaseQuota(profileId, userPlanId, "listing", 1, "Listing submit failed after the slot draw");
    await db().from("listings").update({ status: "draft", submitted_at: null }).eq("id", id);
    throw e;
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Read + the state-access matrix (Doc2 §5.4 / Doc7 §51)
// ---------------------------------------------------------------------------

/** States only the owner (or an admin) may see. Everyone else gets a 404. */
const OWNER_ONLY: ListingState[] = ["draft", "payment_pending", "pending_review", "changes_requested", "rejected", "hidden", "archived"];

/**
 * Fetch a listing subject to the access matrix. Returns null (→ 404) rather
 * than 403 for anything the viewer shouldn't see, so the endpoint can't be used
 * to probe which ids exist (Doc9 §API1 "return 404, not 403").
 */
export async function getListingForViewer(
  id: string,
  viewerId: string | null,
  isAdmin = false,
): Promise<ListingRow | null> {
  const { data } = await db().from("listings").select("*").eq("id", id).maybeSingle();
  const listing = data as ListingRow | null;
  if (!listing) return null;

  // Soft-deleted is a 404 for everyone, owner included (Doc2 §5.4).
  if (listing.status === "deleted" || listing.deleted_at) return null;

  if (isAdmin) return listing;

  const isOwner = viewerId !== null && listing.profile_id === viewerId;
  if (OWNER_ONLY.includes(listing.status) && !isOwner) return null;

  return listing;
}

/**
 * Counts for the profile header. Drafts are excluded — a draft isn't a listing
 * the owner has "posted", and counting it would make the number jump the moment
 * they open the form.
 */
export async function getProfileCounts(profileId: string, role: string | null) {
  const { count: listings } = await db()
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .not("status", "in", "(draft,deleted)");

  let projects = 0;
  if (role === "builder") {
    const { count } = await db()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .not("status", "in", "(draft,deleted)");
    projects = count ?? 0;
  }
  return { listings: listings ?? 0, projects, views: await countProfileViews(profileId) };
}

/**
 * Requirements the profile has POSTED (the P9 stat tile that replaced Views for
 * owner/broker). Same rows as "My requirements", so tapping the tile can never
 * open a list that disagrees with the number on it.
 */
export async function countProfileRequirements(profileId: string): Promise<number> {
  const { count } = await db()
    .from("requirements")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .neq("status", "deleted");
  return count ?? 0;
}

/**
 * Total unique-per-day views across everything this profile has listed.
 *
 * Two queries rather than a join because PostgREST can't count through a
 * relation; the id list is bounded by how many listings one account can own.
 */
export async function countProfileViews(profileId: string): Promise<number> {
  const { data: ids } = await db().from("listings").select("id").eq("profile_id", profileId).is("deleted_at", null);
  const list = (ids ?? []).map((r: { id: string }) => r.id);
  if (!list.length) return 0;

  const { count } = await db()
    .from("listing_views")
    .select("id", { count: "exact", head: true })
    .in("listing_id", list);
  return count ?? 0;
}

/**
 * Record one view. Idempotent per (listing, viewer, IST day) via the unique
 * index — a conflicting insert is ignored, so a refresh loop can't inflate it.
 * Never throws: a failed analytics write must not break the detail page.
 */
export async function recordListingView(listingId: string, viewerKey: string): Promise<void> {
  try {
    await db().from("listing_views").upsert(
      { listing_id: listingId, viewer_key: viewerKey },
      { onConflict: "listing_id,viewer_key,viewed_on", ignoreDuplicates: true },
    );
  } catch {
    /* analytics is best-effort */
  }
}

/**
 * Is this listing currently boosted? Drives the PROMOTED badge on the detail
 * hero (designs/P4 S1). Read from `boosts`, never from a client flag.
 */
export async function isPromoted(listingId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await db()
    .from("boosts")
    .select("id")
    .eq("listing_id", listingId)
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .limit(1);
  return Boolean(data?.length);
}

/**
 * The owner-only stats strip above the detail's action bar (designs/P4 S1).
 *
 * `views` is real (one row per viewer per IST day). Saves and leads have no
 * table yet — they arrive with the Saved suite and the Leads module — so they
 * come back as null and the strip renders "—" rather than a fabricated 0
 * (CLAUDE.md §7: no hardcoded counts). Tracked in docs/PENDING-INTEGRATIONS.md.
 */
/**
 * Per-listing owner stats strip (P4 S1). All three are real counts now: views
 * (migration 0018), saves (Module 6's `saves`), leads (Module 5's `leads`).
 * They used to return `saves: null` / `leads: null` — the strip rendered "—"
 * rather than a fabricated 0 while those tables didn't exist (D3).
 */
export async function ownerListingStats(listingId: string) {
  const [{ count: views }, { count: saves }, { count: leads }] = await Promise.all([
    db().from("listing_views").select("id", { count: "exact", head: true }).eq("listing_id", listingId),
    db().from("saves").select("id", { count: "exact", head: true }).eq("listing_id", listingId),
    db().from("leads").select("id", { count: "exact", head: true }).eq("listing_id", listingId).eq("is_relevant", true),
  ]);
  return { views: views ?? 0, saves: saves ?? 0, leads: leads ?? 0 };
}

export async function listMine(profileId: string) {
  const { data } = await db()
    .from("listings")
    .select("*")
    .eq("profile_id", profileId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as ListingRow[];
}


/**
 * Trash (Doc2 §5.4) — soft-deleted listings, restorable for 30 days.
 *
 * `restore` already existed as a status action with nothing that could reach
 * it, because `listMine` filters deleted rows out. This is the list the Trash
 * view reads; the purge cron empties it on the 31st day.
 */
export async function listTrash(profileId: string) {
  const { data } = await db()
    .from("listings")
    .select("*")
    .eq("profile_id", profileId)
    .eq("status", "deleted")
    .order("deleted_at", { ascending: false })
    .limit(100);
  return (data ?? []) as ListingRow[];
}

/**
 * "Similar properties" for the detail rail (designs/P4).
 *
 * Matched on the server so the rule is one place and can't be reverse-engineered
 * from the client: same type + kind, live and available, same city, and within
 * ±35% of the price. Widens to the whole city if the price band is empty rather
 * than showing nothing — an empty rail on a busy city reads as broken.
 *
 * A listing with no price (on-request) matches on type + city only.
 */
export async function listSimilar(listing: ListingRow, limit = 8): Promise<ListingRow[]> {
  const base = () =>
    db()
      .from("listings")
      .select("*")
      .eq("status", "live")
      .eq("availability", "available")
      .eq("type_code", listing.type_code)
      .eq("kind", listing.kind)
      .neq("id", listing.id)
      .is("deleted_at", null);

  if (listing.city_id) {
    let q = base().eq("city_id", listing.city_id);
    if (listing.price_paise) {
      q = q.gte("price_paise", Math.round(listing.price_paise * 0.65)).lte("price_paise", Math.round(listing.price_paise * 1.35));
    }
    const { data } = await q.limit(limit);
    if ((data ?? []).length) return data as ListingRow[];

    // Band was empty — fall back to the city without the price filter.
    const { data: wider } = await base().eq("city_id", listing.city_id).limit(limit);
    if ((wider ?? []).length) return wider as ListingRow[];
  }

  const { data: anywhere } = await base().limit(limit);
  return (anywhere ?? []) as ListingRow[];
}

/** Boost eligibility + the boost picker both read through here (Doc2 §13). */
export async function listBoostCandidates(profileId: string) {
  const { data } = await db()
    .from("listings")
    .select("id,title,price_paise,area_label,cover_url,status,availability")
    .eq("profile_id", profileId)
    .in("status", ["live", "pending_review", "hidden"])
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as (Pick<ListingRow, "id" | "title" | "price_paise" | "area_label" | "cover_url" | "status" | "availability">)[];
}

// ---------------------------------------------------------------------------
// Edit + status machine (Doc7 §52-54)
// ---------------------------------------------------------------------------

/** Photo/location edits need re-review; a price tweak does not (Doc2 §5.4). */
const MAJOR_FIELDS = new Set(["area_id", "city_id", "state_id", "district_id", "taluka_id", "photos", "type_code"]);

export async function updateListing(
  id: string,
  profileId: string,
  patch: Record<string, unknown>,
): Promise<{ listing: ListingRow; reReview: boolean } | null> {
  const current = await getListingForViewer(id, profileId);
  if (!current || current.profile_id !== profileId) return null;

  const isMajor = Object.keys(patch).some((k) => MAJOR_FIELDS.has(k));
  const wasLive = current.status === "live";

  // Track price drops so savers can be notified (never on an increase).
  if ("price_paise" in patch && patch.price_paise !== current.price_paise) {
    await db().from("listing_price_history").insert({
      listing_id: id,
      old_paise: current.price_paise,
      new_paise: patch.price_paise as number | null,
    });
  }

  const next: Record<string, unknown> = { ...patch };
  // Attributes changed → the canonical sq ft has to follow, or an edited plot
  // keeps the area it was first saved with.
  if ("attributes" in patch) {
    next.area_sqft = primaryAreaSqft(patch.attributes as Record<string, unknown>);
  }
  // A major edit on a live listing goes back for review; the live version stays
  // visible until the edit is approved (Doc2 §5.4).
  if (isMajor && wasLive) next.status = "pending_review";

  const { data } = await db().from("listings").update(next).eq("id", id).eq("profile_id", profileId).select("*").maybeSingle();
  if (!data) return null;

  // "Track price drops so savers can be notified" — this is the notifying half
  // (Doc2 §14 "price-drop (saved)"). It only fires on a real DROP, on a live
  // listing, and only to people who saved it.
  if (
    wasLive && next.status !== "pending_review" &&
    "price_paise" in patch &&
    typeof patch.price_paise === "number" && typeof current.price_paise === "number" &&
    patch.price_paise < current.price_paise
  ) {
    await notifySaversOfPriceDrop(id, current.price_paise, patch.price_paise);
  }

  return { listing: data as ListingRow, reReview: isMajor && wasLive };
}

export type StatusAction = "sold" | "rented" | "completed" | "reactivate" | "restore" | "hide" | "unhide";

/**
 * Status transitions (Doc2 §5.4). Marking sold/rented archives the listing and
 * stops any running boost — with NO refund for unused days, which is the
 * documented rule, enforced here rather than left to the boost screen.
 */
/** Distinguishes "not yours" from "illegal transition" so the route can answer
 *  404 for the first and 400 for the second — a 400 on someone else's id would
 *  confirm that the listing exists (Doc9 §7 enumeration). */
export const NOT_OWNED = Symbol("not_owned");

export async function setListingStatus(id: string, profileId: string, action: StatusAction) {
  // Owner-scoped lookup, NOT the viewer gate: `getListingForViewer` returns
  // null for soft-deleted rows (they're a 404 for everyone, owner included),
  // which meant `restore` could never find the very listing it exists to
  // restore. The ownership filter below is the wall; visibility isn't.
  const { data: row } = await db().from("listings").select("*").eq("id", id).maybeSingle();
  const current = row as ListingRow | null;
  if (!current || current.profile_id !== profileId) return NOT_OWNED;
  // Every action except restore operates on a listing that is still visible.
  if (action !== "restore" && current.status === "deleted") return null;

  const now = new Date().toISOString();
  let patch: Record<string, unknown> = {};

  switch (action) {
    case "sold":
    case "rented":
    case "completed":
      patch = { availability: action, status: "archived", archived_at: now, sold_at: now };
      break;
    case "reactivate":
      // Re-activate reuses the SAME slot for free, but goes back for review.
      if (current.availability !== "rented") return null;
      patch = { availability: "available", status: "pending_review", archived_at: null, sold_at: null };
      break;
    case "restore":
      // Only from trash, and only inside the 30-day window the purge cron
      // enforces — restoring something already purged is impossible anyway.
      if (current.status !== "deleted") return null;
      patch = { status: "draft", archived_at: null, deleted_at: null, availability: "available" };
      break;
    case "hide":
      patch = { status: "hidden", hidden_at: now };
      break;
    case "unhide":
      patch = { status: "pending_review", hidden_at: null };
      break;
  }

  const { data } = await db().from("listings").update(patch).eq("id", id).eq("profile_id", profileId).select("*").maybeSingle();
  if (!data) return null;

  // Auto-stop any live boost (Doc2 §13: sold mid-boost → stop, no refund) — but
  // a boost still awaiting approval is REFUNDED instead, because it never got a
  // minute of placement. `stopBoostsForSubject` owns that distinction.
  if (["sold", "rented", "completed"].includes(action)) {
    await stopBoostsForSubject(id, `Listing marked as ${action} · boost stopped automatically`);
  }
  // Hidden → the listing is placed nowhere, so the boost pauses (days are given
  // back on resume) rather than quietly running down against an invisible row.
  if (action === "hide") {
    await pauseBoostsForSubject(id, "Listing hidden · boost paused");
  }
  // Back in the feed → resume whatever the hide paused.
  if ((data as ListingRow).status === "live") {
    await resumeBoostsForSubject(id);
  }

  // Anyone who SAVED this listing asked to hear about exactly this (Doc2 §14
  // "saved-listing status change"). Their preference for it is default-OFF, so
  // the engine is what decides whether it actually reaches them.
  if (["sold", "rented", "completed", "hide"].includes(action)) {
    await notifySaversOfStatusChange(id, profileId, action === "hide" ? "hidden" : action);
  }

  return data as ListingRow;
}

/**
 * Soft delete → 30-day trash (Doc2 §5.4).
 *
 * Slot accounting follows the state machine in Doc2 §4.2: a slot is only
 * CONSUMED on approve. So deleting a listing that was never approved
 * (draft / pending_review / changes_requested / rejected) releases the slot and
 * refunds the quota — the user paid for a live listing and never got one.
 *
 * Once a listing has been live, the slot stays consumed even after deletion.
 * That's deliberate: otherwise one ₹999 plan could be recycled forever by
 * publishing, deleting, and re-posting.
 */
/**
 * "Delete now" from the trash screen (designs/P10 S4) — the same purge the
 * 30-day cron performs (`lifecycle.purgeTrash`), on demand.
 *
 * Only ever from trash, and only the owner's own row: the `status = 'deleted'`
 * filter is what stops this being a way to hard-delete a LIVE listing, and it
 * is applied in the statement rather than checked beforehand, so two parallel
 * calls can't race past it. The consumed slot is NOT returned — it was spent
 * when the listing was submitted, and deleting the evidence doesn't refund it.
 */
export async function purgeListing(id: string, profileId: string): Promise<boolean> {
  const { data } = await db()
    .from("listings")
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .eq("status", "deleted")
    .select("id");
  return (data ?? []).length > 0;
}

export async function softDeleteListing(id: string, profileId: string) {
  const before = await getListingForViewer(id, profileId);
  if (!before || before.profile_id !== profileId) return false;

  const neverApproved = ["draft", "payment_pending", "pending_review", "changes_requested", "rejected"].includes(
    before.status,
  );

  const { data } = await db()
    .from("listings")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("id,slot_id")
    .maybeSingle();
  if (!data) return false;

  const row = data as { id: string; slot_id: string | null };

  if (neverApproved && row.slot_id) {
    await releaseSlotAndRefundQuota(row.slot_id, profileId, "listing deleted before approval");
    await db().from("listings").update({ slot_id: null }).eq("id", id);
  }

  await stopBoostsForSubject(id, "Listing deleted");

  return true;
}

/**
 * Release a reserved slot and hand the listing quota back to the plan it came
 * from, so the user can post again. Also un-links the consumption trace row so
 * "What you've used" stops claiming a listing that no longer exists.
 */
export async function releaseSlotAndRefundQuota(slotId: string, profileId: string, reason: string) {
  const { data } = await db()
    .from("listing_slots")
    .select("id,user_plan_id,state")
    .eq("id", slotId)
    .eq("profile_id", profileId)
    .maybeSingle();
  const slot = data as { id: string; user_plan_id: string; state: string } | null;
  if (!slot || slot.state === "released") return;

  await db().from("listing_slots").update({ state: "released", released_reason: reason }).eq("id", slotId);

  // Give the quota back. `greatest(0, …)` guards against a double release.
  const { data: plan } = await db().from("user_plans").select("listing_used").eq("id", slot.user_plan_id).maybeSingle();
  const used = (plan as { listing_used: number } | null)?.listing_used ?? 0;
  await db().from("user_plans").update({ listing_used: Math.max(0, used - 1) }).eq("id", slot.user_plan_id);

  await db()
    .from("plan_consumptions")
    .update({ reverted_at: new Date().toISOString(), revert_reason: reason })
    .eq("user_plan_id", slot.user_plan_id)
    .eq("kind", "listing")
    .is("reverted_at", null);
}

// ---------------------------------------------------------------------------
// Locations (cascade + area request — Doc2 §5.1)
// ---------------------------------------------------------------------------

export async function getLocationChildren(parentId: string | null, level: string) {
  let q = db().from("locations").select("id,name,name_gu,level,pincode").eq("level", level).eq("is_active", true).order("name");
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data } = await q;
  return (data ?? []) as { id: string; name: string; name_gu: string | null; level: string; pincode: string | null }[];
}

/**
 * Resolve specific location nodes by id. The edit forms hold ids (a
 * requirement's preferred areas, a project's area) and need names to redraw
 * the chips without knowing which parent to walk down from.
 */
export async function getLocationsByIds(ids: string[]) {
  const { data } = await db()
    .from("locations")
    .select("id,name,name_gu,level,pincode")
    .in("id", ids)
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as { id: string; name: string; name_gu: string | null; level: string; pincode: string | null }[];
}

/**
 * Reconstruct the full location cascade from whatever ids a row has.
 *
 * Older rows stored `state_id` + `city_id` + `area_id` but left
 * `district_id`/`taluka_id` null (a broken mid-chain), so the edit form's
 * cascade — which needs each ancestor to unlock the next level — rendered
 * blank even though the row clearly had a city and area. This walks `parent_id`
 * up from the DEEPEST id present and fills every level, so the picker always
 * re-opens on the real location regardless of what was stored.
 */
export async function resolveLocationChain(ids: {
  stateId?: string | null; districtId?: string | null; talukaId?: string | null; cityId?: string | null; areaId?: string | null;
}): Promise<{ stateId: string | null; districtId: string | null; talukaId: string | null; cityId: string | null; areaId: string | null }> {
  const empty = { stateId: null, districtId: null, talukaId: null, cityId: null, areaId: null };
  const deepest = ids.areaId ?? ids.cityId ?? ids.talukaId ?? ids.districtId ?? ids.stateId ?? null;
  if (!deepest) return empty;

  // Walk up to the root, capped at 6 hops (state→area is 5 levels).
  const chain: Record<string, string> = {};
  let cursor: string | null = deepest;
  for (let i = 0; i < 6 && cursor; i++) {
    const { data } = await db().from("locations").select("id,parent_id,level").eq("id", cursor).maybeSingle();
    const node = data as { id: string; parent_id: string | null; level: string } | null;
    if (!node) break;
    chain[node.level] = node.id;
    cursor = node.parent_id;
  }
  return {
    stateId: chain.state ?? null,
    districtId: chain.district ?? null,
    talukaId: chain.taluka ?? null,
    cityId: chain.city ?? null,
    areaId: chain.area ?? null,
  };
}

export async function requestArea(profileId: string, name: string, cityId: string | null) {
  await db().from("area_requests").insert({ profile_id: profileId, name: name.slice(0, 80), city_id: cityId });
}

/**
 * "Mavdi, Rajkot" from the chosen area (falling back to the city alone).
 * Used when a caller creates a listing without supplying a display label.
 */
export async function areaLabelFor(areaId: string | null, cityId: string | null): Promise<string | null> {
  if (!areaId && !cityId) return null;

  if (areaId) {
    const { data: area } = await db().from("locations").select("name,parent_id").eq("id", areaId).maybeSingle();
    const a = area as { name: string; parent_id: string | null } | null;
    if (a) {
      const parentId = a.parent_id ?? cityId;
      if (parentId) {
        const { data: city } = await db().from("locations").select("name").eq("id", parentId).maybeSingle();
        const c = (city as { name: string } | null)?.name;
        return c ? `${a.name}, ${c}` : a.name;
      }
      return a.name;
    }
  }

  const { data: city } = await db().from("locations").select("name").eq("id", cityId!).maybeSingle();
  return (city as { name: string } | null)?.name ?? null;
}

// ---------------------------------------------------------------------------
// Saved-listing fan-out (Doc2 §14: "price-drop (saved)", "saved-listing status
// change"). Both walk `saves` — the people who asked to hear about this row.
// ---------------------------------------------------------------------------

/** Everyone who saved this listing, excluding its owner. */
async function saversOf(listingId: string, ownerId: string): Promise<string[]> {
  const { data } = await db().from("saves").select("profile_id").eq("listing_id", listingId).limit(1000);
  return [...new Set(((data ?? []) as { profile_id: string }[]).map((s) => s.profile_id))].filter((p) => p !== ownerId);
}

async function notifySaversOfPriceDrop(listingId: string, oldPaise: number, newPaise: number) {
  const { data } = await db()
    .from("listings").select("id,profile_id,title,area_label,cover_url").eq("id", listingId).maybeSingle();
  const l = data as { id: string; profile_id: string; title: string; area_label: string; cover_url: string | null } | null;
  if (!l) return;
  const name = [l.title, l.area_label].filter(Boolean).join(", ");
  const drop = rupees(oldPaise - newPaise);
  for (const saver of await saversOf(listingId, l.profile_id)) {
    // designs/P11 S7: "Price dropped <b>₹5 Lakh</b> on a property you saved —
    // 3 BHK, Raiya Road" + the listing thumbnail.
    await notify({
      profileId: saver,
      type: "price_drop",
      title: `Price dropped **${drop}** on a property you saved — ${name}`,
      body: `Now ${rupees(newPaise)}.`,
      thumbUrl: l.cover_url,
      entityKind: "listing", entityId: l.id,
      data: { listingId: l.id },
    });
  }
}

const SAVED_STATUS_COPY: Record<string, string> = {
  sold: "is now marked **sold**",
  rented: "is now marked **rented**",
  completed: "is now marked **completed**",
  hidden: "was **hidden** by the seller",
  archived: "is **no longer listed**",
};

/**
 * A saved listing changed state (Doc2 §14). Default-OFF in the design's prefs
 * ("Status changes on saved"), which the engine enforces — this just emits it.
 */
async function notifySaversOfStatusChange(listingId: string, ownerId: string, stateKey: string) {
  const copy = SAVED_STATUS_COPY[stateKey];
  if (!copy) return;
  const { data } = await db()
    .from("listings").select("title,area_label,cover_url").eq("id", listingId).maybeSingle();
  const l = data as { title: string; area_label: string; cover_url: string | null } | null;
  const name = l ? [l.title, l.area_label].filter(Boolean).join(", ") : "A saved property";
  for (const saver of await saversOf(listingId, ownerId)) {
    await notify({
      profileId: saver,
      type: "saved_listing_status",
      title: `${name} ${copy}`,
      body: "It was on your saved list.",
      thumbUrl: l?.cover_url ?? null,
      entityKind: "listing", entityId: listingId,
      data: { listingId },
    });
  }
}
