import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requestOtp } from "@/lib/auth/otp";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { maskPhone } from "@/lib/auth/phone";

/**
 * POST /api/v1/account/step-up — send the OTP that P12's S6 re-verify screen asks
 * for before a deactivation or deletion.
 *
 * The number is read from the session's own profile, never accepted from the
 * request: a step-up that let the caller nominate the destination number would be
 * an account-takeover primitive, not a safeguard. Reuses the ordinary OTP
 * lifecycle, so all of its limits (3/hour per number, 10/day per IP, 3 verify
 * attempts, 24h lock after 10 daily fails) apply unchanged.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { intent?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const intent = body.intent === "delete" ? "delete" : "deactivate";

  const db = createServiceClient();
  const { data: profile } = await db.from("profiles").select("phone").eq("id", claims.sub).maybeSingle();
  if (!profile?.phone) return fail("NOT_FOUND");

  const outcome = await requestOtp(profile.phone as string, await hashIp(clientIp(req.headers)));
  if (!outcome.ok) {
    return fail(outcome.reason === "NUMBER_LOCKED" ? "NUMBER_LOCKED" : "RATE_LIMITED", {
      retryAfterSec: outcome.retryAfterSec,
    });
  }

  return ok({
    intent,
    otpSession: outcome.otpSession,
    resendIn: outcome.resendIn,
    phoneMasked: maskPhone(profile.phone as string),
    devCode: outcome.devCode,
  });
}
