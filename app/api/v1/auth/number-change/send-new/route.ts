import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { COOKIE_NUMBER_CHANGE, verifyNumberChangeToken } from "@/lib/auth/session";
import { toE164 } from "@/lib/auth/phone";
import { getProfileByPhone } from "@/lib/auth/service";
import { requestOtp } from "@/lib/auth/otp";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";

/** POST /auth/number-change/send-new (Doc7 §1.13) — send OTP to the NEW number. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const ncSub = await verifyNumberChangeToken((await cookies()).get(COOKIE_NUMBER_CHANGE)?.value ?? "");
  if (ncSub !== claims.sub) return fail("FORBIDDEN"); // old number not verified

  let body: { newPhone?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  const newPhone = toE164(body.newPhone ?? "");
  if (!newPhone) return fail("VALIDATION_ERROR", { field: "phone" });

  // New number must not already belong to a registered account.
  const existing = await getProfileByPhone(newPhone);
  if (existing && existing.is_registered && existing.id !== claims.sub) {
    return fail("VALIDATION_ERROR", { field: "phone", reason: "taken" });
  }

  const res = await requestOtp(newPhone, await hashIp(clientIp(req.headers)));
  if (!res.ok) {
    if (res.reason === "NUMBER_LOCKED") return fail("NUMBER_LOCKED");
    return fail("RATE_LIMITED", { retryAfterSec: res.retryAfterSec });
  }
  return ok({ otpSession: res.otpSession, resendIn: res.resendIn, ...(res.devCode ? { devCode: res.devCode } : {}) });
}
