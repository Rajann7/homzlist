import "server-only";
import { cookies } from "next/headers";
import { COOKIE, revokeAllSessions, clearAuthCookies } from "@/lib/auth/session";
import { writePool } from "@/lib/auth/account-pool";

/**
 * Take the account off this device — and off every other one — after a
 * deactivation or a scheduled deletion.
 *
 * Clearing the cookie alone would leave a valid refresh session on the server
 * that any other device could still rotate, so a "deactivated" account would keep
 * working elsewhere. Every session is revoked server-side, and the multi-account
 * pool is emptied so the device doesn't silently promote a background account
 * into a flow that is meant to end at the confirmation screen.
 */
export async function endAllSessions(profileId: string): Promise<void> {
  await revokeAllSessions(profileId);
  cookies().delete(COOKIE.ACCESS);
  cookies().delete(COOKIE.REFRESH);
  writePool([]);
  await clearAuthCookies();
}
