import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { placementsFor, outOfCityIds, stateIdOfCity } from "@/lib/billing/placement";
import { feedScope, applyFeedScope } from "./scope";
import { getFieldDefinitions, getFieldGroups, type FieldDefinitionRow, type FieldGroupRow, type PropertyTypeRow } from "@/lib/listings/service";
import { attributeRows, resolveKeySpecs, topUpSpecs, type KeySpecCandidate } from "@/lib/listings/dto";
import { timeAgo } from "@/lib/listings/matching";

/**
 * Stories (Doc7 §84-86, Doc2 §9.3) — AUTO-GENERATED ONLY.
 *
 * Source: every approved listing/project that went live in the last 24h in the
 * viewer's city. One poster/day = ONE circle with multiple segments. Order:
 * boosted first → recency (cascade order). NO cap. NO add-story anywhere — the
 * client never renders a "your story" circle and there is no create path.
 *
 * Seen-state is stored PER CITY (`story_seen`) so a ring greys only in the city
 * it was seen in. Media is served through `storySegment` so a later hardening
 * can swap public URLs for signed 24h URLs (tracked in PENDING — listing photos
 * currently live in the public bucket).
 */

const db = () => createServiceClient();

/** Stand-in id for "match nothing", so a guest's `neq` filter stays valid SQL. */
const NIL = "00000000-0000-0000-0000-000000000000";

export type Ring = "unseen" | "seen" | "project" | "boosted";

/** One tile of the viewer's facts strip — same shape the detail screen uses. */
export interface StorySpec { icon: string; value: string; label: string }

export interface StorySegment {
  id: string;                // listing/project id
  kind: "property" | "project";
  cover: string | null;
  price: string;
  meta: string;
  areaLabel: string | null;
  available: boolean;        // false → "no longer available" state
  /**
   * Everything below is what the redesigned viewer renders (designs/P2A). It is
   * all read off the same row the segment already came from — the story said
   * only a price and a meta string before, so a viewer could not tell WHAT the
   * property was, and had no way out to the detail screen.
   */
  title: string;             // listings.title / projects.name
  typeLabel: string | null;  // property_types.label / project_types.label
  /**
   * The facts strip, from the TYPE's own `field_config.key_specs` candidate
   * list (migration 0071) resolved against this row's values — the first four
   * that actually carry a value, so the strip is never a grid with holes. Same
   * builder as the detail screen (`resolveKeySpecs`), so the two never disagree.
   */
  specs: StorySpec[];
  negotiable: boolean;
  /** Project unit types ("2, 3, 4 BHK"); null for a property. */
  subtitle: string | null;
  saved: boolean;
  /** "2h ago" — formatted server-side (IST), like every other timestamp. */
  postedLabel: string | null;
  href: string;              // /property/:id | /project/:id
}

