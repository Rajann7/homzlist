import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { kv } from "@/lib/kv";
import { serverEnv } from "@/lib/env";

/**
 * Session layer (Doc2 §3.1 / Doc9 §2, §15).
 *  - Access: JWT (15 min), HS256 (JWT_ACCESS_SECRET), verified every request.
 *  - Refresh: opaque random (30 days), hashed in KV, ROTATED every use.
 *  - Register: short-lived JWT for the OTP-verified-but-not-registered window.
 * Cookies are host-only (no Domain) → per-subdomain isolation. httpOnly +
 * Secure(prod) + SameSite=Lax. No token in localStorage.
 */
export const COOKIE = { ACCESS: "hz_at", REFRESH: "hz_rt", REGISTER: "hz_reg" } as const;

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
const REGISTER_TTL_SEC = 15 * 60;

const accessSecret = () => new TextEncoder().encode(serverEnv().jwt.accessSecret);

export interface AccessClaims {
  sub: string;
  role: string | null;
  registered: boolean;
  typ: "access";
}

export async function signAccess(claims: Omit<AccessClaims, "typ">): Promise<string> {
  return new SignJWT({ ...claims, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(accessSecret());
}

export async function verifyAccess(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret());
    if (payload.typ !== "access" || !payload.sub) return null;
    return { sub: payload.sub as string, role: (payload.role as string) ?? null, registered: Boolean(payload.registered), typ: "access" };
  } catch {
    return null;
  }
}

export async function signRegisterToken(profileId: string): Promise<string> {
  return new SignJWT({ typ: "register" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profileId)
    .setIssuedAt()
    .setExpirationTime(`${REGISTER_TTL_SEC}s`)
    .sign(accessSecret());
}

export async function verifyRegisterToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret());
    return payload.typ === "register" && payload.sub ? (payload.sub as string) : null;
  } catch {
    return null;
  }
}

/** Number-change token: proves the OLD number was re-verified (Doc2 §3.3 dual-OTP). */
export const COOKIE_NUMBER_CHANGE = "hz_nc";
export async function signNumberChangeToken(profileId: string): Promise<string> {
  return new SignJWT({ typ: "nc" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profileId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessSecret());
}
export async function verifyNumberChangeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret());
    return payload.typ === "nc" && payload.sub ? (payload.sub as string) : null;
  } catch {
    return null;
  }
}

const refreshKey = (profileId: string, sid: string) => `sess:${profileId}:${sid}`;
const sessionSetKey = (profileId: string) => `sess:index:${profileId}`;
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

export interface SessionMeta {
  ua: string;
  ipHash: string;
  createdAt: number;
  lastUsedAt: number;
}

export async function createRefreshSession(profileId: string, meta: Omit<SessionMeta, "createdAt" | "lastUsedAt">): Promise<string> {
  const sid = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const record = { secretHash: hashSecret(secret), ...meta, createdAt: Date.now(), lastUsedAt: Date.now() };
  await kv.set(refreshKey(profileId, sid), JSON.stringify(record), REFRESH_TTL_SEC);
  await kv.sadd(sessionSetKey(profileId), sid);
  return `${profileId}.${sid}.${secret}`;
}

export async function rotateRefreshSession(cookieValue: string): Promise<{ profileId: string; newCookie: string } | null> {
  const [profileId, sid, secret] = (cookieValue ?? "").split(".");
  if (!profileId || !sid || !secret) return null;
  const raw = await kv.get(refreshKey(profileId, sid));
  if (!raw) return null;
  const rec = JSON.parse(raw);
  if (rec.secretHash !== hashSecret(secret)) {
    await revokeSession(profileId, sid); // secret mismatch = theft/replay
    return null;
  }
  const newSecret = randomBytes(32).toString("base64url");
  rec.secretHash = hashSecret(newSecret);
  rec.lastUsedAt = Date.now();
  await kv.set(refreshKey(profileId, sid), JSON.stringify(rec), REFRESH_TTL_SEC);
  return { profileId, newCookie: `${profileId}.${sid}.${newSecret}` };
}

export async function revokeSession(profileId: string, sid: string): Promise<void> {
  await kv.del(refreshKey(profileId, sid));
  await kv.srem(sessionSetKey(profileId), sid);
}

export async function revokeAllSessions(profileId: string): Promise<void> {
  const sids = await kv.smembers(sessionSetKey(profileId));
  if (sids.length) await kv.del(...sids.map((s) => refreshKey(profileId, s)));
  await kv.del(sessionSetKey(profileId));
}

export async function listSessions(profileId: string): Promise<Array<{ sid: string } & SessionMeta>> {
  const sids = await kv.smembers(sessionSetKey(profileId));
  const out: Array<{ sid: string } & SessionMeta> = [];
  for (const sid of sids) {
    const raw = await kv.get(refreshKey(profileId, sid));
    if (raw) {
      const r = JSON.parse(raw);
      out.push({ sid, ua: r.ua, ipHash: r.ipHash, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt });
    }
  }
  return out.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setSessionCookies(access: string, refresh: string) {
  const jar = cookies();
  jar.set(COOKIE.ACCESS, access, cookieOpts(ACCESS_TTL_SEC));
  jar.set(COOKIE.REFRESH, refresh, cookieOpts(REFRESH_TTL_SEC));
  jar.delete(COOKIE.REGISTER);
}

export async function setRegisterCookie(token: string) {
  cookies().set(COOKIE.REGISTER, token, cookieOpts(REGISTER_TTL_SEC));
}

export async function clearAuthCookies() {
  const jar = cookies();
  jar.delete(COOKIE.ACCESS);
  jar.delete(COOKIE.REFRESH);
  jar.delete(COOKIE.REGISTER);
}
