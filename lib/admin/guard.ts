import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { readAdminClaims, type AdminRole } from "./session";

/**
 * The server half of every permission decision in the panel.
 *
 * The cookie is necessary but never sufficient. On EVERY request this re-reads
 * the staff row and re-derives the role from it, so:
 *   · an admin whose access was revoked stops working on their next click, not
 *     when their 30-minute token happens to expire;
 *   · a role downgrade takes effect immediately;
 *   · the role used for authorization is the DATABASE's, never the token's — a
 *     forged or stale `role` claim buys nothing.
 *
 * `staff_sessions.ended_at` is checked too, so "log out everywhere" and the
 * staff screen's session-kill are real.
 */

export const ROLE_RANK: Record<AdminRole, number> = { staff: 1, admin: 2, super: 3 };

export type AdminIdentity = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  sessionId: string;
};

/** staff.level → the design's three roles. */
function toRole(level: string | null): AdminRole | null {
  if (level === "super") return "super";
  if (level === "admin") return "admin";
  if (level === "staff") return "staff";
  return null;
}

/**
 * The signed-in admin, re-verified against the database, or null.
 * Null covers every failure identically — no session, bad token, revoked staff,
 * ended session — so nothing here can be used to enumerate who is an admin.
 */
export async function currentAdmin(): Promise<AdminIdentity | null> {
  const claims = await readAdminClaims();
  if (!claims) return null;

  const db = createServiceClient();
  const { data: staff } = await db
    .from("staff")
    .select("profile_id, level, is_active, state, email, display_name")
    .eq("profile_id", claims.sub)
    .maybeSingle();

  if (!staff || staff.is_active !== true || staff.state !== "active") return null;
  const role = toRole(staff.level);
  if (!role) return null;

  const { data: session } = await db
    .from("staff_sessions")
    .select("id, ended_at")
    .eq("id", claims.sid)
    .maybeSingle();
  if (!session || session.ended_at) return null;

  // Presence for the header's "N online" cluster is a real timestamp, not a flag
  // the client asserts.
  await db
    .from("staff_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", claims.sid);

  return {
    id: staff.profile_id,
    email: staff.email ?? claims.email,
    name: staff.display_name ?? claims.name,
    role,
    sessionId: claims.sid,
  };
}

export class AdminAuthError extends Error {
  constructor(readonly kind: "unauthenticated" | "forbidden") {
    super(kind);
  }
}

/**
 * Authorize a request. Throws `AdminAuthError` rather than returning a response
 * so a route cannot forget to check the result and carry on with `null`.
 *
 * `min` is the design's own gate for the screen or action (template 248 —
 * SCREEN_MIN_ROLE). Passing it is mandatory; there is no "any admin" default,
 * because an unlabelled endpoint is how a staff-level account ends up able to
 * call an admin-level mutation.
 */
export async function requireAdmin(min: AdminRole): Promise<AdminIdentity> {
  const me = await currentAdmin();
  if (!me) throw new AdminAuthError("unauthenticated");
  if (ROLE_RANK[me.role] < ROLE_RANK[min]) throw new AdminAuthError("forbidden");
  return me;
}

/** Request metadata every audit row carries. */
export function requestContext(): { ip: string | null; device: string | null } {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  return {
    ip: fwd ? fwd.split(",")[0].trim() : (h.get("x-real-ip") ?? null),
    device: h.get("user-agent"),
  };
}
