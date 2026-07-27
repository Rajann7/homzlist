import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { COOKIE, rotateRefreshSession, signAccess, setSessionCookies, clearAuthCookies } from "@/lib/auth/session";
import { revokeAndClearPool } from "@/lib/auth/account-pool";
import { getProfileById } from "@/lib/auth/service";

/**
 * POST /api/v1/auth/refresh (Doc7 §1.9). Rotate refresh + mint fresh access.
 * Invalidates the session if the account was suspended/role-changed/deleted (Doc9 §1).
 */
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const rt = cookies().get(COOKIE.REFRESH)?.value;
  if (!rt) return fail("UNAUTHORIZED");

  const rotated = await rotateRefreshSession(rt);
  if (!rotated) {
    // The active session is gone (theft/replay/expiry). Fail closed for the whole
    // device: background accounts are revoked too, never left live behind a
    // cookie nothing can reach.
    await revokeAndClearPool();
    await clearAuthCookies();
    return fail("UNAUTHORIZED");
  }

  const profile = await getProfileById(rotated.profileId);
  if (!profile || !profile.is_registered || profile.state === "deleted" || profile.state === "suspended") {
    await revokeAndClearPool();
    await clearAuthCookies();
    return fail("UNAUTHORIZED");
  }

  const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
  await setSessionCookies(access, rotated.newCookie);
  return ok({ refreshed: true });
}
