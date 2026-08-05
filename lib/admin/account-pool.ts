import "server-only";
import { cookies } from "next/headers";
import { peekAdminRefresh, revokeAdminRefresh } from "./session";

/**
 * "Switch account" (template 1597-1601) — the admin half of the multi-account
 * pool the user side already has in lib/auth/account-pool.
 *
 * The design's sheet says "Signed-in Google accounts on this device", and that
 * is exactly what this is: the ACTIVE admin keeps hz_admin_at/hz_admin_rt, and
 * every other admin who signed in on this device keeps their real, server-
 * tracked refresh token in `hz_admin_accts`. Switching is the server rotating
 * that account's genuine session and swapping the active cookies.
 *
 * Which means the sheet cannot be lied to: the browser never holds a name, a
 * role or an id it could edit, and an account can only be switched into if a
 * live refresh session for it already exists in KV. Signing out, or being
 * revoked on the staff screen, removes it from the sheet on the next read.
 *
 * Same 4-background cap as the user pool, and the same host-only httpOnly
 * cookie discipline — on account.* only, so a parked admin session is not even
 * transmitted to the public or seller hosts.
 */

export const ADMIN_POOL_COOKIE = "hz_admin_accts";
const MAX_BACKGROUND = 4;
/** Matches REFRESH_TTL_SEC in session.ts — a parked token cannot outlive its KV entry. */
const POOL_MAX_AGE_SEC = 12 * 60 * 60;

export type AdminPoolEntry = { staffId: string; token: string };

function opts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** `<staffId>.<opaque refresh>` — the uuid has no dots, the token has none either. */
function parse(raw: string | undefined): AdminPoolEntry[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const dot = part.indexOf(".");
      return { staffId: part.slice(0, dot), token: part.slice(dot + 1) };
    })
    .filter((e) => e.staffId && e.token);
}

export async function readAdminPool(): Promise<AdminPoolEntry[]> {
  return parse((await cookies()).get(ADMIN_POOL_COOKIE)?.value);
}

export async function writeAdminPool(entries: AdminPoolEntry[]): Promise<void> {
  const jar = await cookies();
  if (!entries.length) {
    jar.set(ADMIN_POOL_COOKIE, "", opts(0));
    return;
  }
  const value = entries
    .slice(0, MAX_BACKGROUND)
    .map((e) => `${e.staffId}.${e.token}`)
    .join("|");
  jar.set(ADMIN_POOL_COOKIE, value, opts(POOL_MAX_AGE_SEC));
}

/**
 * Another admin has just taken over this device. Park the one being left (if
 * its session is still live) and make sure the incoming one is not also sitting
 * in the pool as a background account.
 */
export async function parkOutgoingAdmin(
  incomingStaffId: string,
  outgoingToken: string | undefined,
): Promise<void> {
  const rest = (await readAdminPool()).filter((e) => e.staffId !== incomingStaffId);
  if (outgoingToken) {
    const live = await peekAdminRefresh(outgoingToken);
    if (live && live.staffId !== incomingStaffId) {
      await writeAdminPool([{ staffId: live.staffId, token: outgoingToken }, ...rest]);
      return;
    }
  }
  await writeAdminPool(rest);
}

export async function takeFromAdminPool(staffId: string): Promise<{
  entry: AdminPoolEntry | null;
  rest: AdminPoolEntry[];
}> {
  const pool = await readAdminPool();
  return {
    entry: pool.find((e) => e.staffId === staffId) ?? null,
    rest: pool.filter((e) => e.staffId !== staffId),
  };
}

/** Log out clears the parked accounts too — see the logout route for why. */
export async function clearAdminPool(): Promise<void> {
  await writeAdminPool([]);
}

/** Sign every parked admin out server-side as well, then drop the cookie. */
export async function revokeAndClearAdminPool(): Promise<void> {
  for (const e of await readAdminPool()) await revokeAdminRefresh(e.token);
  await clearAdminPool();
}
