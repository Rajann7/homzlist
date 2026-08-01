/**
 * P5a — A13 Plans · A14 Coupons · A15 Grants & trials.
 *
 * Same rule as the P3 and P4 checks: a 200 is not the check, the row is.
 *
 * It also SEEDS the states that have never existed. The design draws four
 * coupon chips and two of them (Scheduled, Exhausted) had no row in the
 * database, so nobody had ever looked at them — CLAUDE.md: "a status with 0
 * rows has never run; seed every state and look at it".
 *
 *   PORT=3000 node scripts/check-admin-p5a.mjs
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
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(50)} got=${String(got).padEnd(18)} want=${want} ${extra}`,
  );
};
const gte = (label, got, want) => {
  checks++;
  const okay = Number(got) >= Number(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(50)} got=${String(got).padEnd(18)} want>=${want}`,
  );
};

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
  return async (path, init = {}) => {
    const r = await fetch(API + path, {
      ...init,
      headers: { "content-type": "application/json", cookie: j.header(), ...(init.headers ?? {}) },
    });
    j.absorb(r);
    return { status: r.status, json: await r.json().catch(() => null) };
  };
}

const superEmail = process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL;
const api = await signIn(superEmail);
const since = new Date().toISOString();
const audited = async (action) =>
  Number(
    (await one(`select count(*) n from admin_audit_log where action=$1 and created_at>=$2`, action, since)).n,
  );

/* ═══════════════════════════════════════ 0 · seed the unseen coupon states ═ */
console.log("\nSeeding the two coupon states that had no rows");
{
  await sql.query(
    `insert into coupons (code, discount_type, discount_value, applies_to, per_user_limit,
                          usage_cap, used_count, starts_at, expires_at, is_active, label)
     values ('P5SCHED','percent',10,'plans',1,300,0,
             now() + interval '7 days', now() + interval '37 days', true, 'P5 fixture — scheduled')
     on conflict (upper(code)) do nothing`,
  );
  await sql.query(
    `insert into coupons (code, discount_type, discount_value, applies_to, per_user_limit,
                          usage_cap, used_count, starts_at, expires_at, is_active, label)
     values ('P5FULL','flat',5000,'both',1,50,50,
             now() - interval '10 days', now() + interval '20 days', true, 'P5 fixture — exhausted')
     on conflict (upper(code)) do nothing`,
  );
  for (const [code, want] of [
    ["P5SCHED", "scheduled"],
    ["P5FULL", "exhausted"],
  ]) {
    check(
      `${code} derives as ${want}`,
      (await one(`select status_key from admin_coupon_list where code=$1`, code)).status_key,
      want,
    );
  }
}

