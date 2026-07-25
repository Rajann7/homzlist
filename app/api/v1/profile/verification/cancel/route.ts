import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { cancelVerification } from "@/lib/profile/service";

/**
 * POST /api/v1/profile/verification/cancel — withdraw a PENDING ID/RERA
 * verification request (P9 "Cancel request"). The button used to only toast;
 * now the pending row is actually removed so the user can re-submit. Only the
 * caller's own pending row is affected; approved/rejected levels are untouched.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const limited = await rateLimit(`verify-cancel:${claims.sub}`, 20, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED", { retryAfterSec: limited.retryAfterSec });

  let body: { level?: string };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  if (body.level !== "id" && body.level !== "rera") return fail("VALIDATION_ERROR", { field: "level" });

  const done = await cancelVerification(claims.sub, body.level);
  return done ? ok({ cancelled: true }) : fail("NOT_FOUND");
}
