import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { verifyOtp } from "@/lib/auth/otp";
import { getProfileById } from "@/lib/auth/service";
import { COOKIE_NUMBER_CHANGE, signNumberChangeToken } from "@/lib/auth/session";

/** POST /auth/number-change/verify-old (Doc7 §1.12) — verify OLD number → change token. */
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

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");

  const result = await verifyOtp(body.otpSession, body.code!);
  // Bind to THIS user's current number (can't verify someone else's session).
  if (!result.ok || result.phone !== profile.phone) {
    if (result.reason === "LOCKED") return fail("NUMBER_LOCKED");
    return fail("OTP_INVALID", { attemptsLeft: result.attemptsLeft });
  }

  cookies().set(COOKIE_NUMBER_CHANGE, await signNumberChangeToken(claims.sub), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
  return ok({ verified: true });
}
