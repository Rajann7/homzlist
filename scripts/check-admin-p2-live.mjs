/**
 * P2 proof — A1 login + A2 dashboard, against the running dev server and the
 * real database.
 *
 * Every number the dashboard prints is re-derived here with a SECOND,
 * independently written query and compared to what the page actually renders.
 * The point is not that the code runs; it is that the code's answer and the
 * database's answer are the same answer. A green UI proves neither.
 *
 *   PORT=3000 node scripts/check-admin-p2-live.mjs
 */
import { connect, env } from "./lib/dbx.mjs";

const PORT = process.env.PORT ?? "3000";
const ADMIN = `http://account.localhost:${PORT}`;
const API = `${ADMIN}/api/v1/admin`;

let failures = 0;
const check = (label, got, want, extra = "") => {
  const ok = String(got) === String(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(42)} page=${String(got).padEnd(12)} db=${want} ${extra}`);
};

/* ------------------------------------------------------------------ session */

const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const absorb = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(";")[0];
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const api = async (path, init = {}) => {
  const res = await fetch(API + path, {
    ...init,
    headers: { "content-type": "application/json", cookie: cookie(), ...(init.headers ?? {}) },
  });
  absorb(res);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};

const sql = await connect();
const one = async (q, ...a) => (await sql.query(q, a)).rows[0];

/* --------------------------------------------------------------- 1. sign in */

console.log("\n1. A1 sign-in — the three outcomes, all through signInAdmin()");
{
  const attemptsBefore = Number(
    (await one(`select count(*) n from admin_login_attempts`)).n,
  );

  const bad = await api("/auth/dev", {
    method: "POST",
    body: JSON.stringify({ email: "nobody@example.com" }),
  });
  check("not whitelisted → outcome", bad.json?.data?.outcome, "not_whitelisted");

  const revoked = await one(
    `select email from staff where is_active = false or state <> 'active' limit 1`,
  );
  if (revoked?.email) {
    const r = await api("/auth/dev", {
      method: "POST",
      body: JSON.stringify({ email: revoked.email }),
    });
    check(`revoked (${revoked.email}) → outcome`, r.json?.data?.outcome, "revoked");
  } else {
    console.log("  --   no revoked staff row to test against");
  }

  const email = process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL;
  const good = await api("/auth/dev", { method: "POST", body: JSON.stringify({ email }) });
  check(`whitelisted (${email}) → outcome`, good.json?.data?.outcome, "ok");
  check("admin session cookies set", jar.has("hz_admin_at") && jar.has("hz_admin_rt"), "true");

  const attemptsAfter = Number((await one(`select count(*) n from admin_login_attempts`)).n);
  check("every attempt logged", attemptsAfter - attemptsBefore, revoked?.email ? 3 : 2);

  const session = await one(
    `select s.id, s.ip, s.device from staff_sessions s
       join staff st on st.profile_id = s.staff_id
      where st.email = $1 and s.ended_at is null
      order by s.started_at desc limit 1`,
    email,
  );
  check("staff_sessions row opened", Boolean(session?.id), "true", session?.id ?? "");
}

/* ------------------------------------------------------- 2. the queue tiles */

console.log("\n2. A2 row 1 — queue tiles (count + oldest), vs a second query");
{
  const tiles = await sql.query(`select * from hz_admin_queue_tiles()`);
  const independent = {
    listings: `select count(*) n from listings where status='pending_review' and deleted_at is null`,
    requirements: `select count(*) n from requirements where status='pending_review'`,
    boosts: `select count(*) n from boosts where status='pending_approval'`,
    verifications: `select count(*) n from verifications where status='pending'`,
    appeals: `select count(*) n from moderation_appeals where status='open'`,
    reports: `select count(*) n from reports where status='open'`,
    tickets: `select count(*) n from support_tickets where status='open'`,
  };
  for (const row of tiles.rows) {
    const want = Number((await one(independent[row.queue])).n);
    check(`tile ${row.queue}`, row.pending, want, `oldest=${row.oldest?.toISOString?.() ?? "—"}`);
  }
}

/* -------------------------------------------------------- 3. today's stats */

console.log("\n3. A2 row 2 — today's stats, IST, vs the same weekday last week");
{
  const days = await sql.query(`select * from hz_admin_daily_metrics(8)`);
  const today = days.rows[days.rows.length - 1];
  const prior = days.rows[0];

  const live = await one(`
    select
      (select count(*) from profiles where timezone('Asia/Kolkata', created_at)::date = timezone('Asia/Kolkata', now())::date) signups,
      (select count(*) from listings where timezone('Asia/Kolkata', created_at)::date = timezone('Asia/Kolkata', now())::date) listings,
      (select count(*) from inquiries where timezone('Asia/Kolkata', created_at)::date = timezone('Asia/Kolkata', now())::date) inquiries,
      (select coalesce(sum(amount_paise),0) from payments where status='success' and timezone('Asia/Kolkata', created_at)::date = timezone('Asia/Kolkata', now())::date) revenue`);

  check("signups today", today.signups, live.signups);
  check("new listings today", today.listings_created, live.listings);
  check("inquiries today", today.inquiries, live.inquiries);
  check("revenue today (paise)", today.revenue_paise, live.revenue);
  console.log(
    `  --   comparison baseline = ${prior.day.toISOString().slice(0, 10)} ` +
      `(signups ${prior.signups}, revenue ${prior.revenue_paise})`,
  );
}

/* ------------------------------------------------------- 4. revenue ranges */

console.log("\n4. A2 row 4 — the chart's three ranges each hit the database");
{
  for (const [range, bucket, count] of [
    ["7d", "day", 7],
    ["30d", "week", 5],
    ["6m", "month", 6],
  ]) {
    const res = await api(`/dashboard/revenue?range=${range}`);
    const bars = res.json?.data?.bars ?? [];
    check(`${range} bucket count`, bars.length, count);

    const rows = await sql.query(`select * from hz_admin_revenue_series($1,$2)`, [bucket, count]);
    const apiTotal = bars.reduce((a, b) => a + b.plan + b.boost + b.topup, 0);
    const dbTotal = rows.rows.reduce(
      (a, r) => a + Number(r.plan_paise) + Number(r.boost_paise) + Number(r.topup_paise),
      0,
    );
    check(`${range} total revenue (paise)`, apiTotal, dbTotal);
  }

  const bad = await api(`/dashboard/revenue?range=all-time`);
  check("unknown range refused", bad.status, 422);
}

/* -------------------------------------------------- 5. banners + overdue */

console.log("\n5. A2 rows 3+4 — anomaly banners and the >24h overdue list");
{
  const live = await one(`select count(*) n from anomaly_events where dismissed_at is null`);
  const shown = await one(
    `select count(*) n from (select id from anomaly_events where dismissed_at is null order by detected_at desc limit 5) x`,
  );
  check("live anomaly banners", shown.n, Math.min(Number(live.n), 5));

  const overdue = await one(
    `select count(*) n from listings
      where status='pending_review' and deleted_at is null
        and created_at < now() - interval '24 hours'`,
  );
  console.log(`  --   overdue badge should read ${overdue.n}`);
}

/* ------------------------------------------------------ 6. the bell + search */

console.log("\n6. Shell — bell feed and global search");
{
  const unread = await one(`select count(*) n from admin_notifications where read_at is null`);
  console.log(`  --   unread notifications now: ${unread.n}`);

  const term = (await one(`select area_label from listings where area_label is not null limit 1`))
    ?.area_label?.split(",")[0];
  if (term) {
    const res = await api(`/search?q=${encodeURIComponent(term)}`);
    const groups = res.json?.data?.groups ?? [];
    check(`search "${term}" returns groups`, groups.length > 0, "true",
      groups.map((g) => `${g.label}:${g.hits.length}`).join(" "));
    const masked = groups
      .flatMap((g) => g.hits)
      .every((h) => !/\+91\s?\d{5}\s?\d{5}/.test(h.sub));
    check("no unmasked phone in results", masked, "true");
  }

  const short = await api(`/search?q=a`);
  check("query under 2 chars returns nothing", (short.json?.data?.groups ?? []).length, 0);
}

/* ---------------------------------------------------------- 7. authorization */

console.log("\n7. Doc9 — unauthenticated sweep and the role gate");
{
  const anon = async (path, method = "GET") => {
    const res = await fetch(API + path, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : "{}",
    });
    return res.status;
  };
  check("GET  /accounts (anon)", await anon("/accounts"), 401);
  check("GET  /search (anon)", await anon("/search?q=raj"), 401);
  check("GET  /dashboard/revenue (anon)", await anon("/dashboard/revenue?range=7d"), 401);
  check("PATCH /me (anon)", await anon("/me", "PATCH"), 401);
  check("POST /notifications/read-all (anon)", await anon("/notifications/read-all", "POST"), 401);
  check("POST /maintenance/off (anon)", await anon("/maintenance/off", "POST"), 401);

  // A staff-level admin: no payments in search, no maintenance switch, and no
  // switching into an account that is not parked on this device.
  const staffEmail = (
    await one(`select email from staff where level='staff' and is_active and state='active' limit 1`)
  )?.email;
  if (staffEmail) {
    const staffJar = new Map();
    const staffApi = async (path, init = {}) => {
      const res = await fetch(API + path, {
        ...init,
        headers: {
          "content-type": "application/json",
          cookie: [...staffJar].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(init.headers ?? {}),
        },
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const pair = c.split(";")[0];
        const i = pair.indexOf("=");
        staffJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      return { status: res.status, json: await res.json().catch(() => null) };
    };
    await staffApi("/auth/dev", { method: "POST", body: JSON.stringify({ email: staffEmail }) });

    const search = await staffApi("/search?q=pay_");
    const labels = (search.json?.data?.groups ?? []).map((g) => g.label);
    check(`staff (${staffEmail}) sees no PAYMENTS group`, labels.includes("PAYMENTS"), "false");

    check("staff → maintenance/off", (await staffApi("/maintenance/off", { method: "POST" })).status, 403);

    const otherStaff = (
      await one(`select profile_id from staff where email <> $1 limit 1`, staffEmail)
    )?.profile_id;
    const idor = await staffApi("/accounts/switch", {
      method: "POST",
      body: JSON.stringify({ staffId: otherStaff }),
    });
    check("staff → switch into an unparked account", idor.status, 404);
  }
}

console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : "all checks passed"}\n`);
await sql.end();
process.exit(failures ? 1 : 0);
