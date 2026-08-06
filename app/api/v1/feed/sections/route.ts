import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getFeedSections } from "@/lib/feed/sections";
import type { FeedFilter } from "@/lib/feed/service";

/**
 * GET /api/v1/feed/sections — which rails the carousel feed draws, in order.
 *
 * Metadata only (title, subtitle, count, View-all target); each rail then
 * fetches its own cards from /api/v1/feed/section as it scrolls into view. That
 * split is what makes auto-hide free — a type with nothing live is simply not
 * in this list, so the client has nothing to render — and it keeps the first
 * paint to one small query instead of twenty rails' worth of cards.
 *
 * Guest-readable, same as the feed itself.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const claims = await getCurrentUser();
  const url = new URL(req.url);
  const filterRaw = url.searchParams.get("filter");
  const filter: FeedFilter = filterRaw === "buy" || filterRaw === "rent" ? filterRaw : "all";

  try {
  // Guest's city-chip pick; validated server-side and ignored for anyone whose
  // profile already has a city (lib/location/viewer-city).
    const sections = await getFeedSections(claims?.sub ?? null, { filter, cityId: url.searchParams.get("city") });
    return ok({ sections });
  } catch (err) {
    // Doc9 §20: the detail stays in the log, the caller gets a clean code.
    console.error("[feed/sections] failed", err);
    return fail("SERVER_ERROR");
  }
}
