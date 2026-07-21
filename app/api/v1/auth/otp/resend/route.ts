import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { resendOtp } from "@/lib/auth/otp";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";

/** POST /api/v1/auth/otp/resend (Doc7 §1.3) — max 3/session, 30s gap, SMS caps. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { otpSession?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (!body.otpSession) return fail("VALIDATION_ERROR");

  const ipHash = await hashIp(clientIp(req.headers));
  const res = await resendOtp(body.otpSession, ipHash);
  if (!res.ok) {
    if (res.reason === "NUMBER_LOCKED") return fail("NUMBER_LOCKED");
    if (res.reason === "RESEND_LIMIT") return fail("RATE_LIMITED", { reason: "resend_limit" });
    if (res.reason === "RATE_LIMITED") return fail("RATE_LIMITED", { retryAfterSec: res.retryAfterSec });
    if (res.reason === "TOO_SOON") return fail("RATE_LIMITED", { waitSec: res.waitSec });
    return fail("OTP_INVALID");
  }

  return ok({ resendIn: res.resendIn, ...(res.devCode ? { devCode: res.devCode } : {}) });
}
