import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requestOtp } from "@/lib/auth/otp";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { accountIntentKey, ACCOUNT_INTENT_TTL_SEC, getAccountLifecycle } from "@/lib/account/service";
import { kv } from "@/lib/kv";

/**
 * POST /api/v1/account/verify/start — send the re-verification code for a
 * deactivate or delete (P12 S6, Doc7 §202/203).
 *
 * The INTENT is stored server-side against the OTP session, not carried in the
 * confirm request. Otherwise the flow is: start a "deactivate" OTP, receive a
 * code, then confirm with action:"delete" — a destructive action reached with a
 * code the user was told was for something reversible.
 *
 * The 7-day payment hold is checked HERE as well as at the point of deletion,
 * so a held account never even receives a code for an action it cannot take.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { action?: string; reason?: string };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const action = body.action === "delete" ? "delete" : body.action === "deactivate" ? "deactivate" : null;
  if (!action) return fail("VALIDATION_ERROR");

  if (action === "delete") {
    const life = await getAccountLifecycle(claims.sub);
    if (life.paymentHold.active) {
      return fail("FORBIDDEN", { reason: "PAYMENT_HOLD", availableFrom: life.paymentHold.availableFrom });
    }
  }

  const { data } = await createServiceClient()
    .from("profiles").select("phone").eq("id", claims.sub).maybeSingle();
  const phone = (data as { phone: string } | null)?.phone;
  if (!phone) return fail("NOT_FOUND");

  const res = await requestOtp(phone, await hashIp(clientIp(req.headers)));
  if (!res.ok) {
    if (res.reason === "NUMBER_LOCKED") return fail("NUMBER_LOCKED");
    return fail("RATE_LIMITED", { retryAfterSec: res.retryAfterSec });
  }

  await kv.set(
    accountIntentKey(res.otpSession!),
    JSON.stringify({ profileId: claims.sub, action, reason: body.reason ?? null }),
    ACCOUNT_INTENT_TTL_SEC,
  );

  return ok({
    otpSession: res.otpSession,
    resendIn: res.resendIn,
    attemptsLeft: res.attemptsLeft,
    // The number the design masks as "+91 98••• ••482" — masked HERE, so the
    // full number never travels to a screen that only wants to hint at it.
    maskedPhone: `${phone.slice(0, 6)}••• ••${phone.slice(-3)}`,
    action,
    ...(res.devCode ? { devCode: res.devCode } : {}),
  });
}
