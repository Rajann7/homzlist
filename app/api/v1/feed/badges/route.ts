import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { headerBadges } from "@/lib/feed/interactions";

/**
 * GET /api/v1/feed/badges — counts for the P2 header's bell + message icons.
 *
 * Auth-only: a guest has no inbox, so no badge. `messages` is a real count of
 * inquiries awaiting my response; `notifications` is null until Module 10 owns
 * a notifications table (never a fabricated number).
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed-badges:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const claims = await getCurrentUser();
  if (!claims) return ok({ messages: 0, notifications: null });
  return ok(await headerBadges(claims.sub));
}
