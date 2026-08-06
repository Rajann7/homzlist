import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { DashboardCounts } from "./service.types";

export type { DashboardCounts };

/**
 * Dashboard hub counts (P2 header → grid icon → Dashboard).
 *
 * Every number on that screen is one real query against the table the
 * destination itself reads, so a tile can never disagree with the screen it
 * opens (CLAUDE.md rule 12/13 — no hardcoded counts, no client-derived
 * business values). Nothing here is cached or precomputed: the hub is opened
 * rarely and each of these is a `head: true` COUNT with an index-backed filter.
 *
 * All of them run in ONE Promise.all — nine counts is nine round trips if you
 * await them in sequence, which is exactly the N+1 the protocol's Phase 6E
 * rejects.
 *
 * A count that cannot be resolved comes back 0 rather than throwing: a single
 * failing table must not blank the whole hub (the same lesson as `Icon`'s
 * unknown-name fallback).
 */

const db = () => createServiceClient();

const ZERO: DashboardCounts = {
  listings: 0,
  leads: 0,
  browseRequirements: 0,
  myRequirements: 0,
  proposals: 0,
  visits: 0,
  boosts: 0,
  plan: null,
};

/** `head: true` count that yields 0 instead of throwing. */
async function count(build: () => PromiseLike<{ count: number | null }>): Promise<number> {
  try {
    const { count: n } = await build();
    return n ?? 0;
  } catch {
    return 0;
  }
}

export async function dashboardCounts(profileId: string): Promise<DashboardCounts> {
  if (!profileId) return ZERO;

  // The browse count is city-scoped exactly the way `browseRequirements()`
  // scopes its query, so the tile's number matches the list it opens. Read the
  // city first because the count below filters on it.
  let cityId: string | null = null;
  try {
    const { data } = await db().from("profiles").select("city_id").eq("id", profileId).maybeSingle();
    cityId = (data as { city_id: string | null } | null)?.city_id ?? null;
  } catch {
    cityId = null;
  }

  const nowIso = new Date().toISOString();

  const [listings, leads, browse, myReqs, proposals, visits, boosts, plan] = await Promise.all([
    count(() =>
      db().from("listings").select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("status", "live"),
    ),
    // Same `is_relevant` filter the Leads screen and the profile stat use —
    // three surfaces, one definition of a lead.
    count(() =>
      db().from("leads").select("id", { count: "exact", head: true })
        .eq("owner_id", profileId)
        .eq("is_relevant", true)
        .eq("stage", "new"),
    ),
    count(() => {
      let q = db().from("requirements").select("id", { count: "exact", head: true })
        .eq("status", "live")
        .eq("is_active", true)
        .neq("profile_id", profileId); // never browse your own
      if (cityId) q = q.eq("city_id", cityId);
      return q;
    }),
    count(() =>
      db().from("requirements").select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("status", "live")
        .eq("is_active", true),
    ),
    count(() =>
      db().from("proposals").select("id", { count: "exact", head: true })
        .eq("sender_id", profileId)
        .eq("status", "pending"),
    ),
    count(() =>
      db().from("visits").select("id", { count: "exact", head: true })
        .eq("buyer_id", profileId)
        .in("status", ["proposed", "confirmed"])
        .gte("scheduled_at", nowIso),
    ),
    count(() =>
      db().from("boosts").select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("status", "active"),
    ),
    activePlanName(profileId),
  ]);

  return { listings, leads, browseRequirements: browse, myRequirements: myReqs, proposals, visits, boosts, plan };
}

/**
 * The name of the plan the seller is actually on right now.
 *
 * "Active" here means what My Plan means by it (`myPlanDTO`): status active AND
 * not past its expiry — a row can still say `active` after `expires_at` until
 * the expiry job sweeps it, and showing a lapsed plan as current on the hub
 * would be the UI telling a lie the server would not back up.
 */
async function activePlanName(profileId: string): Promise<string | null> {
  try {
    const { data } = await db()
      .from("user_plans")
      .select("name,expires_at")
      .eq("profile_id", profileId)
      .eq("status", "active")
      .order("purchased_at", { ascending: false });
    const now = Date.now();
    const live = ((data ?? []) as { name: string; expires_at: string | null }[])
      .find((p) => !p.expires_at || new Date(p.expires_at).getTime() > now);
    return live?.name ?? null;
  } catch {
    return null;
  }
}
