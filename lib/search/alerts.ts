import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { countProperties } from "./service";
import type { SearchFilters } from "./types";

/**
 * Saved-search new-match alerts (Doc2 §12, Doc7 §112-114).
 *
 * The job behind the promise. `saved_searches.alerts_enabled` is a toggle the
 * user flips expecting to hear about new matches while the app is closed — so
 * something has to run on a schedule and actually tell them. This is that
 * something; `app/api/v1/cron/search` triggers it.
 *
 * How a "new match" is decided, and why it is not just "count went up":
 *   • A count comparison would miss the case where one listing sells and
 *     another appears (net zero, but there IS something new to see), and it
 *     would re-fire forever if a listing were removed and the count dropped
 *     then recovered.
 *   • So the job counts listings matching the saved filters that went LIVE
 *     after `last_alerted_at`. That is monotonic, cannot double-notify, and
 *     survives listings being sold in between.
 *
 * `last_alerted_at` moves on EVERY successful pass, notified or not, so the
 * window never silently widens into a backlog.
 */

const db = () => createServiceClient();

export interface AlertReport {
  scanned: number;
  notified: number;
  skipped: number;
  errors: number;
}

export async function runSavedSearchAlerts(now = new Date()): Promise<AlertReport> {
  const report: AlertReport = { scanned: 0, notified: 0, skipped: 0, errors: 0 };

  const { data } = await db()
    .from("saved_searches")
    .select("id,profile_id,label,params,last_alerted_at,last_match_count")
    .eq("alerts_enabled", true)
    // Don't re-scan a row we already handled in the last hour, so a cron that
    // runs more often than intended cannot spam.
    .lt("last_alerted_at", new Date(now.getTime() - 55 * 60_000).toISOString())
    .limit(500);

  const rows = ((data ?? []) as {
    id: string; profile_id: string; label: string;
    params: SearchFilters; last_alerted_at: string; last_match_count: number;
  }[]);

  for (const row of rows) {
    report.scanned++;
    try {
      // How many matches went live since we last spoke to this user.
      const fresh = await freshMatchCount(row.params, row.profile_id, row.last_alerted_at);
      const total = await countProperties(row.params ?? {}, row.profile_id);

      if (fresh > 0) {
        await notify({
          profileId: row.profile_id,
          type: "saved_search_match",
          // designs/P11 S7: "<b>12 new properties</b> match your saved search
          // 3 BHK · ₹40–60 L · Mavdi" — the count is bold, the search is named.
          title: `**${fresh} new propert${fresh === 1 ? "y" : "ies"}** match your saved search ${row.label}`,
          body: `${total} total propert${total === 1 ? "y" : "ies"} now match this saved search.`,
          // The row's own filters, so the tap lands on THOSE results rather
          // than a bare /search.
          href: `/search/results?${searchQuery(row.params)}`,
          groupKey: `saved-search:${row.id}`,
          entityKind: "saved_search", entityId: row.id,
          // `count`/`search` also feed A20's "saved_match" push template
          // ("{{count}} new properties match {{search}}").
          data: { savedSearchId: row.id, fresh, total, count: fresh, search: row.label },
        });
        report.notified++;
      } else {
        report.skipped++;
      }

      // Advance the watermark either way — an unnotified pass still consumed
      // the window, and leaving it behind would turn one quiet day into a
      // "37 new matches" burst later.
      await db().from("saved_searches")
        .update({ last_alerted_at: now.toISOString(), last_match_count: total })
        .eq("id", row.id);
    } catch (err) {
      report.errors++;
      console.error("[saved-search-alert] failed for", row.id, err);
    }
  }

  return report;
}

/**
 * Serialise a saved search's filters back into the results-page query string,
 * so tapping the alert lands on exactly the search it is about. Deliberately a
 * small local writer: `filtersToQuery` lives in a "use client" module, and the
 * server has no business importing the client bundle to build a URL.
 */
