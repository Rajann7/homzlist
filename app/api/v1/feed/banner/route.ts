import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { activeFeedBanner } from "@/lib/feed/service";

/**
 * GET /api/v1/feed/banner (P2 admin banner; Doc2 §9) — the single active feed
 * banner, or null. Guest-readable (the banner shows to everyone). Content comes
 * from the `feed_banners` table (migration 0027); the P15 admin CMS manages it.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed-banner:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  return ok({ banner: await activeFeedBanner() });
}
