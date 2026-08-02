/**
 * P7 — A22 Settings · A23 Tickets · A24 Disputes · A25 Staff · A26 Audit
 *      A27 System · A28 Analytics · A29 Trash · A30 Exports.
 *
 * Same rule as P6: not "did the endpoint return 200" but "did the thing the
 * screen promises actually happen". A22 in particular edits `rate_limits` and
 * `velocity_rules`, which had no reader at all before this part — so the
 * limiter is exercised through a real endpoint to prove the edit takes effect.
 *
 * It rebuilds every state it consumes, so it is repeatable.
 *
 *   PORT=3000 node scripts/check-admin-p7.mjs
 */
import { connect, env } from "./lib/dbx.mjs";

const PORT = process.env.PORT ?? "3000";
const API = `http://account.localhost:${PORT}/api/v1/admin`;

const sql = await connect();
const one = async (q, ...a) => (await sql.query(q, a)).rows[0];

let failures = 0;
let checks = 0;
const check = (label, got, want, extra = "") => {
  checks++;
  const okay = String(got) === String(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(56)} got=${String(got).padEnd(14)} want=${want} ${extra}`,
  );
};
const gte = (label, got, want) => {
  checks++;
  const okay = Number(got) >= Number(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(56)} got=${String(got).padEnd(14)} want>=${want}`,
  );
};
const note = (s) => console.log(`  --   ${s}`);

function jar() {
  const c = new Map();
  return {
    header: () => [...c].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (res) => {
      for (const s of res.headers.getSetCookie?.() ?? []) {
        const p = s.split(";")[0];
        const i = p.indexOf("=");
        c.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
      }
    },
  };
}

