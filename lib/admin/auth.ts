import "server-only";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { fail } from "@/lib/api";
import {
  ADMIN_COOKIE,
  type AdminClaims,
  requestMeta,
  touchAdminSession,
  verifyAdminToken,
} from "./session";
import { can, isStaffLevel, type Capability, type StaffLevel } from "./permissions";

/**
 * The two walls for the admin zone (CLAUDE.md rule 4 / Doc9 §21):
 *   (a) this module — every request re-reads the seat from the database, and
 *   (b) RLS deny-by-default on every admin table, reached only via service role.
 *
 * The important word is *re-reads*. A JWT is a snapshot of who you were when you
 * signed in; Doc3 §1.1 promises revocation is instant, and a role change has to
 * take effect on the next click. So the token is never trusted for `level` —
 * it identifies the session, and the seat is fetched fresh.
 */

export interface CurrentStaff {
  id: string;
  email: string;
  name: string;
  level: StaffLevel;
  jti: string;
}

export type StaffDenial =
  | { ok: false; reason: "no_session" }
  | { ok: false; reason: "revoked" }
  | { ok: false; reason: "idle" }
  | { ok: false; reason: "expired" };

export type StaffResult = { ok: true; staff: CurrentStaff } | StaffDenial;

/**
 * Resolve the signed-in admin, or say why not. Never throws — callers choose
 * between a redirect (pages) and a 404 (API).
 */
export async function currentStaff(): Promise<StaffResult> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return { ok: false, reason: "no_session" };

  const claims: AdminClaims | null = await verifyAdminToken(token);
  if (!claims) return { ok: false, reason: "expired" };

  // The seat, as it is right now — not as the token remembers it.
  const db = createServiceClient();
  const { data: seat } = await db
    .from("staff")
    .select("profile_id, email, display_name, level, is_active")
    .eq("profile_id", claims.sub)
    .maybeSingle();

  if (!seat || !seat.is_active || !seat.email) return { ok: false, reason: "revoked" };
  if (!isStaffLevel(seat.level)) return { ok: false, reason: "revoked" };

  const session = await touchAdminSession(claims.jti);
  if (!session.live) return { ok: false, reason: session.reason ?? "expired" };

  return {
    ok: true,
    staff: {
      id: seat.profile_id as string,
      email: seat.email as string,
      name: (seat.display_name as string) || (seat.email as string),
      level: seat.level,
      jti: claims.jti,
    },
  };
}

/**
 * API guard. Returns either the seat or a ready-made failure response.
 *
 * 404, not 401/403, for "you are not an admin" — Doc9 §API1: probing must not
 * confirm that account.homzlist.com's endpoints exist. The existing
 * /admin/moderate and /admin/queue routes already answer this way; the whole
 * zone stays consistent with them.
 */
export async function requireStaff(): Promise<{ staff: CurrentStaff } | { response: Response }> {
  const r = await currentStaff();
  if (!r.ok) return { response: fail("NOT_FOUND") };
  return { staff: r.staff };
}

/**
 * API guard with a capability. A capability the seat does not hold is FORBIDDEN,
 * not 404: the caller is a known admin, so there is nothing left to leak by
 * admitting the endpoint exists, and the panel needs to tell them why the
 * button did nothing.
 */
export async function requireCapability(
  cap: Capability,
): Promise<{ staff: CurrentStaff } | { response: Response }> {
  const r = await currentStaff();
  if (!r.ok) return { response: fail("NOT_FOUND") };
  if (!can(r.staff.level, cap)) return { response: fail("FORBIDDEN") };
  return { staff: r.staff };
}

export function isDenial(v: { staff: CurrentStaff } | { response: Response }): v is { response: Response } {
  return "response" in v;
}

// ------------------------------------------------------------------ whitelist

export interface WhitelistHit {
  id: string;
  email: string;
  name: string;
  level: StaffLevel;
}

/**
 * The whitelist lookup: an email may sign in only if a Super Admin put it in
 * `staff` and it is still active. Case-insensitive, because Google returns the
 * address as the user typed it.
 */
export async function lookupWhitelist(
  email: string,
): Promise<{ hit: WhitelistHit } | { denied: "not_whitelisted" | "revoked" }> {
  const db = createServiceClient();
  const { data } = await db
    .from("staff")
    .select("profile_id, email, display_name, level, is_active")
    .ilike("email", email)
    .maybeSingle();

  if (!data) return { denied: "not_whitelisted" };
  if (!data.is_active || !isStaffLevel(data.level)) return { denied: "revoked" };

  return {
    hit: {
      id: data.profile_id as string,
      email: data.email as string,
      name: (data.display_name as string) || (data.email as string),
      level: data.level,
    },
  };
}

export type LoginOutcome = "granted" | "denied_not_whitelisted" | "denied_revoked" | "denied";

/**
 * Doc3 §1.1: login audit (who/when/IP/device), unknown-email attempts logged,
 * and 5+ attempts → super-admin alert. The alert is the part that is easy to
 * leave as a promise with no job behind it, so it is written here, in the same
 * call that records the attempt.
 */
export async function recordLoginAttempt(email: string, outcome: LoginOutcome): Promise<void> {
  const db = createServiceClient();
  const { ip, device } = requestMeta();
  await db.from("admin_login_attempts").insert({ email: email.toLowerCase(), outcome, ip, device });

  if (outcome === "granted") return;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("admin_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .neq("outcome", "granted")
    .gte("created_at", since);

  if ((count ?? 0) < 5) return;

  // admin_notifications is one shared panel-wide feed (it has no staff_id) — the
  // bell drawer in the shell reads it, which is where a Super Admin is already
  // looking. kind/severity follow the vocabulary the seeded rows established.
  await db.from("admin_notifications").insert({
    kind: "staff",
    severity: "error",
    title: `${count} failed admin sign-in attempts`,
    body: `${email.toLowerCase()} has been denied ${count} times in the last hour · last IP ${ip}`,
  });
}
