import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { COOKIE, rotateRefreshSession, signAccess, setSessionCookies, clearAuthCookies } from "@/lib/auth/session";
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
    await clearAuthCookies();
    return fail("UNAUTHORIZED");
  }

  const profile = await getProfileById(rotated.profileId);
  if (!profile || !profile.is_registered || profile.state === "deleted" || profile.state === "suspended") {
    await clearAuthCookies();
    return fail("UNAUTHORIZED");
  }

  const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
  await setSessionCookies(access, rotated.newCookie);
  return ok({ refreshed: true });
}
