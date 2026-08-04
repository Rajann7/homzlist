import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { COOKIE, rotateRefreshSession, revokeSession, signAccess, setSessionCookies } from "@/lib/auth/session";
import { takeFromPool, writePool } from "@/lib/auth/account-pool";
import { getProfileById, touchLastActive } from "@/lib/auth/service";

/**
 * POST /api/v1/auth/switch { profileId } — become another account already signed
 * in on this device (P9 S1).
 *
 * Authorization is the POOL COOKIE, not the body: an id that is not already in
 * this device's httpOnly pool is a 404, so the field cannot be used to reach
 * someone else's account. The target's real refresh session is rotated (so a
 * revoked one fails closed) and re-checked against `profiles` — suspended,
 * deleted or unregistered accounts are dropped rather than entered. The account
 * being left is parked in the pool with its still-valid token so the switch is
 * reversible without another OTP.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { profileId?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  // Type-check before trimming: a non-string body field must be a 422, not a 500.
  if (typeof body.profileId !== "string") return fail("VALIDATION_ERROR");
  const profileId = body.profileId.trim();
  if (!profileId) return fail("VALIDATION_ERROR");
  if (profileId === claims.sub) return ok({ switched: false, profileId }); // already active

  const { entry, rest } = takeFromPool(profileId);
  if (!entry) return fail("NOT_FOUND");

  const rotated = await rotateRefreshSession(entry.token);
  if (!rotated) {
    writePool(rest); // dead session — it leaves the sheet instead of dead-ending
    return fail("UNAUTHORIZED");
  }

  const profile = await getProfileById(rotated.profileId);
  if (!profile || !profile.is_registered || profile.state === "deleted" || profile.state === "suspended") {
    const [pid, sid] = entry.token.split(".");
    if (pid && sid) await revokeSession(pid, sid);
    writePool(rest);
    return fail("FORBIDDEN");
  }

  // Park the outgoing account BEFORE its cookie is overwritten.
  const outgoing = (await cookies()).get(COOKIE.REFRESH)?.value;

  const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
  await setSessionCookies(access, rotated.newCookie);
  writePool(outgoing ? [{ profileId: claims.sub, token: outgoing }, ...rest] : rest);
  await touchLastActive(profile.id);

  return ok({ switched: true, profileId: profile.id });
}
