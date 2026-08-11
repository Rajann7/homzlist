import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { requestOtp, resendOtp, verifyOtp } from "@/lib/auth/otp";
import { toE164, isValidIndianMobile } from "@/lib/auth/phone";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * "Use a different number" on the inquiry sheet.
 *
 * The sender may want to be reached on a number that is not the one their
 * account is registered with. That number is OTP-verified in a popup before it
 * can be shared — verifying here NEVER creates an account and never touches the
 * session; it only proves the person holds the handset.
 *
 * A verification is reusable for 7 days on any other listing, so someone
 * browsing all evening is not made to re-verify the same number each time.
 */

const db = () => createServiceClient();

export const REUSE_DAYS = 7;

export type StartResult =
  | { ok: true; otpSession: string; alreadyVerified: false; number: string; devCode?: string; resendIn?: number }
  | { ok: true; alreadyVerified: true; number: string }
  | { ok: false; reason: "invalid" | "rate_limited" | "locked" };

/**
 * Start verification. If this profile already has a live verification for the
 * same number, no OTP is sent at all — that is the 7-day reuse.
 */
export async function startNumberVerification(profileId: string, raw: string, ipHash: string): Promise<StartResult> {
  if (!isValidIndianMobile(raw)) return { ok: false, reason: "invalid" };
  const e164 = toE164(raw);
  if (!e164) return { ok: false, reason: "invalid" };

  if (await isNumberVerified(profileId, e164)) return { ok: true, alreadyVerified: true, number: e164 };

  // Two separate walls: how many numbers this person may try in a day, and the
  // OTP module's own per-number limits. Without the first, the sheet is a free
  // "is this number reachable" prober.
  const limited = await rateLimit(`numverify:${profileId}`, 10, 86_400, "contact_number_verify");
  if (!limited.allowed) return { ok: false, reason: "rate_limited" };

  const out = await requestOtp(e164, ipHash);
  if (!out.ok || !out.otpSession) return { ok: false, reason: out.reason === "NUMBER_LOCKED" ? "locked" : "rate_limited" };
  // `devCode` is echoed in the dev band exactly as the sign-in flow does it —
  // there is no SMS provider wired yet, so without it the popup asks for a code
  // that can never arrive and the whole custom-number option is dead.
  return {
    ok: true,
    otpSession: out.otpSession,
    alreadyVerified: false,
    number: e164,
    ...(out.devCode ? { devCode: out.devCode } : {}),
    ...(out.resendIn ? { resendIn: out.resendIn } : {}),
  };
}

export type ConfirmResult =
  | { ok: true; number: string; expiresAt: string }
  | { ok: false; reason: "invalid_code" | "expired" | "locked" };

/**
 * Confirm the code and record the verification. Deliberately does not create,
 * log into or modify any account — the only side effect is a row in
 * `verified_contact_numbers`.
 */
export async function confirmNumberVerification(profileId: string, otpSession: string, code: string): Promise<ConfirmResult> {
  const out = await verifyOtp(otpSession, code);
  if (!out.ok || !out.phone) {
    return {
      ok: false,
      reason: out.reason === "LOCKED" || out.reason === "EXHAUSTED" ? "locked"
            : out.reason === "NOT_FOUND" ? "expired"
            : "invalid_code",
    };
  }
  const number = out.phone;
  const expiresAt = new Date(Date.now() + REUSE_DAYS * 86_400_000).toISOString();
  await db().from("verified_contact_numbers").upsert(
    { profile_id: profileId, number, verified_at: new Date().toISOString(), expires_at: expiresAt },
    { onConflict: "profile_id,number" },
  );
  return { ok: true, number, expiresAt };
}

export type ResendResult = { ok: true; devCode?: string; resendIn?: number } | { ok: false; reason: string };

/** Resend the code for a verification already in flight. */
export async function resendNumberOtp(otpSession: string, ipHash: string): Promise<ResendResult> {
  const out = await resendOtp(otpSession, ipHash);
  if (!out.ok) return { ok: false, reason: out.reason ?? "RATE_LIMITED" };
  return { ok: true, ...(out.devCode ? { devCode: out.devCode } : {}), ...(out.resendIn ? { resendIn: out.resendIn } : {}) };
}

/** Is there a live (unexpired) verification of this number for this profile? */
export async function isNumberVerified(profileId: string, number: string): Promise<boolean> {
  const e164 = toE164(number) ?? number;
  const { data } = await db()
    .from("verified_contact_numbers")
    .select("id")
    .eq("profile_id", profileId)
    .eq("number", e164)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return Boolean(data);
}

/** The numbers the sheet can offer without sending another OTP. */
export async function liveVerifiedNumbers(profileId: string): Promise<{ number: string; expiresAt: string }[]> {
  const { data } = await db()
    .from("verified_contact_numbers")
    .select("number,expires_at")
    .eq("profile_id", profileId)
    .gt("expires_at", new Date().toISOString())
    .order("verified_at", { ascending: false });
  return ((data ?? []) as { number: string; expires_at: string }[]).map((r) => ({ number: r.number, expiresAt: r.expires_at }));
}
