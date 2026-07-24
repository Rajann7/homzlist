import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { notInterested } from "@/lib/feed/interactions";

/** POST /api/v1/feed/not-interested (Doc7 §82) — down-rank a type or area. */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const limited = await rateLimit(`not-interested:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const typeCode = typeof body.typeCode === "string" ? body.typeCode : null;
  const areaId = typeof body.areaId === "string" && UUID_RE.test(body.areaId) ? body.areaId : null;
  const res = await notInterested(claims.sub, { typeCode, areaId });
  if (!res.ok) return fail("VALIDATION_ERROR");
  return ok({ ok: true });
}
