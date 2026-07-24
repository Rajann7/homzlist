import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { suggested } from "@/lib/feed/service";

/** GET /api/v1/feed/suggested (Doc7 §81) — the "Suggested for you" strip. */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(`feed-sug:${clientIp(req.headers)}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const claims = await getCurrentUser();
  return ok({ items: await suggested(claims?.sub ?? null) });
}