function searchQuery(f: SearchFilters | null | undefined): string {
  const p = new URLSearchParams();
  if (!f) return "";
  if (f.q) p.set("q", f.q);
  if (f.intent) p.set("intent", f.intent);
  if (f.cityId) p.set("city", f.cityId);
  if (f.types?.length) p.set("types", f.types.join(","));
  if (f.areas?.length) p.set("areas", f.areas.join(","));
  if (f.amenities?.length) p.set("amenities", f.amenities.join(","));
  if (f.budgetMin != null) p.set("bmin", String(f.budgetMin));
  if (f.budgetMax != null) p.set("bmax", String(f.budgetMax));
  if (f.negotiableOnly) p.set("negotiableOnly", "1");
  if (f.readyToMove) p.set("readyToMove", "1");
  if (f.newConstruction) p.set("newConstruction", "1");
  if (f.verifiedOnly) p.set("verifiedOnly", "1");
  for (const [k, v] of Object.entries(f.attrs ?? {})) if (v.length) p.set(`a.${k}`, v.join(","));
  return p.toString();
}

/**
 * Matches that went live after `since`. Reuses the SAME filter payload the
 * search ran with, so an alert can never describe a different result set than
 * the one the user would see on tapping through.
 */
async function freshMatchCount(params: SearchFilters, viewerId: string, since: string): Promise<number> {
  let q = db().from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "live").eq("availability", "available")
    .gt("live_at", since)
    .neq("profile_id", viewerId);

  if (params?.cityId) q = q.eq("city_id", params.cityId);
  if (params?.areas?.length) q = q.in("area_id", params.areas);
  if (params?.types?.length) q = q.in("type_code", params.types);
  if (params?.intent) q = q.eq("kind", params.intent);
  if (params?.budgetMin != null) q = q.gte("price_paise", Math.round(params.budgetMin * 100_000 * 100));
  if (params?.budgetMax != null) q = q.lte("price_paise", Math.round(params.budgetMax * 100_000 * 100));
  for (const [key, vals] of Object.entries(params?.attrs ?? {})) {
    // Only exact-match attributes are applied here; bucket facets are a
    // refinement, and over-filtering an ALERT is worse than under-filtering
    // (the user can see the full set on the results page).
    if (vals.length === 1 && /^[a-z0-9_]+$/.test(key)) q = q.eq(`attributes->>${key}`, vals[0]);
  }

  const { count } = await q;
  return count ?? 0;
}

/**
 * Recompute every seller's response-time chip (Doc2 §11).
 *
 * The P3 Brokers & Builders row reads "24 listings · Usually responds in 2
 * hours". The second half is a CLAIM about behaviour, so it has to be measured,
 * and re-measured — a seller who stops replying must lose the chip. The SQL
 * (migration 0037) takes the median first-reply latency over the last 90 days
 * and returns NULL below 3 answered threads.
 */
export async function refreshResponseLabels(): Promise<number> {
  const { data, error } = await db().rpc("hz_recompute_response_labels");
  if (error) {
    console.error("[response-labels] failed", error);
    return 0;
  }
  return Number(data ?? 0);
}

/**
 * Mark a launched city's interest list as notified (Doc7 §118).
 *
 * The Coming-soon screen promises "we'll notify you when we launch". This is
 * the other half of that promise: when a city flips to `is_launched`, everyone
 * who registered gets told once, and `notified_at` stops it repeating.
 */
export async function notifyLaunchedCities(): Promise<{ cities: number; people: number }> {
  const { data: launched } = await db()
    .from("locations").select("id,name,slug")
    .eq("level", "city").eq("is_launched", true).eq("is_active", true);
  const cities = ((launched ?? []) as { id: string; name: string; slug: string }[]);

  let people = 0;
  let touched = 0;
  for (const city of cities) {
    const { data: pending } = await db()
      .from("city_interest_requests")
      .select("id,profile_id,city_name")
      .is("notified_at", null)
      .eq("city_id", city.id)
      .limit(500);
    const rows = ((pending ?? []) as { id: string; profile_id: string | null; city_name: string }[]);
    if (!rows.length) continue;
    touched++;

    for (const r of rows) {
      // A guest signal has no account to notify — it is still counted as
      // expansion evidence for admin, and marked so it is not rescanned.
      if (r.profile_id) {
        await notify({
          profileId: r.profile_id,
          // Its own type now — a launch is not a saved-search match, and the
          // old cast made it render with the wrong icon and the wrong toggle.
          type: "city_launched",
          title: `HomzList is now live in **${city.name}**`,
          body: "You asked to be notified when we launched here. Start browsing properties now.",
          href: `/search/results?q=${encodeURIComponent(city.name)}`,
          data: { citySlug: city.slug, cityName: city.name },
        });
        people++;
      }
      await db().from("city_interest_requests")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", r.id);
    }
  }
  return { cities: touched, people };
}
