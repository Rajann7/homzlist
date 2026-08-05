import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { paramsToFilters, activeFilterCount } from "@/lib/search/filters";
import {
  searchProperties, searchProjects, searchBrokers, searchAreas, countProperties,
} from "@/lib/search/service";
import { recordRecent } from "@/lib/search/recents";
import type { SearchSort, SearchTab } from "@/lib/search/types";

/**
 * GET /api/v1/search (Doc7 §109).
 *
 * Guest-readable — the public host is the SEO/browse surface and search has to
 * work logged-out. What differs for a signed-in viewer is decided HERE, never
 * by the client: own listings are excluded, saved-flags are resolved, and the
 * query is recorded into their recents.
 *
 * `?count=1` returns only the exact match count — that is what the filter
 * sheet's live "Show N properties" button calls on every chip tap.
 */
export const dynamic = "force-dynamic";

const TABS: SearchTab[] = ["all", "properties", "projects", "brokers", "areas"];
const SORTS: SearchSort[] = ["latest", "nearby", "price_asc", "price_desc"];

export async function GET(req: NextRequest) {
  // Doc3 §3.3 per-endpoint rate limits: "search medium".
  const limited = await rateLimit(`search:${clientIp(req.headers)}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  const viewerId = claims?.sub ?? null;
  const url = new URL(req.url);
  const filters = paramsToFilters(url.searchParams);

  const tabRaw = url.searchParams.get("tab");
  const tab: SearchTab = TABS.includes(tabRaw as SearchTab) ? (tabRaw as SearchTab) : "all";
  const sortRaw = url.searchParams.get("sort");
  const sort: SearchSort = SORTS.includes(sortRaw as SearchSort) ? (sortRaw as SearchSort) : "latest";

  try {
    // Count-only mode for the filter sheet.
    if (url.searchParams.get("count") === "1") {
      const total = await countProperties(filters, viewerId);
      return ok({ total, filterCount: activeFilterCount(filters) });
    }

    if (tab === "projects") {
      const r = await searchProjects(filters, viewerId, 12, url.searchParams.get("cursor"));
      return ok({ tab, ...r, filterCount: activeFilterCount(filters) });
    }
    if (tab === "brokers") {
      // The tab has no "load more", so the page size has to cover a city's
      // sellers rather than a screen's worth — otherwise the header ("21
      // sellers") counts rows the list never shows. Beyond 100 it would still
      // truncate; recorded in docs/PENDING-INTEGRATIONS.md.
      const r = await searchBrokers(filters, viewerId, 100);
      return ok({ tab, ...r, filterCount: activeFilterCount(filters) });
    }
    if (tab === "areas") {
      const r = await searchAreas(filters);
      return ok({ tab, ...r, filterCount: activeFilterCount(filters) });
    }

    const result = await searchProperties(filters, {
      tab, sort, cursor: url.searchParams.get("cursor"),
    }, viewerId);

    // Recording happens on the FIRST page only, so paging through results does
    // not keep rewriting the same recent row.
    if (viewerId && filters.q && !url.searchParams.get("cursor")) {
      await recordRecent(viewerId, filters.q, "property", { kind: "text", slug: null });
    }

    return ok({ tab, sort, ...result, filterCount: activeFilterCount(filters) });
  } catch (err) {
    // Doc9 §20 production error hygiene: detail stays server-side.
    console.error("[search] failed", err);
    return fail("SERVER_ERROR");
  }
}
