import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { cookieOpts } from "@/lib/auth/session";
import type { StaffLevel } from "./permissions";

/**
 * Admin session (Doc3 §1.1, Doc9 §21) — deliberately NOT the user session.
 *
 * The user side carries a 15-min access JWT plus a rotating 30-day refresh
 * token, because a seller should stay signed in for weeks. An admin must not:
 * Doc3 gives it a 30-minute timeout with a 2-hour idle heartbeat, and removing
 * an email has to end the session "instantly". So this is a single short-lived
 * cookie whose `jti` is tracked in `staff_sessions` — the row is the authority,
 * the cookie is only a claim. Kill the row and the next request is signed out,
 * which is what "instantly" has to mean.
 *
 * The cookie is host-only (no Domain attribute), so account.homzlist.com's
 * session is invisible to homzlist.com and seller.homzlist.com — the isolation
 * Doc9 §21 requires is a property of the cookie, not of a check we remember to
 * write.
 */
export const ADMIN_COOKIE = "hz_ast";

/** Doc3 §1.1: "30-min session timeout". */
export const ADMIN_SESSION_TTL_SEC = 30 * 60;
/** Doc3 §1.1: "2h idle heartbeat warning → auto-logout". */
export const ADMIN_IDLE_LIMIT_SEC = 2 * 60 * 60;

const secret = () => new TextEncoder().encode(serverEnv().jwt.accessSecret);

export interface AdminClaims {
  /** staff.profile_id */
  sub: string;
  level: StaffLevel;
  email: string;
  name: string;
  /** staff_sessions.jti — the handle that makes revocation possible. */
  jti: string;
  typ: "admin";
}

export async function signAdminToken(c: Omit<AdminClaims, "typ">): Promise<string> {
  return new SignJWT({ ...c, typ: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setJti(c.jti)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SEC}s`)
    .sign(secret());
}

export async function verifyAdminToken(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "admin" || !payload.sub || !payload.jti) return null;
    return {
      sub: payload.sub as string,
      level: payload.level as StaffLevel,
      email: (payload.email as string) ?? "",
      name: (payload.name as string) ?? "",
      jti: payload.jti as string,
      typ: "admin",
    };
  } catch {
    return null;
  }
}

/** Request fingerprint for the login audit and the session row. */
export function requestMeta(): { ip: string; device: string } {
  const h = headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ??
    "";
  return { ip: ip || "unknown", device: (h.get("user-agent") ?? "unknown").slice(0, 300) };
}

/**
 * Open a session: one `staff_sessions` row per sign-in, carrying the jti the
 * cookie will present back. Also stamps last_login_at / is_online, which A25's
 * "Last login" and online dot read — the seed had those columns but nothing
 * ever wrote them at login time.
 */
export async function startAdminSession(staffId: string): Promise<string> {
  const db = createServiceClient();
  const jti = randomUUID();
  const { ip, device } = requestMeta();

  const { error } = await db.from("staff_sessions").insert({
    staff_id: staffId,
    jti,
    ip,
    device,
    started_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  });
  if (error) throw new Error(`staff_sessions insert failed: ${error.message}`);

  await db
    .from("staff")
    .update({ last_login_at: new Date().toISOString(), is_online: true, state: "active" })
    .eq("profile_id", staffId);

  return jti;
}

export interface SessionState {
  live: boolean;
  /** Set when the session died for a reason the UI must explain rather than just bounce. */
  reason?: "revoked" | "idle" | "expired";
  idleSeconds: number;
}

/**
 * Is the session behind this jti still alive? Called on EVERY admin request
 * (see requireStaff) because the cookie cannot know that a Super Admin removed
 * the seat ten seconds ago.
 *
 * Touching `last_seen_at` here is what makes the 2-hour idle rule real: an admin
 * who is working keeps it fresh, and one who walked away does not.
 */
export async function touchAdminSession(jti: string): Promise<SessionState> {
  const db = createServiceClient();
  const { data } = await db
    .from("staff_sessions")
    .select("id, last_seen_at, ended_at, revoked_at")
    .eq("jti", jti)
    .maybeSingle();

  if (!data) return { live: false, reason: "expired", idleSeconds: 0 };
  if (data.revoked_at) return { live: false, reason: "revoked", idleSeconds: 0 };
  if (data.ended_at) return { live: false, reason: "expired", idleSeconds: 0 };

  const idleSeconds = Math.floor((Date.now() - new Date(data.last_seen_at as string).getTime()) / 1000);
  if (idleSeconds > ADMIN_IDLE_LIMIT_SEC) {
    await db
      .from("staff_sessions")
      .update({ ended_at: new Date().toISOString(), revoke_reason: "idle_timeout" })
      .eq("id", data.id);
    return { live: false, reason: "idle", idleSeconds };
  }

  await db.from("staff_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return { live: true, idleSeconds };
}

export async function endAdminSession(jti: string, reason = "logout"): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("staff_sessions").select("staff_id").eq("jti", jti).maybeSingle();
  await db
    .from("staff_sessions")
    .update({ ended_at: new Date().toISOString(), revoke_reason: reason })
    .eq("jti", jti)
    .is("ended_at", null);
  if (data?.staff_id) await markOfflineIfNoLiveSession(data.staff_id as string);
}

/**
 * Doc3 §1.1: "Remove email = access revoked + sessions invalidated instantly."
 * A25's "Reset session" (force sign-out on all devices) and a role change both
 * land here too — a stale cookie must not keep the old level.
 */
export async function revokeAllAdminSessions(staffId: string, reason: string): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from("staff_sessions")
    .update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
    .eq("staff_id", staffId)
    .is("ended_at", null)
    .is("revoked_at", null)
    .select("id");
  await db.from("staff").update({ is_online: false }).eq("profile_id", staffId);
  return data?.length ?? 0;
}

async function markOfflineIfNoLiveSession(staffId: string) {
  const db = createServiceClient();
  const { data } = await db
    .from("staff_sessions")
    .select("id")
    .eq("staff_id", staffId)
    .is("ended_at", null)
    .is("revoked_at", null)
    .limit(1);
  if (!data?.length) await db.from("staff").update({ is_online: false }).eq("profile_id", staffId);
}

/** The jti on the current request's cookie, without re-validating the seat. */
export async function currentJti(): Promise<string | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAdminToken(token);
  return claims?.jti ?? null;
}

export function setAdminCookie(token: string) {
  cookies().set(ADMIN_COOKIE, token, cookieOpts(ADMIN_SESSION_TTL_SEC));
}

export function clearAdminCookie() {
  cookies().delete(ADMIN_COOKIE);
}
