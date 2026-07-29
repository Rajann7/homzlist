import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { browseRequirements } from "@/lib/listings/matching";
import { proposalBalance, builderMayPropose } from "@/lib/listings/proposals";

/**
 * GET /api/v1/feed/requirement-mode (Doc7 §79) — requirement cards in the feed
 * shell. Delegates to Module 5's `browseRequirements`, which already strips
 * locked cards server-side (unpaid → preview fields only, DevTools-proof) and
 * groups by the location cascade. Guest-readable (locked preview).
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed-req:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const claims = await getCurrentUser();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const type = url.searchParams.get("type");

  const { sections, unlocked, cityName } = await browseRequirements(claims?.sub ?? null, {
    kind: kind === "sell" || kind === "rent" ? kind : null,
    typeCode: type || null,
  });
  const balance = claims && unlocked ? await proposalBalance(claims.sub) : { left: 0, total: 0, unlimited: false };
  // Same builder rule the POST enforces (0087) — the card needs it to render a
  // reason instead of a Send button that is going to 403.
  const canPropose = claims ? await builderMayPropose(claims.sub) : true;
  return ok({ sections, unlocked, cityName, balance, canPropose });
}