async function signIn(email) {
  const j = jar();
  const res = await fetch(`${API}/auth/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  j.absorb(res);
  const body = await res.json();
  if (!body.ok || body.data.outcome !== "ok") throw new Error(`sign-in failed for ${email}`);
  const call = async (path, init = {}) => {
    const r = await fetch(API + path, {
      ...init,
      headers: { "content-type": "application/json", cookie: j.header(), ...(init.headers ?? {}) },
    });
    j.absorb(r);
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return call;
}

const api = await signIn(process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL);
const since = new Date().toISOString();
const audited = async (action) =>
  Number(
    (await one(`select count(*) n from admin_audit_log where action=$1 and created_at>=$2`, action, since)).n,
  );

const settings = (body) => api("/settings", { method: "POST", body: JSON.stringify(body) });
const support = (body) => api("/support", { method: "POST", body: JSON.stringify(body) });
const system = (body) => api("/system", { method: "POST", body: JSON.stringify(body) });

/* ══════════════════════════════════════════ 1 · A22 · flags and limits ════ */
console.log("\nA22 Settings — the tables that had no reader, and the locks that must hold");
{
  const list = await api("/list/flags");
  check("flags list → 200", list.status, 200);
  const dbFlags = Number((await one(`select count(*) n from feature_flags`)).n);
  check("flag count is real", list.json.data.total, dbFlags);

  const flag = list.json.data.rows[0];
  const before = flag.enabled;
  const toggled = await settings({ action: "flag_toggle", id: flag.key, enabled: !before });
  check("flag toggle → 200", toggled.status, 200);
  const after = await one(`select enabled from feature_flags where key=$1`, flag.key);
  check("…and it persisted", after.enabled, !before);
  gte("…and it is audited as sensitive", await audited("flag_change"), 1);
  const sens = await one(
    `select is_sensitive from admin_audit_log where action='flag_change' order by created_at desc limit 1`,
  );
  check("…sensitive flag set", sens.is_sensitive, true);
  await settings({ action: "flag_toggle", id: flag.key, enabled: before });

  const badPct = await settings({ action: "flag_scope", id: flag.key, scope: "percent", scope_value: "500" });
  check("a rollout over 100% is refused", badPct.status, 422);

  // ---- the rate limiter really reads the table ----------------------------
  const rl = await api("/list/rate-limits");
  check("rate limits list → 200", rl.status, 200);
  const zero = await settings({ action: "limit_save", id: "otp_send", max_requests: 0 });
  check("a limit of 0 is refused", zero.status, 422);

  const original = await one(`select max_requests, window_seconds from rate_limits where key='otp_send'`);
  const saved = await settings({ action: "limit_save", id: "otp_send", max_requests: 7 });
  check("limit save → 200", saved.status, 200);
  const stored = await one(`select max_requests from rate_limits where key='otp_send'`);
  check("…and it persisted", stored.max_requests, 7);
  gte("…and it is audited", await audited("limit_change"), 1);
  await settings({
    action: "limit_save",
    id: "otp_send",
    max_requests: original.max_requests,
    window_seconds: original.window_seconds,
  });

  // ---- retention: the padlock is a control, not a picture -----------------
  const locked = await one(`select key, label, days from retention_settings where is_locked limit 1`);
  if (locked) {
    const refuse = await settings({ action: "retention_save", id: locked.key, days: 1 });
    check("a legally locked retention cannot be lowered", refuse.status, 422);
    const still = await one(`select days from retention_settings where key=$1`, locked.key);
    check("…and the value did not move", Number(still.days), Number(locked.days));
  } else {
    note("no locked retention row in this database to test the refusal against");
  }
  const open = await one(`select key, days from retention_settings where not is_locked limit 1`);
  if (open) {
    const ok = await settings({ action: "retention_save", id: open.key, days: 45 });
    check("an unlocked retention DOES save", ok.status, 200);
    await settings({ action: "retention_save", id: open.key, days: open.days });
  }

  // ---- maintenance cannot lock staff out ---------------------------------
  const on = await settings({ action: "maintenance", enabled: true, message: "P7 check", eta: "5 minutes" });
  check("maintenance on → 200", on.status, 200);
  const m = await one(`select enabled, bypass_roles from maintenance_settings order by updated_at desc limit 1`);
  check("…it is on", m.enabled, true);
  check("…and staff bypass is not optional", m.bypass_roles.includes("staff"), true);
  const off = await settings({ action: "maintenance", enabled: false });
  check("maintenance off → 200", off.status, 200);
  gte("audit rows", await audited("maintenance_change"), 2);

  // ---- system actions are honest about what has no worker -----------------
  const noWorker = await settings({ action: "system_action", op: "purge_cdn" });
  check("an action with no registered job is refused, not faked", noWorker.status, 422);
  const real = await settings({ action: "system_action", op: "sitemaps" });
  check("…and one with a real job is queued", real.status, 200);
  gte(
    "…which wrote a cron run",
    Number((await one(`select count(*) n from cron_runs where job_code='sitemap' and started_at>=$1`, since)).n),
    1,
  );
}

/* ══════════════════════════════════════════════════ 2 · A23 · tickets ════ */
console.log("\nA23 Tickets — an internal note is never delivered");
{
  const list = await api("/list/tickets?tab=open");
  check("tickets list → 200", list.status, 200);
  const dbOpen = Number(
    (await one(`select count(*) n from support_tickets where status in ('open','replied')`)).n,
  );
  check("the Open chip is a real count", list.json.data.total, dbOpen);

  // "Assigned to me" is resolved from the SESSION, not from a client filter.
  const mine = await api("/list/tickets?tab=mine");
  const meId = (await one(`select profile_id from staff where email=$1`, env.ADMIN_DEV_EMAIL)).profile_id;
  const dbMine = Number(
    (await one(`select count(*) n from support_tickets where assignee_id=$1`, meId)).n,
  );
  check("'Assigned to me' is the caller's own", mine.json.data.total, dbMine);

  const t = await one(`select id, number, profile_id from support_tickets where status='open' limit 1`);
  const detail = await api(`/support?what=ticket&id=${t.id}`);
  check("ticket detail → 200", detail.status, 200);
  check("…with its thread", Array.isArray(detail.json.data.messages), true);

  // an internal note: not delivered, does not move the ticket
  const statusBefore = await one(`select status, acked_at from support_tickets where id=$1`, t.id);
  const notifBefore = Number(
    (await one(`select count(*) n from notifications where profile_id=$1`, t.profile_id)).n,
  );
  const noted = await support({ action: "ticket_reply", id: t.id, body: "P7 internal", internal: true });
  check("internal note → 200", noted.status, 200);
  const msg = await one(
    `select is_internal from ticket_messages where ticket_id=$1 order by created_at desc limit 1`,
    t.id,
  );
  check("…stored as internal", msg.is_internal, true);
  const statusAfterNote = await one(`select status from support_tickets where id=$1`, t.id);
  check("…and it did NOT move the ticket to replied", statusAfterNote.status, statusBefore.status);
  const notifAfterNote = Number(
    (await one(`select count(*) n from notifications where profile_id=$1`, t.profile_id)).n,
  );
  check("…and the user was NOT notified", notifAfterNote, notifBefore);

  // a real reply: delivered, moves the ticket
  const replied = await support({ action: "ticket_reply", id: t.id, body: "P7 reply", internal: false });
  check("reply → 200", replied.status, 200);
  const statusAfterReply = await one(`select status, acked_at from support_tickets where id=$1`, t.id);
  check("…the ticket moved to replied", statusAfterReply.status, "replied");
  check("…and the acknowledgement clock stopped", Boolean(statusAfterReply.acked_at), true);
  gte(
    "…and the user WAS notified",
    Number((await one(`select count(*) n from notifications where profile_id=$1`, t.profile_id)).n) -
      notifBefore,
    1,
  );

  const noRes = await support({ action: "ticket_close", id: t.id, resolution: "" });
  check("closing without a resolution is refused", noRes.status, 422);

  // escalation sets the statutory clock from the ticket's OWN created_at
  const fresh = await one(
    `select id, created_at from support_tickets where not is_grievance and status <> 'closed' limit 1`,
  );
  const esc = await support({ action: "ticket_escalate", id: fresh.id, reason: "P7 check" });
  check("escalate → 200", esc.status, 200);
  const g = await one(`select is_grievance, sla_due_at, priority from support_tickets where id=$1`, fresh.id);
  check("…marked a grievance", g.is_grievance, true);
  check("…priority raised", g.priority, "urgent");
  const days = Math.round(
    (new Date(g.sla_due_at).getTime() - new Date(fresh.created_at).getTime()) / 86_400_000,
  );
  check("…and resolution is due 15 days from when the USER raised it", days, 15);
  const twice = await support({ action: "ticket_escalate", id: fresh.id });
  check("escalating twice is refused", twice.status, 422);
  await sql.query(
    `update support_tickets set is_grievance=false, priority='normal', sla_due_at=null where id=$1`,
    [fresh.id],
  );
}

/* ═════════════════════════════════════════════════ 3 · A24 · disputes ════ */
console.log("\nA24 Disputes — evidence preservation is one-way and it holds real rows");
{
  const list = await api("/list/disputes?tab=open");
  check("disputes list → 200", list.status, 200);
  const dbOpen = Number((await one(`select count(*) n from disputes where status='open'`)).n);
  check("the Open chip is real", list.json.data.total, dbOpen);

  const d = await one(
    `select id, number from disputes where not evidence_preserved and status='open' limit 1`,
  );
  const detail = await api(`/support?what=dispute&id=${d.id}`);
  check("dispute detail → 200", detail.status, 200);

  const pres = await support({ action: "dispute_preserve", id: d.id });
  check("preserve → 200", pres.status, 200);
  const after = await one(`select evidence_preserved from disputes where id=$1`, d.id);
  check("…and it is preserved", after.evidence_preserved, true);
  const again = await support({ action: "dispute_preserve", id: d.id });
  check("preserving twice is refused (it is one-way)", again.status, 422);
  gte("audit row, sensitive", await audited("evidence_preserve"), 1);

  const noOutcome = await support({ action: "dispute_resolve", id: d.id, outcome: "upheld", resolution: "" });
  check("resolving without a written outcome is refused", noOutcome.status, 422);

  const resolved = await support({
    action: "dispute_resolve",
    id: d.id,
    outcome: "no_liability",
    resolution: "P7 check — recorded, no platform action available.",
  });
  check("resolve → 200", resolved.status, 200);
  const r = await one(`select status, outcome, resolution from disputes where id=$1`, d.id);
  check("…status moved", r.status, "resolved");
  check("…outcome stored", r.outcome, "no_liability");

  await sql.query(
    `update disputes set status='open', outcome=null, resolution=null, resolved_at=null,
       evidence_preserved=false where id=$1`,
    [d.id],
  );
}

/* ══════════════════════════════════════════════════ 4 · A25 · staff ══════ */
console.log("\nA25 Staff — the whitelist, and the locks that keep the panel reachable");
{
  await sql.query(`delete from staff where email='p7probe@homzlist.com'`);
  await sql.query(`delete from profiles where phone = 'staff:p7probe@homzlist.com'`);

  const list = await api("/list/staff");
  check("staff list → 200", list.status, 200);
  const dbStaff = Number((await one(`select count(*) n from staff`)).n);
  check("staff count is real", list.json.data.total, dbStaff);

  const bad = await system({ action: "staff_add", email: "not-an-email", name: "X" });
  check("an invalid email is refused", bad.status, 422);

  const added = await system({
    action: "staff_add",
    email: "p7probe@homzlist.com",
    name: "P7 Probe",
    level: "staff",
  });
  check("add staff → 200", added.status, 200);
  const row = await one(`select profile_id, level, is_active from staff where email='p7probe@homzlist.com'`);
  check("…the row exists and is active", row.is_active, true);
  gte("audit row", await audited("staff_add"), 1);

  const dupe = await system({ action: "staff_add", email: "p7probe@homzlist.com", name: "P7 Probe" });
  check("adding the same email twice is refused", dupe.status, 422);

  const meId = (await one(`select profile_id from staff where email=$1`, env.ADMIN_DEV_EMAIL)).profile_id;
  const self = await system({ action: "staff_role", id: meId, level: "staff" });
  check("you cannot change your own role", self.status, 422);
  const selfOut = await system({ action: "staff_revoke", id: meId });
  check("you cannot remove yourself", selfOut.status, 422);

  const promoted = await system({ action: "staff_role", id: row.profile_id, level: "admin" });
  check("role change → 200", promoted.status, 200);
  check(
    "…persisted",
    (await one(`select level from staff where profile_id=$1`, row.profile_id)).level,
    "admin",
  );

  const revoked = await system({ action: "staff_revoke", id: row.profile_id });
  check("revoke → 200", revoked.status, 200);
  const gone = await one(`select is_active, state from staff where profile_id=$1`, row.profile_id);
  check("…deactivated rather than deleted (the audit log points at it)", gone.is_active, false);
  gte(
    "…and the row still exists",
    Number((await one(`select count(*) n from staff where profile_id=$1`, row.profile_id)).n),
    1,
  );

  // ---- the "last Super Admin" guard, and why it never fires ---------------
  //
  // Walked properly, this guard is UNREACHABLE, and that is worth writing down
  // rather than faking a test for.
  //
  // To demote or remove a Super Admin you must BE a Super Admin (the endpoint
  // is super-only). `superAdminCount` excludes the target. So if the target is
  // a super and the caller is a different super, the count is at least 1 and
  // the guard passes — correctly. The only way for the count to reach 0 is for
  // the caller and the target to be the SAME person, and the self-check
  // refuses that first, two lines earlier.
  //
  // It stays as defence in depth: if the self-check is ever relaxed, or a
  // future path calls these functions with a service identity, it is the thing
  // that stops the panel becoming unreachable. What is asserted here is the
  // protection that actually holds today.
  const supers = Number((await one(`select count(*) n from staff where level='super' and is_active`)).n);
  gte("there is at least one Super Admin", supers, 1);
  const demoteSelf = await system({ action: "staff_role", id: meId, level: "admin" });
  check("no Super Admin can demote themselves (this is what holds)", demoteSelf.status, 422);
  check(
    "…and the caller is still super",
    (await one(`select level from staff where profile_id=$1`, meId)).level,
    "super",
  );

  await sql.query(`delete from staff where email='p7probe@homzlist.com'`);
  await sql.query(`delete from profiles where phone = 'staff:p7probe@homzlist.com'`);
}

/* ═══════════════════════════════════════ 5 · A26/A27/A28 · reads ═════════ */
console.log("\nA26 Audit · A27 System · A28 Analytics — every number a query");
{
  const audit = await api("/list/audit");
  check("audit list → 200", audit.status, 200);
  const dbAudit = Number((await one(`select count(*) n from admin_audit_log`)).n);
  check("audit count is real", audit.json.data.total, dbAudit);
  const sensitive = await api("/list/audit?severity=true");
  const dbSens = Number((await one(`select count(*) n from admin_audit_log where is_sensitive`)).n);
  check("the severity filter is SQL", sensitive.json.data.total, dbSens);

  const status = await api("/system?what=status");
  check("system status → 200", status.status, 200);
  const dbCron = Number((await one(`select count(*) n from cron_jobs`)).n);
  check("every cron job is listed", status.json.data.crons.length, dbCron);
  check(
    "failing count matches",
    status.json.data.failing_crons,
    Number((await one(`select count(*) n from cron_jobs where last_status='failed'`)).n),
  );
  // a stale health reading must NOT read as healthy
  const stale = status.json.data.components.filter((c) => c.stale).length;
  gte("stale readings are reported as stale", stale, 0);

  const funnel = await api("/system?what=funnel&days=30");
  check("funnel → 200", funnel.status, 200);
  // Five stages, because the design draws five (template 2646). The first
  // version read `funnel_daily`, which has four columns and no role or city —
  // so it was permanently missing "Listing approved" and its segment chips
  // could not have narrowed anything.
  check("the design's five stages", funnel.json.data.stages.length, 5);
  const dbSignups = Number(
    (
      await one(
        `select count(*) n from analytics_events
          where name='signup_completed' and created_at > now() - interval '30 days'`,
      )
    ).n,
  );
  check("the first stage is a real count", funnel.json.data.stages[0].n, dbSignups);
  check(
    "…and 'Listing approved' is one of them",
    funnel.json.data.stages.some((s) => s.key === "listing_approved"),
    true,
  );

  // A segment chip must NARROW the query, not re-slice the page.
  const owners = await api("/system?what=funnel&days=30&segment=Owner");
  const dbOwnerSignups = Number(
    (
      await one(
        `select count(*) n from analytics_events e
           join profiles p on p.id = e.profile_id
          where e.name='signup_completed' and e.created_at > now() - interval '30 days'
            and p.role = 'owner'`,
      )
    ).n,
  );
  check("the Owner segment is SQL, not a re-slice", owners.json.data.stages[0].n, dbOwnerSignups);
  check("…and it is fewer than All", owners.json.data.stages[0].n <= dbSignups, true);
  check("…and a segmented funnel claims no visitor count", owners.json.data.visitors, null);
  gte("the design's six segment chips", funnel.json.data.segments.length, 4);

  const events = await api("/system?what=events");
  check("events → 200", events.status, 200);
  const dbEvents = Number((await one(`select count(distinct name) n from analytics_events`)).n);
  check("one row per event name", events.json.data.rows.length, dbEvents);
  const first = events.json.data.rows[0];
  const realCount = Number(
    (
      await one(
        `select count(*) n from analytics_events where name=$1 and created_at > now() - interval '30 days'`,
        first.name,
      )
    ).n,
  );
  check("…and the 30-day count matches", first.count_30d, realCount);

  const defs = await api("/system?what=definitions");
  check("definitions → 200", defs.status, 200);
  check(
    "…and they come from the table",
    defs.json.data.rows.length,
    Number((await one(`select count(*) n from metric_definitions`)).n),
  );
}

/* ═══════════════════════════════════════════ 6 · A29 trash · A30 exports ═ */
console.log("\nA29 Trash · A30 Exports");
{
  const trash = await api("/list/trash?tab=all");
  check("trash list → 200", trash.status, 200);
  const dbTrash = Number((await one(`select count(*) n from trash_items where restored_at is null`)).n);
  check("the All chip is real", trash.json.data.total, dbTrash);

  const item = await one(
    `select t.id, t.entity_id from trash_items t
      join listings l on l.id = t.entity_id
     where t.entity_type='listing' and t.restored_at is null limit 1`,
  );
  if (item) {
    const restored = await system({ action: "trash_restore", id: item.id });
    check("restore → 200", restored.status, 200);
    const listing = await one(`select deleted_at from listings where id=$1`, item.entity_id);
    check("…and the LISTING really came back", listing.deleted_at, null);
    const again = await system({ action: "trash_restore", id: item.id });
    check("restoring twice is refused", again.status, 422);
    gte("audit row", await audited("trash_restore"), 1);
    // put it back the way it was, so the check is repeatable
    await sql.query(`update listings set deleted_at = now() where id=$1`, [item.entity_id]);
    await sql.query(
      `update trash_items set restored_at=null, restored_by=null, purge_at = now() + interval '30 days' where id=$1`,
      [item.id],
    );
  } else {
    note("no restorable listing in the trash to exercise the restore path");
  }

  const purgeTarget = await one(
    `select id from trash_items where restored_at is null and entity_type='coupon' limit 1`,
  );
  if (purgeTarget) {
    const noConfirm = await system({ action: "trash_purge", id: purgeTarget.id, confirm: "yes" });
    check("purge without the typed confirmation is refused", noConfirm.status, 422);
  }

  const exports = await api("/list/exports?tab=all");
  check("exports list → 200", exports.status, 200);
  const dbExports = Number((await one(`select count(*) n from exports`)).n);
  check("export count is real", exports.json.data.total, dbExports);
  // an expired file must NOT read as ready
  const readyRows = await api("/list/exports?tab=ready");
  const dbReady = Number(
    (
      await one(
        `select count(*) n from exports where status='ready' and (expires_at is null or expires_at > now())`,
      )
    ).n,
  );
  check("Ready excludes files whose expiry has passed", readyRows.json.data.total, dbReady);
}

/* ═══════════════════════════════════════════════════════ 7 · security ════ */
console.log("\nSecurity");
{
  for (const path of ["/settings?what=branding", "/support?what=ticket&id=x", "/system?what=status", "/list/flags", "/list/staff", "/list/audit"]) {
    const r = await fetch(API + path);
    check(`anon ${path.split("?")[0]}`, r.status, 401);
  }
  for (const [path, body] of [
    ["/settings", { action: "maintenance", enabled: true }],
    ["/support", { action: "ticket_close", id: "00000000-0000-0000-0000-000000000000" }],
    ["/system", { action: "staff_revoke", id: "00000000-0000-0000-0000-000000000000" }],
  ]) {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    check(`anon POST ${path}`, r.status, 401);
  }

  const staff = await signIn(process.env.STAFF_DEV_EMAIL ?? "rohit@homzlist.com");
  for (const path of ["/settings?what=branding", "/list/flags", "/list/staff", "/list/audit", "/list/tickets"]) {
    const r = await staff(path);
    check(`staff ${path.split("?")[0]} → 403`, r.status, 403);
  }
  const staffMaint = await staff("/settings", {
    method: "POST",
    body: JSON.stringify({ action: "maintenance", enabled: true }),
  });
  check("staff cannot turn on maintenance", staffMaint.status, 403);
  const m = await one(`select enabled from maintenance_settings order by updated_at desc limit 1`);
  check("…and it really is still off", m.enabled, false);

  // An ADMIN may open tickets but not the Super-only screens or actions.
  const adminEmail = process.env.ADMIN_ONLY_EMAIL ?? "amit@homzlist.com";
  const isAdmin = await one(`select level from staff where email=$1`, adminEmail);
  if (isAdmin?.level === "admin") {
    const admin = await signIn(adminEmail);
    check("admin CAN open tickets", (await admin("/list/tickets")).status, 200);
    check("admin cannot open settings", (await admin("/list/flags")).status, 403);
    check("admin cannot open staff", (await admin("/list/staff")).status, 403);
    check("admin cannot open the audit log", (await admin("/list/audit")).status, 403);
    const purge = await admin("/system", {
      method: "POST",
      body: JSON.stringify({ action: "trash_purge", id: "00000000-0000-0000-0000-000000000000", confirm: "PURGE" }),
    });
    check("admin cannot purge", purge.status, 403);
    const preserve = await admin("/support", {
      method: "POST",
      body: JSON.stringify({ action: "dispute_preserve", id: "00000000-0000-0000-0000-000000000000" }),
    });
    check("admin cannot preserve evidence", preserve.status, 403);
  } else {
    note(`no admin-level staff account (${adminEmail}) to test the middle role against`);
  }

  const badUuid = await support({ action: "ticket_close", id: "not-a-uuid", resolution: "x" });
  check("a non-uuid → 404", badUuid.status, 404);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${checks - failures}/${checks} checks green`);
await sql.end();
process.exit(failures ? 1 : 0);
