import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { BoostSubjectKind } from "./boost";

/**
 * Boost PLACEMENT — the read side of Doc2 §13, used by the feed, the story row,
 * search, explore and requirement browse.
 *
 * One function decides "which boosts apply to THIS viewer, in what order", and
 * every surface calls it. That matters for two reasons:
 *
 *  1. Targeting has to be honoured. Before this, placement was `status =
 *     'active'` and nothing else, so an "All India" boost (₹1,499) never left
 *     its own city — the feed filters candidates by the viewer's city — while a
 *     "this area only" boost topped the entire city feed. Both were wrong in
 *     opposite directions. Matching is now against the resolved
 *     `target_area_id` / `target_city_id` / `target_state_id` (migration 0038).
 *
 *  2. FIFO has to be consistent. Doc2 §9.1's tie-break is "boost start, then
 *     listing date". If each surface ordered boosts its own way, the same two
 *     boosts would swap places between feed and search.
 *
 * `paused` boosts (admin-hide, Doc2 §13) are deliberately absent: only `active`
 * is ever placed, so a pause takes effect on the next request everywhere at
 * once with no separate un-placement step.
 */

const db = () => createServiceClient();

export interface ViewerScope {
  cityId: string | null;
  stateId: string | null;
  /**
   * The areas the current surface is scoped to — a search filtered to Mavdi, or
   * an area landing page. When set, an `area`-targeted boost only places if its
   * area is one of these; a Mavdi boost must not top the Raiya Road page.
   */
  areaIds?: string[] | null;
}

export interface Placement {
  boostId: string;
  subjectKind: BoostSubjectKind;
  subjectId: string;
  targeting: "area" | "city" | "state" | "india";
  startsAt: string | null;
}

export interface PlacementSet {
  /** subject id → FIFO rank (0 = first). Only ids that apply to this viewer. */
  rank: Map<string, number>;
  ids: string[];
  all: Placement[];
}

const EMPTY: PlacementSet = { rank: new Map(), ids: [], all: [] };

/**
 * Every boost live right now, filtered to the ones that target this viewer and
 * ranked FIFO by boost start.
 *
 * `kinds` scopes the read to what the calling surface can actually render — the
 * property feed asks for listings + projects, requirement browse asks for
 * requirements — so a boosted requirement can never leak into the property feed
 * (and vice versa) by accident.
 */
export async function placementsFor(
  viewer: ViewerScope,
  kinds: BoostSubjectKind[] = ["listing", "project"],
): Promise<PlacementSet> {
  if (!kinds.length) return EMPTY;
  const nowIso = new Date().toISOString();

  const { data, error } = await db()
    .from("boosts")
    .select("id,listing_id,subject_kind,targeting,target_area_id,target_city_id,target_state_id,starts_at")
    .eq("status", "active")
    .in("subject_kind", kinds)
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("starts_at", { ascending: true });

  // A placement read must never break a feed — an unranked feed is a degraded
  // feed, a 500 is a dead screen.
  if (error) return EMPTY;

  const rows = (data ?? []) as {
    id: string; listing_id: string; subject_kind: BoostSubjectKind;
    targeting: Placement["targeting"];
    target_area_id: string | null; target_city_id: string | null; target_state_id: string | null;
    starts_at: string | null;
  }[];

  const areaScope = viewer.areaIds?.filter(Boolean) ?? [];
  const matched: Placement[] = [];

  for (const b of rows) {
    if (!appliesTo(b, viewer, areaScope)) continue;
    matched.push({
      boostId: b.id,
      subjectKind: b.subject_kind,
      subjectId: b.listing_id,
      targeting: b.targeting,
      startsAt: b.starts_at,
    });
  }

  const rank = new Map<string, number>();
  for (const p of matched) if (!rank.has(p.subjectId)) rank.set(p.subjectId, rank.size);
  return { rank, ids: [...rank.keys()], all: matched };
}