export interface StoryCircle {
  posterId: string;
  posterName: string;
  /** For the header tap → /profile/:username. Null profiles stay untappable. */
  posterUsername: string | null;
  posterAvatar: string | null;
  verified: boolean;
  ring: Ring;
  boosted: boolean;
  isProject: boolean;
  segments: StorySegment[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A type's label + its whole `field_config` (key-spec candidates, field order). */
interface TypeConfig { label: string; row: PropertyTypeRow }

async function typeConfigs(table: "property_types" | "project_types"): Promise<Map<string, TypeConfig>> {
  const { data } = await db().from(table).select("code,label,field_config").eq("is_active", true);
  return new Map(
    ((data ?? []) as { code: string; label: string; field_config: PropertyTypeRow["field_config"] | null }[])
      .map((t) => [t.code, { label: t.label, row: { ...t, field_config: t.field_config ?? {} } as PropertyTypeRow }]),
  );
}

/** Which of these listings the viewer has already saved (the bookmark state). */
async function savedFor(viewerId: string | null, ids: string[]): Promise<Set<string>> {
  if (!viewerId || !ids.length) return new Set();
  const { data } = await db().from("saves").select("listing_id").eq("profile_id", viewerId).in("listing_id", ids);
  return new Set(((data ?? []) as { listing_id: string }[]).map((s) => s.listing_id));
}

interface Units { from: number | null; to: number | null; types: string[] }

/** The scheme's price band + unit names, for the project segment's headline. */
async function unitsFor(projectIds: string[]): Promise<Map<string, Units>> {
  const map = new Map<string, Units>();
  if (!projectIds.length) return map;
  const { data } = await db()
    .from("project_units")
    .select("project_id,unit_type,price_from_paise,position")
    .in("project_id", projectIds)
    .order("position", { ascending: true });
  for (const u of (data ?? []) as { project_id: string; unit_type: string; price_from_paise: number | null }[]) {
    const cur = map.get(u.project_id) ?? { from: null, to: null, types: [] };
    if (u.price_from_paise != null) {
      cur.from = cur.from === null ? u.price_from_paise : Math.min(cur.from, u.price_from_paise);
      cur.to = cur.to === null ? u.price_from_paise : Math.max(cur.to, u.price_from_paise);
    }
    if (u.unit_type && !cur.types.includes(u.unit_type)) cur.types.push(u.unit_type);
    map.set(u.project_id, cur);
  }
  return map;
}

/** Everything the two segment builders need, loaded once per request. */
interface SegCtx {
  propTypes: Map<string, TypeConfig>;
  projTypes: Map<string, TypeConfig>;
  defs: FieldDefinitionRow[];
  groups: FieldGroupRow[];
  saved: Set<string>;
  units: Map<string, Units>;
}

async function segCtx(viewerId: string | null, listingIds: string[], projectIds: string[]): Promise<SegCtx> {
  const [propTypes, projTypes, defs, groups, saved, units] = await Promise.all([
    typeConfigs("property_types"),
    typeConfigs("project_types"),
    getFieldDefinitions(),
    getFieldGroups(),
    savedFor(viewerId, listingIds),
    unitsFor(projectIds),
  ]);
  return { propTypes, projTypes, defs, groups, saved, units };
}

/**
 * The strip for one row: the type's key-spec candidates, topped up from the
 * answers it actually carries when the candidates come up short — the exact
 * pair the detail screen runs (`listingDetailDTO`), so a listing's story and
 * its detail never show a different strip. A plot that filled only `land_area`
 * would otherwise be a lone tile in the card.
 */
function stripFor(type: TypeConfig | undefined, values: Record<string, unknown>, ctx: SegCtx, kind: string) {
  return topUpSpecs(
    resolveKeySpecs(
      (type?.row.field_config as { key_specs?: KeySpecCandidate[] } | undefined)?.key_specs,
      values,
      ctx.defs,
    ),
    attributeRows(values, type?.row ?? null, ctx.defs, kind),
    ctx.groups,
  );
}

/** One live listing → a story segment. */
function propertySegment(l: any, ctx: SegCtx, available: boolean): StorySegment {
  const attrs = (l.attributes ?? {}) as Record<string, unknown>;
  const bhk = attrs.bhk;
  const type = l.type_code ? ctx.propTypes.get(l.type_code) : undefined;
  return {
    id: l.id,
    kind: "property",
    cover: l.cover_url,
    price: l.price_on_request ? "Price on request" : formatShortRupees(l.price_paise),
    meta: [bhk ? `${bhk} BHK` : null, l.area_sqft ? `${l.area_sqft.toLocaleString("en-IN")} sqft` : null, l.area_label]
      .filter(Boolean).join(" · "),
    areaLabel: l.area_label,
    available,
    // A listing can be posted without a title (it is optional on the form), and
    // an empty headline would leave the card's first line blank — the type +
    // area line the feed card falls back to is used here too.
    title: l.title?.trim() || [bhk ? `${bhk} BHK` : null, type?.label, l.area_label ? `in ${l.area_label}` : null]
      .filter(Boolean).join(" ") || "Property",
    typeLabel: type?.label ?? null,
    specs: stripFor(type, attrs, ctx, l.kind ?? "sell"),
    negotiable: Boolean(l.is_negotiable) && !l.price_on_request,
    subtitle: null,
    saved: ctx.saved.has(l.id),
    postedLabel: l.live_at ? timeAgo(l.live_at) : null,
    href: `/property/${l.id}`,
  };
}

/** One live project → a story segment. */
function projectSegment(p: any, ctx: SegCtx, available: boolean): StorySegment {
  const u = ctx.units.get(p.id);
  const type = p.project_type ? ctx.projTypes.get(p.project_type) : undefined;
  const band = u?.from != null
    ? u.to != null && u.to !== u.from
      ? `${formatShortRupees(u.from)} – ${formatShortRupees(u.to)}`
      : `${formatShortRupees(u.from)} onwards`
    : "Price on request";
  return {
    id: p.id,
    kind: "project",
    cover: p.cover_url,
    // The price line used to be the project NAME, so a scheme's story showed
    // its name where every property showed a price and no price anywhere.
    price: band,
    meta: p.area_label ?? "",
    areaLabel: p.area_label,
    available,
    title: p.name,
    typeLabel: type?.label ?? null,
    // The four `source: 'column'` candidates (towers/floors/units/available)
    // live on the row, not in `attributes` — merged in so the config can name
    // either without the strip knowing the difference (same as the detail DTO).
    specs: stripFor(
      type,
      {
        ...((p.attributes ?? {}) as Record<string, unknown>),
        towers: p.towers, floors: p.floors, total_units: p.total_units, available_units: p.available_units,
      },
      ctx,
      "sell",
    ),
    negotiable: false,
    subtitle: u?.types.length ? u.types.join(", ") : null,
    saved: false, // saves are listing-scoped; a project has no bookmark yet
    postedLabel: p.live_at ? timeAgo(p.live_at) : null,
    href: `/project/${p.id}`,
  };
}

/**
 * Build the story row for a viewer.
 *
 * `pickedCityId` is the guest's city-chip choice (validated server-side; a
 * signed-in profile's city always wins). The row sits directly under that chip,
 * so it scoping differently from the chip's label was the most visible half of
 * the guest-city bug.
 */
export async function getStories(viewerId: string | null, pickedCityId?: string | null): Promise<StoryCircle[]> {
  const scope = await feedScope(viewerId, pickedCityId ?? null);
  // Story SEEN state is keyed by the viewer's real city, not the widened one —
  // otherwise widening would reset every ring the viewer had already watched.
  const cityId = scope.cityId;
  const since = new Date(Date.now() - DAY_MS).toISOString();

  // Approved-in-last-24h listings + projects in the city.
  let lq = db()
    .from("listings")
    .select("id,profile_id,cover_url,title,type_code,kind,is_negotiable,price_paise,price_on_request,area_label,area_id,attributes,area_sqft,live_at")
    .eq("status", "live").eq("availability", "available")
    .gte("live_at", since)
    // A12's "Remove story" (template 1416) sets this. Stories are DERIVED from
    // live_at, so without a suppression flag an admin-removed story came back
    // on the very next feed read — the button wrote nothing.
    .is("story_suppressed_at", null)
    .order("live_at", { ascending: false });
  lq = applyFeedScope(lq, scope);
  if (viewerId) lq = lq.neq("profile_id", viewerId); // never a "your story" circle (Doc2 §9.3)

  let pq = db()
    .from("projects")
    .select("id,profile_id,cover_url,name,project_type,attributes,towers,floors,total_units,available_units,area_label,area_id,live_at")
    .eq("status", "live")
    .gte("live_at", since)
    .is("story_suppressed_at", null)
    .order("live_at", { ascending: false });
  pq = applyFeedScope(pq, scope);
  if (viewerId) pq = pq.neq("profile_id", viewerId);

  const [{ data: lRows }, { data: pRows }] = await Promise.all([lq, pq]);
  let listings = (lRows ?? []) as any[];
  let projects = (pRows ?? []) as any[];

  // Which boosts target THIS viewer (Doc2 §13). Placement used to be a bare
  // `status = 'active'` read, so an area-targeted boost in another city put a
  // gold ring at the front of everyone's row.
  const placements = await placementsFor(
    { cityId, stateId: scope.stateId },
    ["listing", "project"],
  );
  const boostedIds = placements.rank;

  // Doc2 §13 promises "story-row first" for the areas targeted, and a state or
  // All-India boost targets viewers outside the subject's own city — which the
  // city-scoped queries above filter out. Fetch those explicitly (still inside
  // the 24h story window, still live, still not the viewer's own).
  const missingListing = outOfCityIds(placements, "listing").filter((id) => !listings.some((l) => l.id === id));
  const missingProject = outOfCityIds(placements, "project").filter((id) => !projects.some((p) => p.id === id));
  if (missingListing.length || missingProject.length) {
    const [extraL, extraP] = await Promise.all([
      missingListing.length
        ? db().from("listings")
            .select("id,profile_id,cover_url,title,type_code,kind,is_negotiable,price_paise,price_on_request,area_label,area_id,attributes,area_sqft,live_at")
            .in("id", missingListing).eq("status", "live").eq("availability", "available").gte("live_at", since).is("story_suppressed_at", null)
            .neq("profile_id", viewerId ?? NIL)
        : Promise.resolve({ data: [] }),
      missingProject.length
        ? db().from("projects")
            .select("id,profile_id,cover_url,name,project_type,attributes,towers,floors,total_units,available_units,area_label,area_id,live_at")
            .in("id", missingProject).eq("status", "live").gte("live_at", since).is("story_suppressed_at", null)
            .neq("profile_id", viewerId ?? NIL)
        : Promise.resolve({ data: [] }),
    ]);
    listings = [...((extraL.data ?? []) as any[]), ...listings];
    projects = [...((extraP.data ?? []) as any[]), ...projects];
  }

  const posterIds = [...new Set([...listings, ...projects].map((r) => r.profile_id))];
  if (!posterIds.length) return [];

  const [{ data: profs }, { data: vers }, seen, ctx] = await Promise.all([
    db().from("profiles").select("id,name,username,photo_url,role").in("id", posterIds),
    db().from("verifications").select("profile_id").eq("level", "phone").eq("status", "approved").in("profile_id", posterIds),
    seenSet(viewerId, cityId),
    segCtx(viewerId, listings.map((l) => l.id), projects.map((p) => p.id)),
  ]);
  const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
  const verifiedSet = new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id));

