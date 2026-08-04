import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { COOKIE_NUMBER_CHANGE, verifyNumberChangeToken } from "@/lib/auth/session";
import { verifyOtp } from "@/lib/auth/otp";
import { getProfileByPhone } from "@/lib/auth/service";
import { createServiceClient } from "@/lib/supabase/server";
import { maskPhone } from "@/lib/auth/phone";

/** POST /auth/number-change/verify-new (Doc7 §1.13) — verify NEW number → update phone. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const ncSub = await verifyNumberChangeToken((await cookies()).get(COOKIE_NUMBER_CHANGE)?.value ?? "");
  if (ncSub !== claims.sub) return fail("FORBIDDEN");

  let body: { otpSession?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (!body.otpSession || !/^\d{6}$/.test(body.code ?? "")) return fail("VALIDATION_ERROR");

  const result = await verifyOtp(body.otpSession, body.code!);
  if (!result.ok || !result.phone) {
    if (result.reason === "LOCKED") return fail("NUMBER_LOCKED");
    return fail("OTP_INVALID", { attemptsLeft: result.attemptsLeft });
  }

  const newPhone = result.phone; // bound to the new-number OTP session
  const taken = await getProfileByPhone(newPhone);
  if (taken && taken.is_registered && taken.id !== claims.sub) return fail("VALIDATION_ERROR", { field: "phone", reason: "taken" });

  const db = createServiceClient();
  await db.from("profiles").update({ phone: newPhone }).eq("id", claims.sub);

  (await cookies()).delete(COOKIE_NUMBER_CHANGE);
  return ok({ updated: true, phoneMasked: maskPhone(newPhone) });
}
