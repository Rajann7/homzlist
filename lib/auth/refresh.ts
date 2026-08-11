import "server-only";
import { cookies } from "next/headers";
import { COOKIE, rotateRefreshSession, signAccess, setSessionCookies, clearAuthCookies } from "@/lib/auth/session";
import { revokeAndClearPool } from "@/lib/auth/account-pool";
import { getProfileById } from "@/lib/auth/service";

/**
 * Rotate the refresh token and mint a fresh access token — the ONE place that
 * revives a valid-but-idle session.
 *
 * Two callers share it and must not drift apart:
 *   · POST /api/v1/auth/refresh — the client-side silent refresh (AuthFlow).
 *   · GET  /api/v1/auth/refresh?next= — the NAVIGATION bridge the middleware
 *     sends a stale-access page request to, so a 15-minute access token can
 *     never look like "signed out" to the router (see middleware.ts).
 *
 * Failure is total and deliberate: the session is gone (expired, revoked,
 * replayed) or the account is no longer allowed one, so background accounts are
 * revoked too and every auth cookie — including the cross-subdomain hint — is
 * cleared. That is also what breaks any redirect loop: after one failed hop
 * there is no refresh cookie left to send anyone back here.
 */
export async function refreshUserSession(): Promise<boolean> {
  const rt = (await cookies()).get(COOKIE.REFRESH)?.value;
  if (!rt) return false;

  const rotated = await rotateRefreshSession(rt);
  if (!rotated) {
    await revokeAndClearPool();
    await clearAuthCookies();
    return false;
  }

  const profile = await getProfileById(rotated.profileId);
  if (!profile || !profile.is_registered || profile.state === "deleted" || profile.state === "suspended") {
    await revokeAndClearPool();
    await clearAuthCookies();
    return false;
  }

  const access = await signAccess({ sub: profile.id, role: profile.role, registered: true });
  await setSessionCookies(access, rotated.newCookie);
  return true;
}
