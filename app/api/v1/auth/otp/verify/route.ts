import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { verifyOtp } from "@/lib/auth/otp";
import { resolveProfileForLogin, touchLastActive } from "@/lib/auth/service";
import { createServiceClient } from "@/lib/supabase/server";
import { signAccess, signRegisterToken, createRefreshSession, setSessionCookies, setRegisterCookie } from "@/lib/auth/session";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
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

  const result = await verifyOtp(body.otpSession, body.code!);

  if (!result.ok) {
    if (result.reason === "LOCKED") return fail("NUMBER_LOCKED");
    if (result.reason === "EXHAUSTED") return fail("OTP_LOCKED", { attemptsLeft: 0 });
    if (result.reason === "NOT_FOUND") return fail("OTP_INVALID");
    return fail("OTP_INVALID", { attemptsLeft: result.attemptsLeft });
  }

  const phone = result.phone!;
  const { profile } = await resolveProfileForLogin(phone);

  if (profile.state === "deactivated") {
    const db = createServiceClient();
    await db.from("profiles").update({ state: "active" }).eq("id", profile.id);
    profile.state = "active";
  }

  if (!profile.is_registered) {
    await setRegisterCookie(await signRegisterToken(profile.id));
    return ok({ isNew: true, next: "role" });
  }

  const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
  const refresh = await createRefreshSession(profile.id, {
    ua: req.headers.get("user-agent") ?? "",
    ipHash: await hashIp(clientIp(req.headers)),
  });
  await setSessionCookies(access, refresh);
  await touchLastActive(profile.id);

  const next = profile.state === "suspended" ? "suspended" : "seller";
  return ok({ isNew: false, user: toUserDTO(profile), next });
}
