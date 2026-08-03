import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { pendingReacceptance, acceptLegal } from "@/lib/legal/service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clientIp } from "@/lib/auth/rate-limit";

/**
 * GET  /api/v1/cms/consent  — what this user still has to re-accept.
 * POST /api/v1/cms/consent  — accept one page at its CURRENT version.
 *
 * The version accepted is read from the database, never taken from the request
 * body: otherwise a client could POST version "1.0" and clear a v2.0 gate.
 * A body version, if sent, is treated as a staleness check and nothing more.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const pending = await pendingReacceptance(claims.sub);
  return ok({ pending, count: pending.length });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { slug?: string; version?: string };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  if (!body.slug) return fail("VALIDATION_ERROR");

  const res = await acceptLegal(claims.sub, body.slug, body.version ?? null, clientIp(req.headers));
  if (!res.ok) return res.reason === "NOT_FOUND" ? fail("NOT_FOUND") : fail("VALIDATION_ERROR");
  return ok({ accepted: true, remaining: res.remaining ?? 0 });
}
