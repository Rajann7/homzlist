import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/auth/service";
import { requestOtp } from "@/lib/auth/otp";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
import { maskPhone } from "@/lib/auth/phone";

/** POST /auth/number-change/start (Doc7 §1.11) — send OTP to the CURRENT number. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");

  const res = await requestOtp(profile.phone, await hashIp(clientIp(req.headers)));
  if (!res.ok) {
    if (res.reason === "NUMBER_LOCKED") return fail("NUMBER_LOCKED");
    return fail("RATE_LIMITED", { retryAfterSec: res.retryAfterSec });
  }
  return ok({ otpSession: res.otpSession, resendIn: res.resendIn, maskedCurrent: maskPhone(profile.phone), ...(res.devCode ? { devCode: res.devCode } : {}) });
}
