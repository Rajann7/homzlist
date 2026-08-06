import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { newCount } from "@/lib/feed/service";

/**
 * GET /api/v1/feed/new-count?since=<iso> (Doc7 §83) — how many new listings
 * since a timestamp. The CLIENT decides whether to show the "New listings" pill
 * (only after ≥30s on feed); the server just answers the count.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed-nc:${clientIp(req.headers)}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const claims = await getCurrentUser();
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const sinceIso = since && !Number.isNaN(Date.parse(since)) ? since : new Date(Date.now() - 60_000).toISOString();
  return ok({ count: await newCount(claims?.sub ?? null, sinceIso, url.searchParams.get("city")) });
}