  // Group by poster: one circle per poster, segments = their items (boosted first).
  const byPoster = new Map<string, { segments: StorySegment[]; boosted: boolean; isProject: boolean }>();
  const order: string[] = [];

  const pushSeg = (posterId: string, seg: StorySegment, boosted: boolean, isProject: boolean) => {
    if (!byPoster.has(posterId)) { byPoster.set(posterId, { segments: [], boosted: false, isProject: false }); order.push(posterId); }
    const c = byPoster.get(posterId)!;
    c.segments.push(seg);
    c.boosted = c.boosted || boosted;
    c.isProject = c.isProject || isProject;
  };

  for (const l of listings) pushSeg(l.profile_id, propertySegment(l, ctx, true), boostedIds.has(l.id), false);
  // Projects are boostable too (Doc2 §13) — this was hard-coded `false`.
  for (const p of projects) pushSeg(p.profile_id, projectSegment(p, ctx, true), boostedIds.has(p.id), true);

  // Boosted posters first, then insertion (recency) order.
  const circles: (StoryCircle & { boostRank: number })[] = order.map((posterId) => {
    const g = byPoster.get(posterId)!;
    const prof = profMap.get(posterId) ?? {};
    const allSeen = g.segments.every((s) => seen.has(s.id));
    const ring: Ring = g.boosted ? "boosted" : allSeen ? "seen" : g.isProject ? "project" : "unseen";
    // Doc2 §9.3: "boosted-seen → normal position (no re-first)". Once the viewer
    // has watched a boosted circle it stops jumping the queue on every refresh —
    // otherwise the same gold ring sat at slot 0 all day, which is what made the
    // row feel stale rather than promoted.
    const jumpsQueue = g.boosted && !allSeen;
    return {
      posterId, posterName: prof.name ?? "HomzList user", posterUsername: prof.username ?? null,
      posterAvatar: prof.photo_url ?? null,
      verified: verifiedSet.has(posterId), ring, boosted: g.boosted, isProject: g.isProject, segments: g.segments,
      // FIFO among boosted circles, mirroring the feed's tie-break.
      boostRank: jumpsQueue ? Math.min(...g.segments.map((s) => boostedIds.get(s.id) ?? Number.MAX_SAFE_INTEGER)) : Number.MAX_SAFE_INTEGER,
    };
  });
  circles.sort((a, b) => a.boostRank - b.boostRank);
  return circles.map(({ boostRank: _boostRank, ...c }) => c);
}

