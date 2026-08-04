import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { requestContext } from "./guard";
import {
  issueAdminRefresh,
  setAdminCookies,
  signAdminAccess,
  clearAdminCookies,
  consumeAdminRefresh,
  revokeAdminRefresh,
  ADMIN_COOKIE,
  type AdminRole,
} from "./session";
import type { ProviderIdentity } from "./auth-provider";
import { parkOutgoingAdmin } from "./account-pool";
import { cookies } from "next/headers";

/**
 * The whitelist gate — the only way an admin session is ever created.
 *
 * Three outcomes, and they are the three states the design's A1 login already
 * draws (template 37-69): signed in · "this Google account doesn't have admin
 * access" · "your admin access was removed". Every attempt, successful or not,
 * lands in admin_login_attempts with its reason, so a brute-force or a
 * mis-provisioned account is visible rather than silent.
 */

export type SignInResult =
  | { outcome: "ok"; role: AdminRole; name: string; email: string }
  | { outcome: "not_whitelisted"; email: string }
  | { outcome: "revoked"; email: string };

function toRole(level: string | null): AdminRole | null {
  if (level === "super") return "super";
  if (level === "admin") return "admin";
  if (level === "staff") return "staff";
  return null;
}

/** Doc5 A1 — "failed attempts logged, 5+ → super alert". */
const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MIN = 15;

/**
 * The alert half of that promise, and the reason it lives here rather than in a
 * route: EVERY sign-in path goes through `log(false, …)`, so a provider added
 * later cannot forget to count.
 *
 * The notification is raised once per window, not once per attempt — the 6th,
 * 7th and 20th failure of the same burst must not bury the bell. The window is
 * re-derived from the log itself rather than kept in memory, so it survives a
 * restart and cannot be reset by whoever is doing the attempting.
 */
async function alertOnRepeatedFailures(email: string): Promise<void> {
  const db = createServiceClient();
  const since = new Date(Date.now() - FAILURE_WINDOW_MIN * 60_000).toISOString();

  const { count } = await db
    .from("admin_login_attempts")
    .select("id", { count: "exact", head: true })
    .ilike("email", email)
    .eq("success", false)
    .gte("created_at", since);
  if ((count ?? 0) < FAILURE_THRESHOLD) return;

  // Already alerted inside this window? Then stay quiet.
  const { count: alerted } = await db
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .eq("kind", "login_failures")
    .eq("body", email)
    .gte("created_at", since);
  if (alerted) return;

  await db.from("admin_notifications").insert({
    kind: "login_failures",
    title: `${count} failed admin sign-ins in ${FAILURE_WINDOW_MIN} minutes`,
    // The email IS the subject of the alert — a super admin cannot act on
    // "someone" — and this table is admin-only behind RLS + requireAdmin.
    body: email,
    link_screen: "audit",
    severity: "error",
  });
}

export async function signInAdmin(identity: ProviderIdentity): Promise<SignInResult> {
  const db = createServiceClient();
  const { ip, device } = await requestContext();
  const email = identity.email.toLowerCase();

  const log = async (success: boolean, reason: string) => {
    await db.from("admin_login_attempts").insert({ email, success, reason, ip, device });
    if (!success) await alertOnRepeatedFailures(email);
  };

  if (!identity.emailVerified) {
    await log(false, "email_unverified");
    return { outcome: "not_whitelisted", email };
  }

  const { data: staff } = await db
    .from("staff")
    .select("profile_id, level, is_active, state, display_name, email")
    .ilike("email", email)
    .maybeSingle();

  // Not on the list at all — the design's "doesn't have admin access" card.
  if (!staff) {
    await log(false, "not_whitelisted");
    return { outcome: "not_whitelisted", email };
  }

  // On the list but switched off — the design's separate "access was removed"
  // screen. Kept distinct because the two mean different things to the person
  // reading them, and because only one of them is worth alerting on.
  const role = toRole(staff.level);
  if (!role || staff.is_active !== true || staff.state !== "active") {
    await log(false, "revoked");
    return { outcome: "revoked", email };
  }

  const { data: session, error } = await db
    .from("staff_sessions")
    .insert({ staff_id: staff.profile_id, ip, device })
    .select("id")
    .single();
  if (error || !session) throw new Error(`could not open a staff session: ${error?.message}`);

  // Someone else may already be signed in on this device — the design's
  // "Add another account" path. Park them rather than dropping their session on
  // the floor, so the switch sheet can offer them back.
  await parkOutgoingAdmin(staff.profile_id, (await cookies()).get(ADMIN_COOKIE.REFRESH)?.value);

  const name = staff.display_name ?? email;
  const access = await signAdminAccess({
    sub: staff.profile_id,
    email: staff.email ?? email,
    name,
    role,
    sid: session.id,
  });
  const refresh = await issueAdminRefresh(staff.profile_id, session.id);
  await setAdminCookies(access, refresh);

  await db
    .from("staff")
    .update({ last_login_at: new Date().toISOString(), is_online: true })
    .eq("profile_id", staff.profile_id);
  await log(true, "ok");

  return { outcome: "ok", role, name, email: staff.email ?? email };
}

