import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { kv } from "@/lib/kv";
import { serverEnv } from "@/lib/env";

/**
 * ADMIN session — account.homzlist.com only, fully isolated from the user
 * session (Doc9 §21 / CLAUDE.md subdomain rule).
 *
 * Isolation is not a claim, it is four concrete properties:
 *   1. DIFFERENT COOKIE NAMES (`hz_admin_at` / `hz_admin_rt`). A user session
 *      cookie can never be mistaken for an admin one, in either direction.
 *   2. Host-only cookies — no Domain attribute — so the browser will not send
 *      them to homzlist.com or seller.homzlist.com at all.
 *   3. A different signing secret derived from JWT_ACCESS_SECRET with a fixed
 *      label, so a forged user access token does not verify here even if the
 *      base secret leaks into a user-side code path.
 *   4. A different claim shape (`typ: "admin"` + a staff id, never a profile
 *      role string), so a token of the wrong kind fails the shape check even
 *      before the signature is trusted.
 *
 * Access is a short JWT; refresh is an opaque random string stored HASHED in KV
 * and ROTATED on every use — the same discipline as lib/auth/session.ts, which
 * this deliberately mirrors rather than reuses.
 */

export const ADMIN_COOKIE = { ACCESS: "hz_admin_at", REFRESH: "hz_admin_rt" } as const;

/** Admin sessions are short: a panel that can suspend accounts should not idle open. */
const ACCESS_TTL_SEC = 30 * 60;
const REFRESH_TTL_SEC = 12 * 60 * 60;

export type AdminRole = "staff" | "admin" | "super";

export interface AdminClaims {
  /** staff.profile_id */
  sub: string;
  email: string;
  name: string;
  role: AdminRole;
  /** staff_sessions.id — lets a single session be revoked without killing the account */
  sid: string;
  typ: "admin";
}

function adminSecret() {
  const base = serverEnv().jwt.accessSecret;
  if (!base) throw new Error("JWT_ACCESS_SECRET is not set — admin sessions cannot be signed.");
  // Domain-separated from the user-session secret on purpose (property 3 above).
  return createHash("sha256").update(`homzlist:admin:${base}`).digest();
}

export async function signAdminAccess(claims: Omit<AdminClaims, "typ">): Promise<string> {
  return new SignJWT({ ...claims, typ: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(adminSecret());
}

export async function verifyAdminAccess(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, adminSecret());
    if (payload.typ !== "admin" || !payload.sub || !payload.sid) return null;
    const role = payload.role;
    if (role !== "staff" && role !== "admin" && role !== "super") return null;
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role,
      sid: String(payload.sid),
      typ: "admin",
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ refresh */

const refreshKey = (hash: string) => `admin:rt:${hash}`;
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

export async function issueAdminRefresh(staffId: string, sessionId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await kv.set(refreshKey(hash(raw)), JSON.stringify({ staffId, sessionId }), REFRESH_TTL_SEC);
  return raw;
}

/**
 * Consume a refresh token, returning the session it belonged to. Single-use:
 * the old hash is deleted before a new one is minted, so a stolen token that is
 * replayed after the real client has refreshed finds nothing.
 */
export async function consumeAdminRefresh(
  raw: string,
): Promise<{ staffId: string; sessionId: string } | null> {
  const key = refreshKey(hash(raw));
  const stored = await kv.get(key);
  if (!stored) return null;
  await kv.del(key);
  try {
    return JSON.parse(stored) as { staffId: string; sessionId: string };
  } catch {
    return null;
  }
}

export async function revokeAdminRefresh(raw: string): Promise<void> {
  await kv.del(refreshKey(hash(raw)));
}

/* ------------------------------------------------------------------ cookies */

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // No `domain`: host-only, so these never travel to the public or seller host.
  };
}

export async function setAdminCookies(access: string, refresh: string): Promise<void> {
  const jar = cookies();
  jar.set(ADMIN_COOKIE.ACCESS, access, { ...cookieOptions(), maxAge: ACCESS_TTL_SEC });
  jar.set(ADMIN_COOKIE.REFRESH, refresh, { ...cookieOptions(), maxAge: REFRESH_TTL_SEC });
}

export function clearAdminCookies(): void {
  const jar = cookies();
  jar.set(ADMIN_COOKIE.ACCESS, "", { ...cookieOptions(), maxAge: 0 });
  jar.set(ADMIN_COOKIE.REFRESH, "", { ...cookieOptions(), maxAge: 0 });
}

/** The raw claims in the current request's admin cookie, or null. */
export async function readAdminClaims(): Promise<AdminClaims | null> {
  const token = cookies().get(ADMIN_COOKIE.ACCESS)?.value;
  if (!token) return null;
  return verifyAdminAccess(token);
}