/* ══════════════════════════════════════════════════════ 1 · A13 · plans ════ */
console.log("\nA13 — plans: the card's numbers are real, and editing grandfathers");
{
  const { status, json } = await api("/plans");
  check("plan list → 200", status, 200);
  const rows = json.data.rows;
  const dbRow = await one(`select * from admin_plan_catalog where code='p999'`);
  const p999 = rows.find((r) => r.code === "p999");
  check("p999 purchases match the database", p999.purchases, dbRow.purchases);
  check("p999 revenue matches", p999.revenue_paise, dbRow.revenue_paise);
  const expected = Number(
    (await one(`select count(*) n from orders where catalog_code='p999' and status='paid'`)).n,
  );
  check("…and the database matches the ORDERS", dbRow.purchases, expected);

  // "Most popular" is the top seller of its own KIND
  const topPlan = rows.filter((r) => r.kind === "plan" && r.is_top_seller);
  check("exactly one plan carries Most popular", topPlan.length, 1);
  check("…and it is the one with most purchases", topPlan[0].code, "p999");

  // Editing the catalog must not touch anyone's bought plan.
  const holdersBefore = Number(
    (await one(`select count(*) n from user_plans where catalog_code='p999' and status='active'`)).n,
  );
  const termsBefore = await one(
    `select listing_quota, proposal_quota from user_plans
      where catalog_code='p999' and status='active' order by purchased_at limit 1`,
  );
  const oldPrice = Number((await one(`select price_paise from plan_catalog where code='p999'`)).price_paise);

  const save = await api("/plans", {
    method: "POST",
    body: JSON.stringify({
      action: "save",
      code: "p999",
      changes: { price_paise: oldPrice + 30000, proposal_quota: 12 },
      reason: "P5a check",
    }),
  });
  check("save plan → 200", save.status, 200);
  check(
    "plan_catalog.price_paise changed",
    Number((await one(`select price_paise from plan_catalog where code='p999'`)).price_paise),
    oldPrice + 30000,
  );
  const termsAfter = await one(
    `select listing_quota, proposal_quota from user_plans
      where catalog_code='p999' and status='active' order by purchased_at limit 1`,
  );
  check(
    "an EXISTING holder's terms are untouched (grandfathering)",
    `${termsAfter.listing_quota}/${termsAfter.proposal_quota}`,
    `${termsBefore.listing_quota}/${termsBefore.proposal_quota}`,
  );
  check(
    "the summary names how many were grandfathered",
    save.json.data.summary.includes(String(holdersBefore)),
    true,
  );
  gte("audit row (sensitive)", await audited("plan_edit"), 1);
  const sens = await one(
    `select is_sensitive from admin_audit_log where action='plan_edit' order by created_at desc limit 1`,
  );
  check("…marked sensitive", sens.is_sensitive, true);
  // put it back
  await api("/plans", {
    method: "POST",
    body: JSON.stringify({
      action: "save",
      code: "p999",
      changes: { price_paise: oldPrice, proposal_quota: termsBefore.proposal_quota },
      reason: "P5a restore",
    }),
  });

  // a plan with purchases cannot be deleted
  const del = await api("/plans", { method: "POST", body: JSON.stringify({ action: "delete", code: "p999" }) });
  check("deleting a plan with purchases is refused", del.status, 422);
  check(
    "…with the design's own wording",
    del.json.error.message.includes("hide instead"),
    true,
  );

  // create → it arrives HIDDEN
  await sql.query(`delete from plan_catalog where code='p5check'`);
  const created = await api("/plans", {
    method: "POST",
    body: JSON.stringify({
      action: "create",
      code: "p5check",
      name: "P5 check plan",
      price_paise: 149900,
      listing_quota: 2,
      proposal_quota: 20,
    }),
  });
  check("create plan → 200", created.status, 200);
  check(
    "a new plan is created HIDDEN",
    (await one(`select is_active from plan_catalog where code='p5check'`)).is_active,
    false,
  );
  const dupe = await api("/plans", {
    method: "POST",
    body: JSON.stringify({ action: "create", code: "p5check", name: "again", price_paise: 1 }),
  });
  check("a duplicate code is refused", dupe.status, 422);

  const duplicated = await api("/plans", {
    method: "POST",
    body: JSON.stringify({ action: "duplicate", code: "p5check" }),
  });
  check("duplicate → 200", duplicated.status, 200);
  check(
    "the copy is hidden too",
    (await one(`select is_active from plan_catalog where code='p5check_copy'`)).is_active,
    false,
  );
  const gone = await api("/plans", { method: "POST", body: JSON.stringify({ action: "delete", code: "p5check_copy" }) });
  check("an unsold plan CAN be deleted", gone.status, 200);
  await api("/plans", { method: "POST", body: JSON.stringify({ action: "delete", code: "p5check" }) });

  // an ADMIN may read the screen but not price it
  const adminEmail = (
    await one(`select email from staff where level='admin' and is_active and state='active' limit 1`)
  )?.email;
  if (adminEmail) {
    const adminApi = await signIn(adminEmail);
    check("admin → plan list 200", (await adminApi("/plans")).status, 200);
    check(
      "admin → plan save 403 (super only)",
      (
        await adminApi("/plans", {
          method: "POST",
          body: JSON.stringify({ action: "save", code: "p999", changes: { price_paise: 1 } }),
        })
      ).status,
      403,
    );
  }
}

/* ════════════════════════════════════════════════════ 2 · A14 · coupons ════ */
console.log("\nA14 — coupons: four derived chips, and the rules the design states");
{
  const { json } = await api("/list/coupons?tab=active");
  for (const key of ["active", "scheduled", "expired", "exhausted"]) {
    const expected = Number(
      (await one(`select count(*) n from admin_coupon_list where status_key=$1`, key)).n,
    );
    check(`chip ${key}`, json.data.tabCounts[key], expected);
    gte(`  …and it has rows to look at`, expected, 1);
  }

  const created = await api("/coupons", {
    method: "POST",
    body: JSON.stringify({
      action: "save",
      code: "P5NEW",
      discount_type: "percent",
      discount_value: 15,
      max_discount_paise: 50000,
      min_value_paise: 99900,
      applies_to: "plans",
      catalog_codes: ["p999"],
      usage_cap: 100,
      per_user_limit: 1,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    }),
  });
  check("create coupon → 200", created.status, 200);
  const row = await one(`select * from admin_coupon_list where code='P5NEW'`);
  check("stored as ACTIVE", row.status_key, "active");
  check("scope kept", row.catalog_codes[0], "p999");
  gte("audit row", await audited("coupon_save"), 1);

  const clash = await api("/coupons", {
    method: "POST",
    body: JSON.stringify({ action: "save", code: "p5new", discount_type: "flat", discount_value: 100 }),
  });
  check("a duplicate code is refused, case-insensitively", clash.status, 422);

  const badPct = await api("/coupons", {
    method: "POST",
    body: JSON.stringify({ action: "save", id: row.id, code: "P5NEW", discount_type: "percent", discount_value: 140 }),
  });
  check("a discount over 100% is refused", badPct.status, 422);

  const badDates = await api("/coupons", {
    method: "POST",
    body: JSON.stringify({
      action: "save",
      id: row.id,
      code: "P5NEW",
      discount_type: "percent",
      discount_value: 15,
      starts_at: new Date(Date.now() + 10 * 86400000).toISOString(),
      expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    }),
  });
  check("an end date before the start is refused", badDates.status, 422);

  // the cap cannot go under what is already redeemed
  await sql.query(`update coupons set used_count = 20 where upper(code) = 'P5NEW'`);
  const lowCap = await api("/coupons", {
    method: "POST",
    body: JSON.stringify({
      action: "save",
      id: row.id,
      code: "P5NEW",
      discount_type: "percent",
      discount_value: 15,
      usage_cap: 5,
    }),
  });
  check("a cap below the redemptions is refused", lowCap.status, 422);
  check("…and it says how many", lowCap.json.error.message.includes("20"), true);

  // a redeemed coupon is ENDED, never deleted
  const cantDelete = await api("/coupons", { method: "POST", body: JSON.stringify({ action: "delete", id: row.id }) });
  check("a redeemed coupon cannot be deleted", cantDelete.status, 422);
  const ended = await api("/coupons", { method: "POST", body: JSON.stringify({ action: "end", id: row.id }) });
  check("end → 200", ended.status, 200);
  const after = await one(`select is_active, used_count, status_key from admin_coupon_list where id=$1`, row.id);
  check("is_active false", after.is_active, false);
  check("status derives to expired", after.status_key, "expired");
  check("the redemptions are kept", after.used_count, 20);

  await sql.query(`delete from coupons where upper(code) in ('P5NEW')`);
}

