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
 *   • Whether that city is EMPTY and the request should widen to the rest of
 *     the state.
 *
 * The widening is Doc4 §9's "new-city empty (+nearby auto)", and it is the same
 * rule the requirement surfaces already follow (Doc2 §7, amended 6 Aug 2026):
 * try the city, and only if the city has nothing at all fall back one level.
 * Without it, making the guest city chip real would have turned every visitor
 * who picks a city we have not opened yet from "sees everything" into "sees
 * nothing" — technically honest, but a worse product than before the fix.
 *
 * It fires ONLY when the city is genuinely empty of both listings and projects,
 * so a city with any inventory behaves exactly as it did before. And the label
 * follows the scope: a widened rail says "18 projects in Gujarat", never
 * "in Mumbai" over Rajkot cards.
 */

const db = () => createServiceClient();

export interface FeedScope {
  cityId: string | null;
  cityName: string | null;
  stateId: string | null;
  stateName: string | null;
  /** true → query by state_id instead of city_id, and label by state. */
  widened: boolean;
  /** What a subtitle should say after "in" — the state when widened. */
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
    return { cityId: null, cityName: null, stateId: null, stateName: null, widened: false, placeLabel: null };
  }

  const stateId = await stateIdOfCity(cityId);
  const [{ data: names }, hasInventory] = await Promise.all([
    db().from("locations").select("id,name").in("id", [cityId, ...(stateId ? [stateId] : [])]),
    cityHasInventory(cityId),
  ]);
  const nameOf = new Map(((names ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const cityName = nameOf.get(cityId) ?? null;
  const stateName = stateId ? nameOf.get(stateId) ?? null : null;

  // Widen only when there is a state to widen INTO. A city we cannot climb to a
  // state from stays city-scoped and simply renders its empty state.
  const widened = !hasInventory && Boolean(stateId);

  return {
    cityId,
    cityName,
    stateId,
    stateName,
    widened,
    placeLabel: widened ? stateName : cityName,
  };
}

/**
 * Apply a scope to any `listings` / `projects` query.
 *
 * Both tables have carried `state_id` since 0005/0056, so the widened case is a
 * real indexed predicate rather than "city_id in (every city of the state)".
 */
export function applyFeedScope<Q extends { eq: (col: string, val: string) => Q }>(q: Q, scope: FeedScope): Q {
  if (scope.widened && scope.stateId) return q.eq("state_id", scope.stateId);
  if (scope.cityId) return q.eq("city_id", scope.cityId);
  return q;
}
