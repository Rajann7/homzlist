import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveViewerCity } from "@/lib/location/viewer-city";
import { stateIdOfCity } from "@/lib/billing/placement";

/**
 * The location scope ONE feed request runs under.
 *
 * Two things it settles, once, so no two queries in the same response can
 * disagree:
 *
 *   • WHICH city (see lib/location/viewer-city — profile wins, guest's
 *     validated pick otherwise).
 *   • Whether that city is EMPTY and the request should widen to ALL INDIA.
 *
 * The widening is Doc4 §9's "new-city empty (+nearby auto)". It used to fall
 * back one level, to the rest of the STATE (0126/0127) — Rajan changed it to the
 * whole country on 9 Aug 2026, because a state fallback still left a blank feed
 * for anyone who picked a city in a state we have not opened at all, which is
 * exactly the "no content" problem the fallback exists to prevent. Now there is
 * always something to show.
 *
 * It fires ONLY when the city is genuinely empty of both listings and projects,
 * so a city with any inventory behaves exactly as it did before. And the label
 * follows the scope: a widened feed drops the place name from its subtitles
 * entirely ("48 live projects", not "48 live projects in Rajkot"), because the
 * cards under it come from everywhere. The screen says so in words too — see
 * `CityEmptyNotice`, driven by the `widened` flag this returns.
 */

const db = () => createServiceClient();

export interface FeedScope {
  cityId: string | null;
  cityName: string | null;
  stateId: string | null;
  /**
   * true → the viewer's city has nothing live, so the feed is showing ALL
   * INDIA. Queries drop their location predicate and subtitles drop the place.
   */
  widened: boolean;
  /** What a subtitle should say after "in" — null when widened (all India). */
  placeLabel: string | null;
}

/** Does this city hold ANY live inventory? Two head counts, no rows fetched. */
async function cityHasInventory(cityId: string): Promise<boolean> {
  const [{ count: l }, { count: p }] = await Promise.all([
    db().from("listings").select("id", { count: "exact", head: true })
      .eq("status", "live").eq("availability", "available").eq("city_id", cityId),
    db().from("projects").select("id", { count: "exact", head: true })
      .eq("status", "live").eq("city_id", cityId),
  ]);
  return (l ?? 0) > 0 || (p ?? 0) > 0;
}

export async function feedScope(viewerId: string | null, pickedCityId?: string | null): Promise<FeedScope> {
  const cityId = await resolveViewerCity(viewerId, pickedCityId);
  if (!cityId) {
    return { cityId: null, cityName: null, stateId: null, widened: false, placeLabel: null };
  }

  // The state is still resolved: it is not a scope any more, but boost
  // targeting reads it (a boost can be bought for a state), so `placementsFor`
  // still needs to know which one the viewer sits in.
  const stateId = await stateIdOfCity(cityId);
  const [{ data: names }, hasInventory] = await Promise.all([
    db().from("locations").select("id,name").eq("id", cityId),
    cityHasInventory(cityId),
  ]);
  const cityName = ((names ?? []) as { id: string; name: string }[])[0]?.name ?? null;

  // No state condition any more: All India is always somewhere to widen INTO,
  // so a city we cannot climb to a state from still gets a full feed.
  const widened = !hasInventory;

  return {
    cityId,
    cityName,
    stateId,
    widened,
    // Widened cards come from every city in the country, so naming one would be
    // the subtitle lying about the rows beneath it.
    placeLabel: widened ? null : cityName,
  };
}

/**
 * Apply a scope to any `listings` / `projects` query.
 *
 * A widened scope adds NO predicate at all — that is what "all India" means
 * here. Before 9 Aug 2026 it filtered by `state_id`; that column is still
 * written and indexed, it is simply not what the feed scopes on any more.
 */
export function applyFeedScope<Q extends { eq: (col: string, val: string) => Q }>(q: Q, scope: FeedScope): Q {
  if (scope.widened) return q;
  if (scope.cityId) return q.eq("city_id", scope.cityId);
  return q;
}
