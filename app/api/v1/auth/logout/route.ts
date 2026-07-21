import { cookies } from "next/headers";
import { ok } from "@/lib/api";
import { COOKIE, revokeSession, clearAuthCookies } from "@/lib/auth/session";

/** POST /api/v1/auth/logout (Doc7 §1.5) — revoke this device's refresh session + clear cookies. */
export const dynamic = "force-dynamic";

export async function POST() {
  const rt = cookies().get(COOKIE.REFRESH)?.value;
  if (rt) {
    const [profileId, sid] = rt.split(".");
    if (profileId && sid) await revokeSession(profileId, sid);
  }
  await clearAuthCookies();
  return ok({ loggedOut: true });
}
