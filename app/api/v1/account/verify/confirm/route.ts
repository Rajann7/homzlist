import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { verifyOtp } from "@/lib/auth/otp";
import { kv } from "@/lib/kv";
import { deactivateAccount, requestDeletion, accountIntentKey } from "@/lib/account/service";

/**
 * POST /api/v1/account/verify/confirm — the OTP screen's "Verify & deactivate"
 * / "Verify & delete" button.
 *
 * The action performed is the one stored when the code was SENT. The body
 * carries only the session and the code; there is no `action` field to pass,
 * which is what stops a deactivate code from being spent on a deletion.
 *
 * The intent is also bound to the profile that started it, so a code obtained
 * on one account cannot be confirmed while signed in as another.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { otpSession?: string; code?: string };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  if (!body.otpSession || !body.code) return fail("VALIDATION_ERROR");

  const raw = await kv.get(accountIntentKey(body.otpSession));
  if (!raw) return fail("OTP_INVALID");
  const intent = JSON.parse(raw) as { profileId: string; action: "deactivate" | "delete"; reason: string | null };
  if (intent.profileId !== claims.sub) return fail("FORBIDDEN");

  const res = await verifyOtp(body.otpSession, body.code);
  if (!res.ok) {
    if (res.reason === "LOCKED") return fail("OTP_LOCKED");
    return fail("OTP_INVALID", { attemptsLeft: res.attemptsLeft ?? 0 });
  }
  await kv.del(accountIntentKey(body.otpSession)); // one action per code

  const outcome =
    intent.action === "delete"
      ? await requestDeletion(claims.sub, intent.reason)
      : await deactivateAccount(claims.sub, intent.reason);

  if (!outcome.ok) {
    if (outcome.reason === "PAYMENT_HOLD") {
      return fail("FORBIDDEN", { reason: "PAYMENT_HOLD", availableFrom: outcome.availableFrom });
    }
    return fail("SERVER_ERROR");
  }

  return ok({
    action: intent.action,
    state: outcome.state,
    deletionScheduledAt: outcome.deletionScheduledAt ?? null,
  });
}