/* ═════════════════════════════════════════════════════ 3 · A15 · grants ════ */
console.log("\nA15 — grants: revoking withdraws the PLAN, not just the log row");
{
  const { json } = await api("/list/grants?tab=active");
  const expected = Number((await one(`select count(*) n from admin_grant_list where status_key='active'`)).n);
  check("Active chip", json.data.tabCounts.active, expected);
  gte("there are active grants to act on", expected, 1);

  // one grant of our own, so nothing seeded is destroyed
  const user = await one(
    `select id from profiles where state='active' and is_registered order by random() limit 1`,
  );
  const granted = await api(`/users/${user.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "grant_trial",
      contents: { listings: 1, requirements: 1, proposals: 10 },
      durationDays: 14,
      reason: "P5a check",
    }),
  });
  check("grant created from A11's sheet → 200", granted.status, 200);
  const g = await one(
    `select id, user_plan_id, status_key, expires_at from admin_grant_list
      where profile_id=$1 order by created_at desc limit 1`,
    user.id,
  );
  check("it shows in A15 as active", g.status_key, "active");

  const noReason = await api("/grants", {
    method: "POST",
    body: JSON.stringify({ action: "extend", id: g.id, days: 7, reason: "" }),
  });
  check("extending without a reason is refused", noReason.status, 422);

  const ext = await api("/grants", {
    method: "POST",
    body: JSON.stringify({ action: "extend", id: g.id, days: 7, reason: "P5a check — extend" }),
  });
  check("extend → 200", ext.status, 200);
  const extended = await one(`select expires_at from user_plans where id=$1`, g.user_plan_id);
  check(
    "the PLAN's expiry moved, not just the log",
    new Date(extended.expires_at) > new Date(g.expires_at),
    true,
  );
  gte("audit row", await audited("grant_extend"), 1);

  const rev = await api("/grants", {
    method: "POST",
    body: JSON.stringify({ action: "revoke", id: g.id, reason: "P5a check — revoke" }),
  });
  check("revoke → 200", rev.status, 200);
  check(
    "grants.revoked_at set",
    (await one(`select revoked_at from grants where id=$1`, g.id)).revoked_at !== null,
    true,
  );
  check(
    "the user_plan is REVOKED — not left active",
    (await one(`select status from user_plans where id=$1`, g.user_plan_id)).status,
    "revoked",
  );
  check(
    "A15 shows it as revoked",
    (await one(`select status_key from admin_grant_list where id=$1`, g.id)).status_key,
    "revoked",
  );
  gte("the user was told", Number((await one(
    `select count(*) n from notifications where profile_id=$1 and type='admin_message'
      and greatest(created_at, coalesce(last_event_at, created_at)) >= $2`, user.id, since)).n), 1);

  const twice = await api("/grants", {
    method: "POST",
    body: JSON.stringify({ action: "revoke", id: g.id, reason: "again" }),
  });
  check("revoking twice is refused", twice.status, 422);
}

/* ═══════════════════════════════════════════════════════ 4 · security ══════ */
console.log("\nSecurity");
{
  for (const path of ["/plans", "/coupons?id=x", "/grants?id=x", "/list/coupons", "/list/grants"]) {
    const res = await fetch(API + path);
    check(`anon ${path}`, res.status, 401);
  }
  const staffEmail = (
    await one(`select email from staff where level='staff' and is_active and state='active' limit 1`)
  )?.email;
  if (staffEmail) {
    const staffApi = await signIn(staffEmail);
    for (const path of ["/plans", "/list/coupons", "/list/grants"]) {
      check(`staff ${path} → 403`, (await staffApi(path)).status, 403);
    }
  }
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks green\n`);
await sql.end();
process.exit(failures ? 1 : 0);
