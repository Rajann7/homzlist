import { cookies } from "next/headers";
import { ok } from "@/lib/api";
import { COOKIE, revokeSession, clearAuthCookies, rotateRefreshSession, signAccess, setSessionCookies } from "@/lib/auth/session";
import { readPool, writePool } from "@/lib/auth/account-pool";
import { getProfileById, touchLastActive } from "@/lib/auth/service";

/**
 * POST /api/v1/auth/logout (Doc7 §1.5) — revoke this device's refresh session +
 * clear cookies.
 *
 * With more than one account signed in on the device (P9 S1), logging out of the
 * current one hands the device to the next account in the pool instead of
 * dumping the user at /login — the same behaviour as switching, and it never
 * leaves a still-valid session stranded behind a cleared cookie. Only when the
 * LAST account logs out do the cookies (and the pool) go away entirely.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const rt = (await cookies()).get(COOKIE.REFRESH)?.value;
  if (rt) {
    const [profileId, sid] = rt.split(".");
    if (profileId && sid) await revokeSession(profileId, sid);
  }

  // Promote the most-recently-used background account, skipping any that died
  // (revoked elsewhere, suspended, deleted) — those are dropped, not entered.
  let pool = readPool();
  while (pool.length) {
    const [next, ...rest] = pool;
    const rotated = await rotateRefreshSession(next.token);
    const profile = rotated ? await getProfileById(rotated.profileId) : null;
    if (rotated && profile && profile.is_registered && profile.state !== "deleted" && profile.state !== "suspended") {
      const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
      await setSessionCookies(access, rotated.newCookie);
      writePool(rest);
      await touchLastActive(profile.id);
      return ok({ loggedOut: true, switchedTo: profile.id });
    }
    pool = rest;
  }

  await clearAuthCookies();
  writePool([]);
  return ok({ loggedOut: true, switchedTo: null });
}
