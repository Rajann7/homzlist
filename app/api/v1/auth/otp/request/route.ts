import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { toE164 } from "@/lib/auth/phone";
import { requestOtp } from "@/lib/auth/otp";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/auth/otp/request (Doc7 §1.1). Rate-limited, honeypot, generic
 * responses (never reveals if the number is registered — Doc9 §1). DEV: no SMS;
 * code logged server-side + echoed as devCode (dev only).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { phone?: string; hp?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  if (body.hp && body.hp.trim() !== "") return ok({ otpSession: "hp", resendIn: 30, attemptsLeft: 3 });

  const phone = toE164(body.phone ?? "");
  if (!phone) return fail("VALIDATION_ERROR");

  const ipHash = await hashIp(clientIp(req.headers));
  const res = await requestOtp(phone, ipHash);

  if (!res.ok) {
    if (res.reason === "NUMBER_LOCKED") return fail("NUMBER_LOCKED");
    return fail("RATE_LIMITED", { retryAfterSec: res.retryAfterSec });
  }

  return ok({
    otpSession: res.otpSession,
    resendIn: res.resendIn,
    attemptsLeft: res.attemptsLeft,
    ...(res.devCode ? { devCode: res.devCode } : {}),
  });
}
