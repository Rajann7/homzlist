import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { resolveViewerCity } from "@/lib/location/viewer-city";
import { activeFeedBanner } from "@/lib/feed/service";

/**
 * GET /api/v1/feed/banner (P2 admin banner; Doc2 §9) — the active feed banner
 * for THIS viewer, or null. Guest-readable. Content comes from the `feed_banners`
 * table (migration 0027); the P15 admin CMS manages it. The viewer's role + city
 * are resolved so a role/city-targeted banner reaches only its audience.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed-banner:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const claims = await getCurrentUser();
  const pickedCity = new URL(req.url).searchParams.get("city");
  const cityId = await resolveViewerCity(claims?.sub ?? null, pickedCity);
  return ok({ banner: await activeFeedBanner({ role: claims?.role ?? null, cityId }) });
}
