import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { storySegment } from "@/lib/feed/stories";

/**
 * GET /api/v1/stories/:id (Doc7 §86) — one story segment's media + overlay. A
 * sold/hidden listing (mid-24h) returns `available:false`, which drives the
 * viewer's "no longer available" state. Guest-readable, so IP-rate-limited to
 * stop enumeration (this is the id-probing surface). `storySegment` itself only
 * returns segments that were genuinely live within 24h — a draft/rejected id
 * 404s, so nothing private leaks.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const limited = await rateLimit(`story-seg:${clientIp(req.headers)}`, 120, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");
  const seg = await storySegment(params.id);
  if (!seg) return fail("NOT_FOUND");
  return ok({ segment: seg });
}
