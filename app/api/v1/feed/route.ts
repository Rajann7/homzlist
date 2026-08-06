import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getFeed, type FeedFilter, type FeedSort } from "@/lib/feed/service";

/**
 * GET /api/v1/feed (Doc7 §78) — the Property-mode feed. Guest-readable (the
 * public feed is fully browsable; actions gate to login client-side). Ranking,
 * city scope and own-exclusion are all server-decided.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const claims = await getCurrentUser();
  const url = new URL(req.url);
  const filterRaw = url.searchParams.get("filter");
  const sortRaw = url.searchParams.get("sort");
  const filter: FeedFilter = filterRaw === "buy" || filterRaw === "rent" ? filterRaw : "all";
  const sort: FeedSort = ["latest", "nearby", "price_asc", "price_desc"].includes(sortRaw ?? "") ? (sortRaw as FeedSort) : "latest";

  // Guest's city-chip pick; validated server-side and ignored for anyone whose
  // profile already has a city (lib/location/viewer-city).
  const res = await getFeed(claims?.sub ?? null, {
    filter, sort, cursor: url.searchParams.get("cursor"), cityId: url.searchParams.get("city"),
  });
  return ok(res);
}
