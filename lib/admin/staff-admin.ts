import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "./audit";
import type { AdminIdentity } from "./guard";

/**
 * A25 — Staff. Template 2522-2564.
 *
 * The whitelist. Every rule here exists because the alternative locks somebody
 * out of the panel or lets somebody in who should not be:
 *
 *  · ADDING A STAFF MEMBER IS ADDING AN EMAIL, not creating an account. There
 *    is no password to set — Google is the only door (Doc9), and
 *    `lib/admin/sign-in.ts` refuses any email not on this list.
 *  · REMOVING ONE REVOKES ACCESS IMMEDIATELY. `requireAdmin` re-reads the
 *    staff row on EVERY request (P1a), so an unexpired cookie stops working on
 *    the next call rather than at its expiry.
 *  · NOBODY CAN DEMOTE OR REMOVE THEMSELVES, and the last Super Admin cannot
 *    be removed or demoted by anyone. Either one leaves a panel with no one
 *    who can add a Super Admin back.
 */

const db = () => createServiceClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export interface ActionResult {
  ok: boolean;
  label?: string;
  summary?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * The design's permission matrix (template 2540) — nineteen capabilities across
 * three roles.
 *
 * It is exported as DATA and the screen renders it, so the table an admin reads
 * is generated from the same list the server authorises against rather than a
 * second hand-maintained copy that drifts.
 */
export const CAPABILITIES: { label: string; min: "staff" | "admin" | "super" }[] = [
  { label: "Review queues", min: "staff" },
  { label: "Approve/Reject listings", min: "staff" },
  { label: "Support tickets", min: "admin" },
  { label: "Edit users", min: "admin" },
  { label: "Edit listings", min: "admin" },
  { label: "Coupons", min: "admin" },
  { label: "Refunds", min: "admin" },
  { label: "Grants & trials", min: "admin" },
  { label: "Plans & pricing", min: "super" },
  { label: "Master data", min: "admin" },
  { label: "CMS", min: "admin" },
  { label: "Templates", min: "admin" },
  { label: "Feature flags", min: "super" },
  { label: "Branding", min: "super" },
  { label: "Staff management", min: "super" },
  { label: "Audit log", min: "super" },
  { label: "Evidence preservation", min: "super" },
  { label: "Ban device/IP", min: "super" },
  { label: "Delete user", min: "super" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function superAdminCount(excluding?: string): Promise<number> {
  let q = db()
    .from("staff")
    .select("profile_id", { count: "exact", head: true })
    .eq("level", "super")
    .eq("is_active", true);
  if (excluding) q = q.neq("profile_id", excluding);
  const { count } = await q;
  return count ?? 0;
}

export async function addStaff(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const level = ["staff", "admin", "super"].includes(String(body.level)) ? String(body.level) : "staff";

  if (!EMAIL_RE.test(email)) return { ok: false, message: "That is not a valid email address" };
  if (!name) return { ok: false, message: "Give them a name" };

  const { data: existing } = await db()
    .from("staff")
    .select("profile_id, is_active")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    const row = existing as { profile_id: string; is_active: boolean };
    if (row.is_active) return { ok: false, message: `${email} is already on the list` };
    // Re-adding somebody who was revoked reactivates the SAME row, so their
    // audit history stays attached to them rather than starting again.
    await db()
      .from("staff")
      .update({ is_active: true, level, display_name: name, state: "active", invited_at: new Date().toISOString() })
      .eq("profile_id", row.profile_id);
    await writeAudit(me, {
      action: "staff_add",
      entityType: "staff",
      entityId: row.profile_id,
      entityLabel: name,
      summary: `${name} (${email}) re-added as ${level}`,
      sensitive: true,
    });
    return { ok: true, label: name, summary: `${name} re-added — they can sign in with Google now` };
  }

  // `staff.profile_id` is a FOREIGN KEY to `profiles`, so a staff member is a
  // profile that also happens to be staff — there is no such thing as a staff
  // row floating free of one. The profile is created first, with a placeholder
  // phone: `profiles.phone` is NOT NULL and an admin signs in with Google, so
  // they have no phone to give. `signInAdmin` binds the Google subject to this
  // id on first login.
  const profileId = crypto.randomUUID();
  const { error: profileErr } = await db().from("profiles").insert({
    id: profileId,
    // Namespaced so it can never collide with a real +91 number and can never
    // be used to sign in through the OTP door.
    phone: `staff:${email}`,
    name,
    state: "active",
    is_registered: true,
  });
  if (profileErr) return { ok: false, message: `Could not create the account: ${profileErr.message}` };

  const { data, error } = await db()
    .from("staff")
    .insert({
      profile_id: profileId,
      email,
      display_name: name,
      level,
      is_active: true,
      state: "active",
      added_by: me.id,
      invited_at: new Date().toISOString(),
    })
    .select("profile_id")
    .single();
  if (error) {
    // The profile was created a moment ago and nothing else points at it yet,
    // so it goes back — otherwise a failed add leaves an orphan account behind.
    await db().from("profiles").delete().eq("id", profileId);
    return { ok: false, message: error.message };
  }

  await writeAudit(me, {
    action: "staff_add",
    entityType: "staff",
    entityId: data.profile_id,
    entityLabel: name,
    summary: `${name} (${email}) added as ${level}`,
    diff: { email, level },
    sensitive: true,
  });
  return {
    ok: true,
    label: name,
    summary: `${name} added — they sign in with Google at account.homzlist.com`,
  };
}

export async function setStaffRole(
  id: string,
  level: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  if (!["staff", "admin", "super"].includes(level)) return { ok: false, message: "That is not a role" };
  // Changing your own role is how an admin accidentally locks themselves out
  // of the screen they are standing on.
  if (id === me.id) return { ok: false, message: "You cannot change your own role" };

  const { data } = await db()
    .from("staff")
    .select("profile_id, display_name, level, is_active")
    .eq("profile_id", id)
    .maybeSingle();
  const s = data as { display_name: string; level: string; is_active: boolean } | null;
  if (!s) return { ok: false, message: "Not found" };

  if (s.level === "super" && level !== "super" && (await superAdminCount(id)) === 0)
    return { ok: false, message: "That is the last Super Admin — promote someone else first" };

  await db().from("staff").update({ level }).eq("profile_id", id);
  await writeAudit(me, {
    action: "staff_role",
    entityType: "staff",
    entityId: id,
    entityLabel: s.display_name,
    summary: `${s.display_name} ${s.level} → ${level}`,
    diff: { before: s.level, after: level },
    sensitive: true,
  });
  return { ok: true, label: s.display_name, summary: `${s.display_name} is now ${level}` };
}

/**
 * Removing access. The staff row is deactivated rather than deleted, because
 * the audit log points at it — a deleted row turns every action they ever took
 * into "unknown admin".
 *
 * Their live sessions are revoked in the same call. Without that, an admin
 * removed at 14:00 keeps working until their access token expires.
 */
export async function revokeStaff(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  if (id === me.id) return { ok: false, message: "You cannot remove yourself" };

  const { data } = await db()
    .from("staff")
    .select("profile_id, display_name, email, level, is_active")
    .eq("profile_id", id)
    .maybeSingle();
  const s = data as { display_name: string; email: string; level: string; is_active: boolean } | null;
  if (!s) return { ok: false, message: "Not found" };
  if (!s.is_active) return { ok: false, message: "That person has already been removed" };
  if (s.level === "super" && (await superAdminCount(id)) === 0)
    return { ok: false, message: "That is the last Super Admin — promote someone else first" };

  await db()
    .from("staff")
    .update({ is_active: false, state: "revoked" })
    .eq("profile_id", id);

  const { data: killed } = await db()
    .from("staff_sessions")
    .update({ revoked_at: new Date().toISOString(), revoke_reason: `Access removed by ${me.name}` })
    .eq("staff_id", id)
    .is("ended_at", null)
    .is("revoked_at", null)
    .select("id");

  await writeAudit(me, {
    action: "staff_revoke",
    entityType: "staff",
    entityId: id,
    entityLabel: s.display_name,
    summary: `${s.display_name} (${s.email}) removed · ${(killed ?? []).length} session(s) revoked`,
    sensitive: true,
  });
  return {
    ok: true,
    label: s.display_name,
    summary: `${s.display_name} removed · ${(killed ?? []).length} live session(s) ended`,
  };
}

/** "Sign out everywhere" on the row menu — without removing their access. */
export async function revokeStaffSessions(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("staff")
    .select("profile_id, display_name")
    .eq("profile_id", id)
    .maybeSingle();
  const s = data as { display_name: string } | null;
  if (!s) return { ok: false, message: "Not found" };

  const { data: killed } = await db()
    .from("staff_sessions")
    .update({ revoked_at: new Date().toISOString(), revoke_reason: `Signed out by ${me.name}` })
    .eq("staff_id", id)
    .is("ended_at", null)
    .is("revoked_at", null)
    .select("id");

  await writeAudit(me, {
    action: "staff_signout",
    entityType: "staff",
    entityId: id,
    entityLabel: s.display_name,
    summary: `${s.display_name} signed out of ${(killed ?? []).length} session(s)`,
    sensitive: true,
  });
  return { ok: true, label: s.display_name, summary: `${(killed ?? []).length} session(s) ended` };
}

/**
 * The staff performance panel (template 2545) — every number a real count over
 * `admin_audit_log`, which is the only honest source: it is the table that
 * records what they actually did.
 */
export async function staffPerformance(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("admin_staff_list").select("*").eq("id", id).maybeSingle();
  if (!data) return null;

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: actions }, { data: recent }, { data: sessions }] = await Promise.all([
    db().from("admin_audit_log").select("action, created_at").eq("actor_id", id).gte("created_at", since),
    db()
      .from("admin_audit_log")
      .select("action, entity_label, summary, created_at")
      .eq("actor_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    db()
      .from("staff_sessions")
      .select("id, started_at, last_seen_at, ip, device, ended_at, revoked_at")
      .eq("staff_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const rows = (actions ?? []) as { action: string; created_at: string }[];
  const countOf = (...names: string[]) => rows.filter((r) => names.includes(r.action)).length;

  // Seven weekly buckets, the shape the design's bar chart draws.
  const weeks = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    d.setDate(d.getDate() - d.getDay());
    const key = d.toISOString().slice(0, 10);
    weeks.set(key, (weeks.get(key) ?? 0) + 1);
  }

  return {
    ...(data as Record<string, unknown>),
    approvals: countOf("approve"),
    rejections: countOf("reject"),
    tickets_closed: countOf("ticket_close"),
    total_actions_30d: rows.length,
    activity: [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([bucket, n]) => ({ bucket, n })),
    recent: recent ?? [],
    sessions: sessions ?? [],
  };
}