/**
 * Does one boost target this viewer?
 *
 * A viewer with NO known location (a guest who hasn't picked a city) sees the
 * national feed, so every live boost applies — refusing them all would mean a
 * boost simply doesn't exist for the largest slice of traffic.
 */
function appliesTo(
  b: { targeting: Placement["targeting"]; target_area_id: string | null; target_city_id: string | null; target_state_id: string | null },
  viewer: ViewerScope,
  areaScope: string[],
): boolean {
  if (b.targeting === "india") return true;

  const viewerHasLocation = Boolean(viewer.cityId || viewer.stateId || areaScope.length);
  if (!viewerHasLocation) return true;

  if (b.targeting === "state") {
    if (!viewer.stateId) return false;
    return b.target_state_id === viewer.stateId;
  }

  if (b.targeting === "city") {
    if (!viewer.cityId) return false;
    return b.target_city_id === viewer.cityId;
  }

  // area: the surface's area scope decides when we have one; otherwise the city
  // is the finest granularity we know about the viewer (profiles carry a city,
  // never an area), and an area boost is a city-feed boost.
  if (areaScope.length) return !!b.target_area_id && areaScope.includes(b.target_area_id);
  if (!viewer.cityId) return false;
  return b.target_city_id === viewer.cityId;
}

/**
 * The viewer's location for placement purposes: their profile city, plus the
 * state that city sits under. Cached per request by the caller (each surface
 * resolves it once and passes it down).
 */
export async function viewerScope(viewerId: string | null, cityIdOverride?: string | null): Promise<ViewerScope> {
  let cityId = cityIdOverride ?? null;
  if (!cityId && viewerId) {
    const { data } = await db().from("profiles").select("city_id").eq("id", viewerId).maybeSingle();
    cityId = (data as { city_id: string | null } | null)?.city_id ?? null;
  }
  if (!cityId) return { cityId: null, stateId: null };
  return { cityId, stateId: await stateIdOfCity(cityId) };
}

/**
 * Climb `locations` from a city to its state. The tree is
 * state → district → taluka → city → area, so a single `parent_id` read lands
 * on the taluka, not the state.
 */
const stateOfCityCache = new Map<string, string | null>();
const CITY_STATE_TTL_MS = 5 * 60_000;
let cityStateCachedAt = Date.now();

export async function stateIdOfCity(cityId: string): Promise<string | null> {
  // Every feed, search and story request resolves this. The `locations` master is
  // small and effectively static (only Module 4's master-data admin writes it), so
  // it is memoised rather than climbed 4 levels on every page load — with a short
  // TTL so a re-parented city isn't cached until the next deploy. Public master
  // data only; nothing per-user is ever held here.
  if (Date.now() - cityStateCachedAt >= CITY_STATE_TTL_MS) {
    stateOfCityCache.clear();
    cityStateCachedAt = Date.now();
  }
  const hit = stateOfCityCache.get(cityId);
  if (hit !== undefined) return hit;
  let cursor: string | null = cityId;
  for (let i = 0; i < 6 && cursor; i++) {
    const { data } = await db().from("locations").select("id,level,parent_id").eq("id", cursor).maybeSingle();
    const row = data as { id: string; level: string; parent_id: string | null } | null;
    if (!row) break;
    if (row.level === "state") { stateOfCityCache.set(cityId, row.id); return row.id; }
    cursor = row.parent_id;
  }
  stateOfCityCache.set(cityId, null);
  return null;
}

/**
 * Boosted subject ids whose subject sits OUTSIDE the viewer's city but whose
 * targeting reaches them anyway (state / All-India boosts).
 *
 * The city-scoped feed and search queries would never produce these rows as
 * candidates, so the surface has to fetch them explicitly and prepend. Without
 * this, wider targeting is money for nothing — which is exactly what shipped
 * before Module 9.
 */
export function outOfCityIds(set: PlacementSet, kind: BoostSubjectKind): string[] {
  return set.all
    .filter((p) => p.subjectKind === kind && (p.targeting === "state" || p.targeting === "india"))
    .map((p) => p.subjectId);
}