async function seenSet(viewerId: string | null, cityId: string | null): Promise<Set<string>> {
  if (!viewerId || !cityId) return new Set();
  const { data } = await db().from("story_seen").select("segment_id").eq("profile_id", viewerId).eq("city_id", cityId);
  return new Set(((data ?? []) as { segment_id: string }[]).map((s) => s.segment_id));
}

/** Mark a segment seen for this (viewer, city). No view-count is ever exposed. */
export async function markSeen(viewerId: string, cityId: string, segmentId: string): Promise<void> {
  await db().from("story_seen").upsert(
    { profile_id: viewerId, city_id: cityId, segment_id: segmentId },
    { onConflict: "profile_id,city_id,segment_id" },
  );
}

/**
 * One segment's media + overlay data (Doc7 §86). Mid-24h the listing may have
 * sold/hidden → `available:false` drives the viewer's "no longer available"
 * state. The cover is the (currently public) photo URL; a private story bucket
 * with signed 24h URLs is a later hardening (PENDING).
 */
export async function storySegment(segmentId: string, viewerId: string | null = null): Promise<StorySegment | null> {
  const { data: l } = await db()
    .from("listings")
    .select("id,cover_url,title,type_code,kind,is_negotiable,price_paise,price_on_request,area_label,attributes,area_sqft,status,availability,live_at,story_suppressed_at")
    .eq("id", segmentId).maybeSingle();
  if (l) {
    const row = l as any;
    // GATE (Doc9 IDOR + Doc2 §9.3): a segment is only exposed if the listing was
    // GENUINELY a story — approved and live within the last 24h. A draft/rejected
    // listing (live_at null / not fresh) was never a story → 404, so its
    // price/cover/area never leak. A listing that went sold/hidden mid-window
    // still has a fresh live_at → `available:false` drives "no longer available".
    const fresh = row.live_at && Date.now() - new Date(row.live_at).getTime() < DAY_MS;
    if (!fresh || row.story_suppressed_at) return null;
    const available = row.status === "live" && row.availability === "available";
    return propertySegment(row, await segCtx(viewerId, [row.id], []), available);
  }
  const { data: p } = await db()
    .from("projects")
    .select("id,cover_url,name,project_type,attributes,towers,floors,total_units,available_units,area_label,status,live_at,story_suppressed_at")
    .eq("id", segmentId).maybeSingle();
  if (p) {
    const row = p as any;
    const fresh = row.live_at && Date.now() - new Date(row.live_at).getTime() < DAY_MS;
    if (!fresh || row.story_suppressed_at) return null; // never a story → 404 (no leak)
    return projectSegment(row, await segCtx(viewerId, [], [row.id]), row.status === "live");
  }
  return null;
}
