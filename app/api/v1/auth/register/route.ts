import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { COOKIE, verifyRegisterToken, signAccess, createRefreshSession, setSessionCookies } from "@/lib/auth/session";
import { completeRegistration, getProfileById } from "@/lib/auth/service";
import { clientIp, hashIp } from "@/lib/auth/rate-limit";
import { toUserDTO, TC_VERSION } from "@/lib/auth/dto";
import { publicEnv } from "@/lib/env";

/**
 * POST /api/v1/auth/register (Doc7 §1.4). Authorized ONLY by the register cookie
 * set at OTP-verify. Writable fields whitelisted (Doc9 §3). Consent required +
 * logged versioned. Honeypot on registration (Doc2 §3.1).
 */
export const dynamic = "force-dynamic";
const ROLES = ["owner", "broker", "builder"] as const;

export async function POST(req: NextRequest) {
  const profileId = await verifyRegisterToken(cookies().get(COOKIE.REGISTER)?.value ?? "");
  if (!profileId) return fail("UNAUTHORIZED");

  let body: { role?: string; name?: string; cityId?: string; photoUrl?: string | null; consent18?: boolean; consentDpdp?: boolean; hp?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  if (body.hp && body.hp.trim() !== "") return fail("VALIDATION_ERROR");

  const role = ROLES.find((r) => r === body.role);
  const name = (body.name ?? "").trim();
  const cityId = (body.cityId ?? "").trim();
  if (!role) return fail("VALIDATION_ERROR", { field: "role" });
  if (name.length < 2 || name.length > 60) return fail("VALIDATION_ERROR", { field: "name" });
  if (!cityId) return fail("VALIDATION_ERROR", { field: "city" });
  if (body.consent18 !== true || body.consentDpdp !== true) return fail("VALIDATION_ERROR", { field: "consent" });

  const existing = await getProfileById(profileId);
  if (!existing) return fail("UNAUTHORIZED");
  if (existing.is_registered) return fail("FORBIDDEN");

  let profile;
  try {
    profile = await completeRegistration(profileId, {
      role,
      name,
      cityId,
      photoUrl: body.photoUrl ?? null,
      tcVersion: TC_VERSION,
      ipHash: await hashIp(clientIp(req.headers)),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_CITY") return fail("VALIDATION_ERROR", { field: "city" });
    throw e;
  }

  const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
  const refresh = await createRefreshSession(profile.id, {
    ua: req.headers.get("user-agent") ?? "",
    ipHash: await hashIp(clientIp(req.headers)),
  });
  await setSessionCookies(access, refresh);

  return ok({ user: toUserDTO(profile), redirect: publicEnv.sellerUrl });
}
