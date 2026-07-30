import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { verifyOtp } from "@/lib/auth/otp";
import { resolveProfileForLogin, touchLastActive } from "@/lib/auth/service";
import { createServiceClient } from "@/lib/supabase/server";
import { COOKIE, signAccess, signRegisterToken, createRefreshSession, setSessionCookies, setRegisterCookie } from "@/lib/auth/session";
import { absorbOutgoingSession } from "@/lib/auth/account-pool";
import { cookies } from "next/headers";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
import { findActiveBan } from "@/lib/admin/deviceBans";
import { toUserDTO } from "@/lib/auth/dto";

/**
 * POST /api/v1/auth/otp/verify (Doc7 §1.2). New user → register cookie + next:"role";
 * existing → full session. Failure returns generic errors; 10 daily fails → 24h lock.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { otpSession?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (!body.otpSession || !/^\d{6}$/.test(body.code ?? "")) return fail("VALIDATION_ERROR");

  /**
   * A banned device or address does not get in (Doc3 §1.6 — A9's Ban device/IP).
   *
   * Checked BEFORE the code is verified, so a ban cannot be probed by watching
   * which codes are accepted, and a banned client burns no OTP attempts. The
   * response is deliberately generic — telling someone their device is banned
   * tells them which device to change.
   */
  const ban = await findActiveBan(req.headers);
  if (ban) return fail("NUMBER_LOCKED");

  const result = await verifyOtp(body.otpSession, body.code!);

  if (!result.ok) {
    if (result.reason === "LOCKED") return fail("NUMBER_LOCKED");
    if (result.reason === "EXHAUSTED") return fail("OTP_LOCKED", { attemptsLeft: 0 });
    if (result.reason === "NOT_FOUND") return fail("OTP_INVALID");
    return fail("OTP_INVALID", { attemptsLeft: result.attemptsLeft });
  }

  const phone = result.phone!;
  const { profile } = await resolveProfileForLogin(phone);

  // P12 S6. A deactivation is undone simply by logging in ("everything comes back").
  // A scheduled DELETION is not: the user must see the grace screen and choose
  // "Cancel deletion" explicitly, otherwise the purge date would be silently
  // dropped and the account left in an inconsistent half-deleted state.
  const pendingDeletion = await getScheduledDeletion(profile.id);
  if (profile.state === "deactivated" && !pendingDeletion) {
    const db = createServiceClient();
    await db.from("profiles").update({ state: "active" }).eq("id", profile.id);
    await cancelDeactivationRecord(profile.id);
    profile.state = "active";
  }

  if (!profile.is_registered) {
    await setRegisterCookie(await signRegisterToken(profile.id));
    return ok({ isNew: true, next: "role" });
  }

  // "Add account" (P9 S1): whoever was signed in on this device keeps their real
  // server-side session, parked in the httpOnly pool, so both accounts show in
  // the switch sheet. Captured before the cookies are overwritten.
  const outgoing = cookies().get(COOKIE.REFRESH)?.value;

  const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
  const refresh = await createRefreshSession(profile.id, {
    ua: req.headers.get("user-agent") ?? "",
    ipHash: await hashIp(clientIp(req.headers)),
  });
  await setSessionCookies(access, refresh);
  await absorbOutgoingSession(profile.id, outgoing);
  await touchLastActive(profile.id);

  const next = profile.state === "suspended" ? "suspended" : pendingDeletion ? "grace" : "seller";
  return ok({
    isNew: false,
    user: toUserDTO(profile),
    next,
    ...(pendingDeletion ? { deletionPurgeAt: pendingDeletion } : {}),
  });
}

/** The purge date of an open deletion, or null. */
async function getScheduledDeletion(profileId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("account_actions")
    .select("purge_at")
    .eq("profile_id", profileId)
    .eq("kind", "delete")
    .eq("status", "scheduled")
    .maybeSingle();
  return (data?.purge_at as string) ?? null;
}

/** Close out the deactivation row that logging back in has just undone. */
async function cancelDeactivationRecord(profileId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("account_actions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .eq("kind", "deactivate")
    .eq("status", "scheduled");
}
