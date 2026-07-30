import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { verifyOtp } from "@/lib/auth/otp";
import { scheduleDeletion } from "@/lib/account/service";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { endAllSessions } from "@/lib/account/end-session";

/**
 * POST /api/v1/account/delete (Doc7 #203) — schedule deletion with a 30-day grace
 * period.
 *
 * Three gates, all server-side, because the client-side versions are only
 * courtesies:
 *   • type-to-confirm — the literal string DELETE must arrive in the body;
 *   • OTP re-verify — a fresh code for this account's own number;
 *   • payment hold — refused inside 7 days of a successful payment (enforced in
 *     scheduleDeletion, not by the greyed-out button).
 *
 * Nothing is destroyed here. The purge runs from the daily cron once the grace
 * period lapses, which is what makes "log in before then to cancel" true.
 */
export const dynamic = "force-dynamic";

const REASONS = new Set(["found_property", "too_many_messages", "not_useful", "privacy", "other"]);

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { otpSession?: string; code?: string; confirm?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (body.confirm !== "DELETE") return fail("VALIDATION_ERROR");
  if (!body.otpSession || !/^\d{6}$/.test(body.code ?? "")) return fail("VALIDATION_ERROR");
  const reason = body.reason && REASONS.has(body.reason) ? body.reason : null;

  const verified = await verifyOtp(body.otpSession, body.code!);
  if (!verified.ok) {
    if (verified.reason === "LOCKED") return fail("NUMBER_LOCKED");
    if (verified.reason === "EXHAUSTED") return fail("OTP_LOCKED", { attemptsLeft: 0 });
    return fail("OTP_INVALID", { attemptsLeft: verified.attemptsLeft });
  }

  const db = createServiceClient();
  const { data: profile } = await db.from("profiles").select("phone").eq("id", claims.sub).maybeSingle();
  if (!profile || profile.phone !== verified.phone) return fail("FORBIDDEN");

  const result = await scheduleDeletion(claims.sub, reason, await hashIp(clientIp(req.headers)));
  if (!result.ok) {
    return fail(result.reason === "PAYMENT_HOLD" ? "FORBIDDEN" : "VALIDATION_ERROR", { reason: result.reason });
  }

  await endAllSessions(claims.sub);
  return ok({ scheduled: true, purgeAt: result.purgeAt });
}
