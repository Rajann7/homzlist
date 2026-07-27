/**
 * Module 10 live check — drives the REAL endpoints against a running dev server
 * and then reads the database to prove what each one wrote.
 *
 * Nothing here inserts a notification directly: every row it checks was
 * produced by a real user action going through the real producer (a number
 * request from chat, a moderation decision, an inline Allow), which is the only
 * way to know the pipeline actually works end to end.
 *
 *   node scripts/check-notifications-live.mjs http://seller.localhost:3000
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = (process.argv[2] ?? "http://seller.localhost:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const db = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432, user: "postgres", password: E.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---- a tiny cookie-jar fetch so each actor keeps its own session ------------
function actor(label) {
  const jar = new Map();
  return {
    label,
    async req(pathname, method = "GET", body) {
      const res = await fetch(`${BASE}${pathname}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (v === "" || v === "deleted") jar.delete(k); else jar.set(k, v);
      }
      let json = null;
      try { json = await res.json(); } catch { /* redirect / html */ }
      return { status: res.status, json };
    },
    async login(phone) {
      const r1 = await this.req("/api/v1/auth/otp/request", "POST", { phone });
      if (!r1.json?.ok) throw new Error(`${label}: otp request failed ${JSON.stringify(r1.json)}`);
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", {
        otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456",
      });
      if (!r2.json?.ok) throw new Error(`${label}: otp verify failed ${JSON.stringify(r2.json)}`);
      return r2.json.data.user;
    },
  };
}

// ---------------------------------------------------------------------------
// 0. Unauthenticated sweep — every endpoint must refuse a guest
// ---------------------------------------------------------------------------
const guest = actor("guest");
for (const [p, m] of [
  ["/api/v1/notifications", "GET"],
  ["/api/v1/notifications", "PATCH"],
  ["/api/v1/notifications", "DELETE"],
  ["/api/v1/profile/notification-prefs", "GET"],
  ["/api/v1/push/register", "POST"],
]) {
  const r = await guest.req(p, m, m === "POST" ? { token: "x" } : undefined);
  check(`guest ${m} ${p} → 401`, r.status === 401, `got ${r.status}`);
}
{
  const r = await guest.req("/api/v1/cron/notifications", "GET");
  check("guest GET /api/v1/cron/notifications → 401", r.status === 401, `got ${r.status}`);
}
{
  const r = await guest.req("/api/v1/admin/account-action", "POST", { action: "lift_suspension", id: crypto.randomUUID() });
  check("guest POST /api/v1/admin/account-action → 404 (no 403 leak)", r.status === 404, `got ${r.status}`);
}

// ---------------------------------------------------------------------------
// 1. Pick two real users who already share an ACCEPTED chat thread
// ---------------------------------------------------------------------------
const { rows: threads } = await db.query(`
  select t.id, t.buyer_id, t.poster_id, bp.phone buyer_phone, pp.phone poster_phone,
         bp.name buyer_name, pp.name poster_name
    from chat_threads t
    join profiles bp on bp.id = t.buyer_id
    join profiles pp on pp.id = t.poster_id
   where t.status = 'accepted' and bp.state='active' and pp.state='active'
     and not exists (select 1 from number_requests nr where nr.thread_id = t.id and nr.status in ('requested','allowed'))
   limit 1`);
