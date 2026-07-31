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

export async function signInAdmin(identity: ProviderIdentity): Promise<SignInResult> {
  const db = createServiceClient();
  const { ip, device } = requestContext();
  const email = identity.email.toLowerCase();

  const log = (success: boolean, reason: string) =>
    db.from("admin_login_attempts").insert({ email, success, reason, ip, device });

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

/** Rotate the pair. Returns false when the refresh token is spent or unknown. */
export async function refreshAdminSession(): Promise<boolean> {
  const raw = cookies().get(ADMIN_COOKIE.REFRESH)?.value;
  if (!raw) return false;
  const found = await consumeAdminRefresh(raw);
  if (!found) return false;

  const db = createServiceClient();
  const { data: staff } = await db
    .from("staff")
    .select("profile_id, level, is_active, state, display_name, email")
    .eq("profile_id", found.staffId)
    .maybeSingle();
  const role = staff ? toRole(staff.level) : null;
  if (!staff || !role || staff.is_active !== true || staff.state !== "active") return false;

  const { data: session } = await db
    .from("staff_sessions")
    .select("id, ended_at")
    .eq("id", found.sessionId)
    .maybeSingle();
  if (!session || session.ended_at) return false;

  const access = await signAdminAccess({
    sub: staff.profile_id,
    email: staff.email ?? "",
    name: staff.display_name ?? "",
    role,
    sid: session.id,
  });
  const refresh = await issueAdminRefresh(staff.profile_id, session.id);
  await setAdminCookies(access, refresh);
  return true;
}

/** Close the session server-side, then clear the cookies. Order matters. */
export async function signOutAdmin(): Promise<void> {
  const raw = cookies().get(ADMIN_COOKIE.REFRESH)?.value;
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
