import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { verifyOtp } from "@/lib/auth/otp";
import { deactivateAccount } from "@/lib/account/service";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { endAllSessions } from "@/lib/account/end-session";

/**
 * POST /api/v1/account/deactivate (Doc7 #202) — hide the profile, listings and
 * chats until the next login.
 *
 * Gated on a fresh OTP for the session's own number, and the verified number is
 * compared against that profile: a code obtained for a different number cannot
 * authorise this. Sessions are cleared afterwards, because a deactivated account
 * that stays logged in would keep browsing as if nothing happened.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { otpSession?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (!body.otpSession || !/^\d{6}$/.test(body.code ?? "")) return fail("VALIDATION_ERROR");

  const verified = await verifyOtp(body.otpSession, body.code!);
  if (!verified.ok) {
    if (verified.reason === "LOCKED") return fail("NUMBER_LOCKED");
    if (verified.reason === "EXHAUSTED") return fail("OTP_LOCKED", { attemptsLeft: 0 });
    return fail("OTP_INVALID", { attemptsLeft: verified.attemptsLeft });
  }

  const db = createServiceClient();
  const { data: profile } = await db.from("profiles").select("phone").eq("id", claims.sub).maybeSingle();
  if (!profile || profile.phone !== verified.phone) return fail("FORBIDDEN");

  const result = await deactivateAccount(claims.sub, await hashIp(clientIp(req.headers)));
  if (!result.ok) return fail("VALIDATION_ERROR");

  await endAllSessions(claims.sub);
  return ok({ deactivated: true });
}