/**
 * Spend a refresh token and become that admin: rotate the pair, re-verify the
 * staff row and the session, set the cookies.
 *
 * This is the ONLY way an admin session is adopted after the initial sign-in,
 * so both callers get the same checks. Refreshing spends the current account's
 * token; switching spends a parked one — the difference is which token comes
 * in, never how much is trusted about it.
 */
async function adoptAdminRefresh(raw: string): Promise<{ staffId: string } | null> {
  const found = await consumeAdminRefresh(raw);
  if (!found) return null;

  const db = createServiceClient();
  const { data: staff } = await db
    .from("staff")
    .select("profile_id, level, is_active, state, display_name, email")
    .eq("profile_id", found.staffId)
    .maybeSingle();
  const role = staff ? toRole(staff.level) : null;
  if (!staff || !role || staff.is_active !== true || staff.state !== "active") return null;

  const { data: session } = await db
    .from("staff_sessions")
    .select("id, ended_at")
    .eq("id", found.sessionId)
    .maybeSingle();
  if (!session || session.ended_at) return null;

  const access = await signAdminAccess({
    sub: staff.profile_id,
    email: staff.email ?? "",
    name: staff.display_name ?? "",
    role,
    sid: session.id,
  });
  const refresh = await issueAdminRefresh(staff.profile_id, session.id);
  await setAdminCookies(access, refresh);
  return { staffId: staff.profile_id };
}

/** Rotate the pair. Returns false when the refresh token is spent or unknown. */
export async function refreshAdminSession(): Promise<boolean> {
  const raw = (await cookies()).get(ADMIN_COOKIE.REFRESH)?.value;
  if (!raw) return false;
  return (await adoptAdminRefresh(raw)) !== null;
}

/**
 * Switch to an account parked on this device. The caller has already taken the
 * entry out of the pool; if adopting it fails (revoked staff, killed session,
 * spent token) it is simply gone — a dead account must not come back to the
 * sheet, and the active session is left untouched.
 */
export async function switchToParkedAdmin(
  token: string,
  outgoingToken: string | undefined,
): Promise<boolean> {
  const adopted = await adoptAdminRefresh(token);
  if (!adopted) return false;
  await parkOutgoingAdmin(adopted.staffId, outgoingToken);
  return true;
}

/** Close the session server-side, then clear the cookies. Order matters. */
export async function signOutAdmin(): Promise<void> {
  const raw = (await cookies()).get(ADMIN_COOKIE.REFRESH)?.value;
  const claims = await import("./session").then((m) => m.readAdminClaims());
  if (claims) {
    const db = createServiceClient();
    await db
      .from("staff_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", claims.sid);
    // Only mark offline when this was the last live session for that admin.
    const { count } = await db
      .from("staff_sessions")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", claims.sub)
      .is("ended_at", null);
    if (!count) await db.from("staff").update({ is_online: false }).eq("profile_id", claims.sub);
  }
  if (raw) await revokeAdminRefresh(raw);
  clearAdminCookies();
}
