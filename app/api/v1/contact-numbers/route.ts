import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { hashIp } from "@/lib/auth/rate-limit";
import {
  startNumberVerification, confirmNumberVerification, resendNumberOtp, liveVerifiedNumbers, REUSE_DAYS,
} from "@/lib/inquiry/numbers";

/**
 * "Use a different number" on the inquiry sheet.
 *
 *   GET   — the numbers already verified and still inside the 7-day window,
 *           so the popup can skip the OTP entirely.
 *   POST  — start: send an OTP to a new number.
 *   PUT   — confirm: check the code and record the verification.
 *
 * Verifying a number here NEVER creates an account and never touches the
 * session. The only side effect is a row in `verified_contact_numbers`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  return ok({
    myNumber: profile.phone ?? null,
    verified: await liveVerifiedNumbers(claims.sub),
    reuseDays: REUSE_DAYS,
  });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const number = typeof body.number === "string" ? body.number : "";
  if (!number && body.resend !== true) return fail("VALIDATION_ERROR", { field: "number" });

  const ipHash = await hashIp(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "");

  // Resend uses the same endpoint so the popup does not need a second route.
  if (typeof body.otpSession === "string" && body.resend === true) {
    const again = await resendNumberOtp(body.otpSession, ipHash);
    if (!again.ok) return fail(again.reason === "NUMBER_LOCKED" ? "NUMBER_LOCKED" : "RATE_LIMITED");
    return ok({ resent: true, ...(again.devCode ? { devCode: again.devCode } : {}), resendIn: again.resendIn ?? null });
  }

  const res = await startNumberVerification(claims.sub, number, ipHash);
  if (!res.ok) {
    if (res.reason === "invalid") return fail("VALIDATION_ERROR", { field: "number" });
    if (res.reason === "locked") return fail("NUMBER_LOCKED");
    return fail("RATE_LIMITED");
  }
  if (res.alreadyVerified) return ok({ alreadyVerified: true, number: res.number });
  // devCode is echoed only in the dev band, exactly as the sign-in flow does —
  // there is no SMS provider wired yet, so without it the popup would ask for a
  // code that can never arrive.
  return ok({
    alreadyVerified: false,
    number: res.number,
    otpSession: res.otpSession,
    ...(res.devCode ? { devCode: res.devCode } : {}),
    resendIn: res.resendIn ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const otpSession = typeof body.otpSession === "string" ? body.otpSession : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!otpSession || !code) return fail("VALIDATION_ERROR");

  const res = await confirmNumberVerification(claims.sub, otpSession, code);
  if (!res.ok) {
    if (res.reason === "locked") return fail("OTP_LOCKED");
    if (res.reason === "expired") return fail("NOT_FOUND");
    return fail("OTP_INVALID");
  }
  return ok({ verified: true, number: res.number, expiresAt: res.expiresAt });
}