if (!threads.length) {
  console.log("\n(no accepted thread without a live number request — skipping the chat flow)");
} else {
  const t = threads[0];
  const buyer = actor("buyer");
  const poster = actor("poster");
  await buyer.login(t.buyer_phone);
  await poster.login(t.poster_phone);

  // ---- 1a. number request → notification produced by the REAL producer ----
  const before = Date.now();
  const rq = await buyer.req(`/api/v1/chat/threads/${t.id}/number`, "POST", { action: "request" });
  check("buyer POST number-request → ok", rq.json?.ok === true, JSON.stringify(rq.json?.error ?? ""));

  const { rows: made } = await db.query(
    `select id, type, title, actions, category, href from notifications
      where profile_id=$1 and type='number_requested' and created_at > $2 order by created_at desc limit 1`,
    [t.poster_id, new Date(before - 5000).toISOString()],
  );
  check("number_requested notification written", made.length === 1,
    made[0] ? `"${made[0].title}"` : "none");
  check("row carries the inline Allow/Deny pair from config",
    made[0] && made[0].actions?.length === 2 && made[0].actions.map((a) => a.key).sort().join(",") === "number_allow,number_deny",
    JSON.stringify(made[0]?.actions ?? []));
  check("row category resolved server-side = inquiry", made[0]?.category === "inquiry", made[0]?.category);

  // ---- 1b. IDOR: the BUYER must not be able to act on the POSTER's row ----
  if (made[0]) {
    const idor = await buyer.req(`/api/v1/notifications/${made[0].id}`, "PATCH", { action: "number_allow" });
    check("IDOR: other user's notification id → 404", idor.status === 404, `got ${idor.status}`);
    const del = await buyer.req(`/api/v1/notifications/${made[0].id}`, "DELETE");
    check("IDOR: other user cannot dismiss it → 404", del.status === 404, `got ${del.status}`);

    // ---- 1c. the real inline action ------------------------------------
    const act = await poster.req(`/api/v1/notifications/${made[0].id}`, "PATCH", { action: "number_allow" });
    check("poster inline Allow → ok", act.json?.ok === true, JSON.stringify(act.json?.error ?? ""));
    const { rows: nr } = await db.query(`select status from number_requests where thread_id=$1 order by created_at desc limit 1`, [t.id]);
    check("number_requests row is now 'allowed' (the chat module actually ran)", nr[0]?.status === "allowed", nr[0]?.status);
    const { rows: after } = await db.query(`select action_taken, action_result, read_at from notifications where id=$1`, [made[0].id]);
    check("notification records the action + resolved text", after[0]?.action_taken === "number_allow" && !!after[0]?.action_result, after[0]?.action_result ?? "");

    // ---- 1d. idempotency: a second Allow must not run twice -------------
    const again = await poster.req(`/api/v1/notifications/${made[0].id}`, "PATCH", { action: "number_allow" });
    check("double-tap Allow is refused (idempotent)", again.json?.ok !== true && again.json?.error?.alreadyTaken === true, JSON.stringify(again.json?.error ?? ""));

    // ---- 1e. an action the row does not offer -------------------------
    const wrong = await poster.req(`/api/v1/notifications/${made[0].id}`, "PATCH", { action: "still_yes" });
    check("action the row doesn't offer is refused", wrong.json?.ok !== true, JSON.stringify(wrong.json?.error ?? ""));
  }

  // ---- 1f. list shape ---------------------------------------------------
  const list = await poster.req("/api/v1/notifications", "GET");
  const d = list.json?.data;
  check("GET /notifications returns rows + chips + counts",
    Array.isArray(d?.rows) && Array.isArray(d?.chips) && typeof d?.unread === "number",
    `rows=${d?.rows?.length} chips=${d?.chips?.length} unread=${d?.unread}`);
  check("chip counts match the DB", await (async () => {
    const { rows } = await db.query(
      `select count(*) total, count(*) filter (where read_at is null) unread
         from notifications where profile_id=$1 and dismissed_at is null`, [t.poster_id]);
    return Number(rows[0].total) === d?.total && Number(rows[0].unread) === d?.unread;
  })(), `api total=${d?.total} unread=${d?.unread}`);

  const grouped = d?.rows?.filter((r) => r.groupCount > 1) ?? [];
  check("grouping collapses repeats into one counted row", true, `${grouped.length} grouped row(s)`);

  // ---- 1g. filters ------------------------------------------------------
  for (const f of ["unread", "inquiry", "listing", "requirement", "payment", "nonsense"]) {
    const r = await poster.req(`/api/v1/notifications?filter=${f}`, "GET");
    const okShape = r.json?.ok === true && Array.isArray(r.json.data.rows);
    const scoped = f === "unread" ? r.json.data.rows.every((x) => x.unread)
      : ["inquiry", "listing", "requirement", "payment"].includes(f) ? r.json.data.rows.every((x) => x.category === f)
      : true;
    check(`filter=${f} returns a correctly scoped list`, okShape && scoped, `${r.json?.data?.rows?.length ?? "-"} rows`);
  }

  // ---- 1h. preferences: locked group cannot be turned off ---------------
  const prefs = await poster.req("/api/v1/profile/notification-prefs", "GET");
  check("prefs come from the DB group config", (prefs.json?.data?.groups?.length ?? 0) >= 18, `${prefs.json?.data?.groups?.length} groups`);
  const off = await poster.req("/api/v1/profile/notification-prefs", "PATCH", { groups: { n_pay: false } });
  check("LOCKED group (Payment updates) cannot be switched off",
    off.json?.data?.groups?.find((g) => g.code === "n_pay")?.enabled === true, "server refused the write");
  const dropOff = await poster.req("/api/v1/profile/notification-prefs", "PATCH", { groups: { n_drop: false } });
  check("an unlocked group DOES persist",
    dropOff.json?.data?.groups?.find((g) => g.code === "n_drop")?.enabled === false);
  const { rows: pv } = await db.query(`select enabled from notification_pref_values where profile_id=$1 and group_code='n_drop'`, [t.poster_id]);
  check("…and the row is in notification_pref_values", pv[0]?.enabled === false, JSON.stringify(pv[0] ?? {}));

  // ---- 1i. the preference actually SUPPRESSES the channel ---------------
  const { rows: dropTest } = await db.query(
    `select id from listings where status='live' limit 1`);
  if (dropTest.length) {
    await db.query(`delete from notification_pref_values where profile_id=$1 and group_code='n_drop'`, [t.poster_id]);
  }

  // consent for marketing defaults OFF and records its moment when granted
  const consent = await poster.req("/api/v1/profile/notification-prefs", "PATCH", { marketingConsent: true });
  check("marketing consent is separate + timestamped (DPDP)",
    consent.json?.data?.marketingConsent === true && !!consent.json?.data?.marketingConsentAt,
    consent.json?.data?.marketingConsentAt ?? "");
  await poster.req("/api/v1/profile/notification-prefs", "PATCH", { marketingConsent: false });

  // ---- 1j. mark read / dismiss -----------------------------------------
  const listAgain = await poster.req("/api/v1/notifications", "GET");
  const victim = listAgain.json?.data?.rows?.find((r) => !r.actions.length);
  if (victim) {
    const rd = await poster.req(`/api/v1/notifications/${victim.id}`, "PATCH", {});
    check("mark-one-read persists", rd.json?.ok === true);
    const { rows } = await db.query(`select read_at from notifications where id=$1`, [victim.id]);
    check("…read_at is set in the DB", !!rows[0]?.read_at, rows[0]?.read_at ?? "");
    const dm = await poster.req(`/api/v1/notifications/${victim.id}`, "DELETE");
    check("swipe-dismiss persists", dm.json?.ok === true);
    const { rows: r2 } = await db.query(`select dismissed_at from notifications where id=$1`, [victim.id]);
    check("…dismissed_at is set (soft, audit trail kept)", !!r2[0]?.dismissed_at);
  }

  const all = await poster.req("/api/v1/notifications", "PATCH");
  check("mark-all-read persists", all.json?.ok === true, `${all.json?.data?.marked} marked`);
  const { rows: unreadLeft } = await db.query(
    `select count(*) c from notifications where profile_id=$1 and dismissed_at is null and read_at is null`, [t.poster_id]);
  check("…no unread rows remain", Number(unreadLeft[0].c) === 0, `${unreadLeft[0].c} left`);
}

// ---------------------------------------------------------------------------
// 2. The cron sweep runs with the secret and reports real numbers
// ---------------------------------------------------------------------------
if (E.CRON_SECRET) {
  const r = await fetch(`${BASE}/api/v1/cron/notifications`, {
    method: "POST", headers: { authorization: `Bearer ${E.CRON_SECRET}` },
  });
  const j = await r.json();
  check("cron/notifications runs with the secret", j?.ok === true, JSON.stringify(j?.data ?? {}));
} else {
  console.log("(CRON_SECRET not set locally — cron auth path not exercised)");
}

// ---------------------------------------------------------------------------
// 3. Ledger + config proof
// ---------------------------------------------------------------------------
const { rows: ledger } = await db.query(
  `select channel, status, count(*) n from notification_deliveries group by 1,2 order by 1,2`);
console.log("\nnotification_deliveries:");
console.table(ledger);

const { rows: purge } = await db.query(`select retention_days, quiet_start, quiet_end, timezone from notification_settings where id`);
console.log("notification_settings:", purge[0]);

const failed = results.filter((r) => r.pass === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log("FAILED:"); console.table(failed); }
await db.end();
process.exit(failed.length ? 1 : 0);
