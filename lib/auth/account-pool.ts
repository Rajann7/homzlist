import "server-only";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
import { cookieOpts, REFRESH_MAX_AGE_SEC, revokeSession, peekRefreshSession } from "./session";

/**
 * Multi-account pool (P9 S1 "Switch account", Doc2 §3.1 "Account switch —
 * multi-account dropdown").
 *
 * The ACTIVE account lives in hz_at/hz_rt exactly as before. Every OTHER account
 * signed in on this device keeps its real, server-tracked refresh token in a
 * second httpOnly cookie, `hz_accts`. Switching = the server rotating that
 * account's genuine refresh session and swapping the active cookies — the client
 * never sees a token, never holds a role, and can never name an account it did
 * not already sign into on this device (Doc9 §2, §15).
 *
 * Backend-lock notes:
 *  - httpOnly + Secure(prod) + SameSite=Lax + host-only, same as hz_rt. No JS read.
 *  - The cookie holds ONLY refresh tokens. No names, roles, plans or counts — the
 *    display list for the sheet is a live Supabase query (see /auth/accounts).
 *  - A pool token is validated against KV on every use; a revoked/expired one is
 *    dropped, so a signed-out account can never be switched back into.
 */
export const COOKIE_POOL = "hz_accts";

/** 4 background + 1 active = 5 accounts per device (same cap as the S5 hints). */
const MAX_BACKGROUND = 4;

export interface PoolEntry {
  profileId: string;
  token: string;
}

function parse(raw: string | undefined): PoolEntry[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => ({ profileId: token.split(".")[0] ?? "", token }))
    .filter((e) => e.profileId && e.token.split(".").length === 3);
}

function serialize(entries: PoolEntry[]): string {
  return entries.map((e) => e.token).join("|");
}

/** Background accounts, most-recently-used first. */
export function readPool(): PoolEntry[] {
  return parse((cookies() as unknown as UnsafeUnwrappedCookies).get(COOKIE_POOL)?.value);
}

export function writePool(entries: PoolEntry[]): void {
  const jar = (cookies() as unknown as UnsafeUnwrappedCookies);
  if (!entries.length) {
    jar.delete(COOKIE_POOL);
    return;
  }
  jar.set(COOKIE_POOL, serialize(entries.slice(0, MAX_BACKGROUND)), cookieOpts(REFRESH_MAX_AGE_SEC));
}

/**
 * Park a refresh token in the pool (used when another account takes over as
 * active). De-duplicates by profile so the same account can never appear twice.
 */
export function addToPool(refreshToken: string, existing?: PoolEntry[]): void {
  const profileId = refreshToken.split(".")[0];
  if (!profileId) return;
  const rest = (existing ?? readPool()).filter((e) => e.profileId !== profileId);
  writePool([{ profileId, token: refreshToken }, ...rest]);
}

/** Take an account out of the pool, returning its token if it was there. */
export function takeFromPool(profileId: string): { entry: PoolEntry | null; rest: PoolEntry[] } {
  const pool = readPool();
  const entry = pool.find((e) => e.profileId === profileId) ?? null;
  return { entry, rest: pool.filter((e) => e.profileId !== profileId) };
}

/**
 * A new account has just taken over the device (OTP login / registration while
 * someone was already signed in — the "Add account" path). Park the account
 * being left, and make sure the newly-active one is not also sitting in the pool.
 * A dead outgoing session is simply dropped.
 */
export async function absorbOutgoingSession(newActiveProfileId: string, outgoingToken: string | undefined): Promise<void> {
  const rest = readPool().filter((e) => e.profileId !== newActiveProfileId);
  const outgoingId = outgoingToken?.split(".")[0];
  if (outgoingToken && outgoingId && outgoingId !== newActiveProfileId && (await peekRefreshSession(outgoingToken))) {
    writePool([{ profileId: outgoingId, token: outgoingToken }, ...rest]);
    return;
  }
  writePool(rest);
}

/** Sign every background account out of this device (server-side revoke + cookie). */
export async function revokeAndClearPool(): Promise<void> {
  for (const e of readPool()) {
    const [profileId, sid] = e.token.split(".");
    if (profileId && sid) await revokeSession(profileId, sid);
  }
  (await cookies()).delete(COOKIE_POOL);
}
