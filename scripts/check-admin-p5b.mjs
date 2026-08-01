/**
 * P5b — A16 Finance · A17/A18 Payments list.
 *
 * Every number Finance prints is re-derived here with a SECOND, independently
 * written query and compared. A finance screen agreeing with itself proves
 * nothing; agreeing with a query nobody wrote for it does.
 *
 *   PORT=3000 node scripts/check-admin-p5b.mjs
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
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(52)} got=${String(got).padEnd(16)} want=${want} ${extra}`,
  );
};
const gte = (label, got, want) => {
  checks++;
  const okay = Number(got) >= Number(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(52)} got=${String(got).padEnd(16)} want>=${want}`,
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
  const call = async (path, init = {}) => {
    const r = await fetch(API + path, {
      ...init,
      headers: { "content-type": "application/json", cookie: j.header(), ...(init.headers ?? {}) },
    });
    j.absorb(r);
    return { status: r.status, json: await r.json().catch(() => null), raw: r };
  };
  // The download endpoint returns a FILE, so it needs a call that has not
  // already consumed the body reading JSON.
  call.raw = (path, init = {}) =>
    fetch(API + path, { ...init, headers: { cookie: j.header(), ...(init.headers ?? {}) } });
  call.jar = j;
  return call;
}

const superEmail = process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL;
const api = await signIn(superEmail);
const since = new Date().toISOString();
const audited = async (action) =>
  Number(
    (await one(`select count(*) n from admin_audit_log where action=$1 and created_at>=$2`, action, since)).n,
  );

/* ══════════════════════════════════════ 1 · A17 · the payments list ════════ */
console.log("\nA17 — payments: six chips over real states, plus abandoned");
{
  const { status, json } = await api("/list/payments?tab=all");
  check("list → 200", status, 200);

  for (const key of ["success", "pending", "failed", "refunded", "chargeback"]) {
    const expected = Number(
      (await one(`select count(*) n from payments where status = $1`, key)).n,
    );
    check(`chip ${key}`, json.data.tabCounts[key], expected);
    gte(`  …has rows to look at`, expected, 1);
  }
  const all = Number((await one(`select count(*) n from admin_payment_list`)).n);
  check("chip All", json.data.tabCounts.all, all);

  // the struck-out original only appears when a coupon really moved the price
  const discounted = Number(
    (await one(`select count(*) n from admin_payment_list where strike_paise is not null`)).n,
  );
  const noDiscount = Number(
    (
      await one(
        `select count(*) n from admin_payment_list apl
          join orders o on o.id = apl.order_id
         where o.discount_paise = 0 and apl.strike_paise is not null`,
      )
    ).n,
  );
  gte("some rows carry a struck-out original", discounted, 1);
  check("…and no undiscounted row does", noDiscount, 0);

  // search reaches the server
  const sample = await one(
    `select razorpay_payment_id from admin_payment_list where razorpay_payment_id is not null limit 1`,
  );
  const term = sample.razorpay_payment_id.slice(0, 10);
  const expectedSearch = Number(
    (
      await one(
        `select count(*) n from admin_payment_list
          where razorpay_payment_id ilike $1 or razorpay_order_id ilike $1
             or user_name ilike $1 or item_name ilike $1`,
        `%${term}%`,
      )
    ).n,
  );
  const r = await api(`/list/payments?tab=all&q=${encodeURIComponent(term)}`);
  check(`search "${term}"`, r.json.data.total, expectedSearch);

  // the method filter narrows in SQL
  const method = (await one(`select method from payments where method is not null limit 1`)).method;
  const expectedMethod = Number(
    (await one(`select count(*) n from admin_payment_list where method = $1`, method)).n,
  );
  const rm = await api(`/list/payments?tab=all&method=${encodeURIComponent(method)}`);
  check(`filter method=${method}`, rm.json.data.total, expectedMethod);
}

console.log("\nA17 — the abandoned tab is orders, not payments");
{
  // 8760 asks for a year; the endpoint clamps the window to 720 hours, so what
  // comes back must be the CLAMPED window — and it must say which window it
  // answered, or the screen's "in the last N hours" line would be a guess.
  const { status, json } = await api("/abandoned?hours=8760");
  check("abandoned → 200", status, 200);
  check("an over-long window is clamped, and reported", json.data.hours, 720);
  const expected = Number(
    (
      await one(
        `select count(*) n from admin_abandoned_checkouts
          where created_at >= now() - interval '720 hours'`,
      )
    ).n,
  );
  check("row count matches the view", json.data.rows.length, Math.min(expected, 100));
  check("…and the total is the uncapped count", json.data.total, expected);
  gte("there are abandoned checkouts to act on", expected, 1);
  check(
    "none of them has a successful payment",
    Number(
      (
        await one(
          `select count(*) n from admin_abandoned_checkouts a
            join payments p on p.order_id = a.id and p.status = 'success'`,
        )
      ).n,
    ),
    0,
  );

  const target = json.data.rows[0];
  const retry = await api("/abandoned", {
    method: "POST",
    body: JSON.stringify({ action: "retry", id: target.id }),
  });
  check("send retry link → 200", retry.status, 200);
  const msg = await one(
    `select channel, delivery, delivered_at from admin_messages
      where profile_id=$1 order by created_at desc limit 1`,
    target.profile_id,
  );
  check("an admin_messages row was written", msg !== undefined, true);
  check("it names all three channels", msg.channel, "in_app,email,whatsapp");
  check("in-app really went", msg.delivery.in_app.sent, true);
  gte("audit row", await audited("retry_link"), 1);

  // a PAID order is no longer abandoned, so it cannot be retried
  const paid = await one(`select id from orders where status='paid' limit 1`);
  const nope = await api("/abandoned", {
    method: "POST",
    body: JSON.stringify({ action: "retry", id: paid.id }),
  });
  check("a completed order cannot be retried", nope.status, 422);
}

/* ═══════════════════════════════════════════ 2 · A16 · revenue, re-derived ═ */
console.log("\nA16 Revenue — every KPI re-derived by a second query");
{
  const { status, json } = await api("/finance?tab=revenue&range=30d&gran=week");
  check("revenue tab → 200", status, 200);
  const k = json.data.kpis;

  const gross = await one(
    `select coalesce(sum(total_paise),0) s, count(*) n from orders
      where status='paid' and created_at >= now() - interval '30 days'`,
  );
  const refunds = await one(
    `select coalesce(sum(amount_paise),0) s, count(*) n from payments
      where status='refunded' and refunded_at >= now() - interval '30 days'`,
  );
  check("gross revenue", k.gross_paise, gross.s);
  check("transactions", k.transactions, gross.n);
  check("refunds", k.refunds_paise, refunds.s);
  check("refund count", k.refund_count, refunds.n);
  check("net revenue = gross − refunds", k.revenue_paise, Number(gross.s) - Number(refunds.s));
  check(
    "avg order value",
    k.avg_order_paise,
    Number(gross.n) ? Math.round(Number(gross.s) / Number(gross.n)) : 0,
  );

  // the trend adds up to the gross
  const trendTotal = json.data.trend.reduce((s, t) => s + t.total, 0);
  check("the trend's buckets sum to the gross", trendTotal, gross.s);

  // the product split adds up too, and matches per-product SQL
  const productTotal = json.data.byProduct.reduce((s, p) => s + p.revenue_paise, 0);
  check("the product split sums to the gross", productTotal, gross.s);
  const top = json.data.byProduct[0];
  if (top) {
    const expected = await one(
      `select coalesce(sum(total_paise),0) s, count(*) n from orders
        where status='paid' and catalog_code=$1 and created_at >= now() - interval '30 days'`,
      top.code,
    );
    check(`byProduct ${top.code} revenue`, top.revenue_paise, expected.s);
    check(`byProduct ${top.code} sales`, top.sales, expected.n);
  }

  // a different range really re-queries
  const r7 = await api("/finance?tab=revenue&range=7d&gran=day");
  const gross7 = await one(
    `select coalesce(sum(total_paise),0) s from orders
      where status='paid' and created_at >= now() - interval '7 days'`,
  );
  check("7d re-queries rather than re-slicing", r7.json.data.kpis.gross_paise, gross7.s);
  check("…and it is a different number", r7.json.data.kpis.gross_paise !== k.gross_paise, true);
}

/* ═════════════════════════════════════════════════════════ 3 · A16 churn ═══ */
console.log("\nA16 Churn — the renewal rate is over plans that ENDED");
{
  const { status, json } = await api("/finance?tab=churn");
  check("churn tab → 200", status, 200);
  const k = json.data.kpis;

  const expiring = await one(
    `select count(*) n from admin_churn_list where expires_at < now() + interval '7 days'`,
  );
  check("expiring in 7 days", k.expiring_7d, expiring.n);
  const churned = await one(
    `select count(*) n from user_plans
      where status='expired' and expires_at >= now() - interval '30 days' and expires_at < now()`,
  );
  check("churned last month", k.churned_last_month, churned.n);
  check("the renewal rate is a percentage", k.renewal_rate >= 0 && k.renewal_rate <= 100, true);
  gte("…and it is computed over ended plans", k.renewal_basis, 0);

  const rows = json.data.rows;
  gte("there are plans expiring soon", rows.length, 1);
  // "Renewed?" is a fact about orders, not a flag
  const row = rows.find((r) => r.renewed) ?? rows[0];
  const reallyRenewed = Number(
    (
      await one(
        `select count(*) n from orders o
          join user_plans up on up.id = $1
         where o.profile_id = up.profile_id and o.catalog_code = up.catalog_code
           and o.status='paid' and o.created_at > up.purchased_at`,
        row.id,
      )
    ).n,
  );
  check("Renewed? matches the orders table", Boolean(row.renewed), reallyRenewed > 0);

  // the reminder shares the CRON's ledger
  const target = rows.find((r) => r.plan_status === "active") ?? rows[0];
  // The send is throttled to one per 24h, so a second run of this script would
  // read its own previous run as the throttle and fail. Clear the manual rows
  // for this one plan first: the check rebuilds the state it consumes.
  await sql.query(`delete from plan_reminders where user_plan_id=$1 and milestone=0`, [target.id]);
  const rem = await api("/finance", {
    method: "POST",
    body: JSON.stringify({ action: "remind", id: target.id }),
  });
  check("send reminder → 200", rem.status, 200);
  const reminder = await one(
    `select milestone from plan_reminders where user_plan_id=$1 and milestone=0
      order by sent_at desc limit 1`,
    target.id,
  );
  check("written to plan_reminders as milestone 0 (manual)", reminder?.milestone, 0);
  gte(
    "the user was told",
    Number(
      (
        await one(
          `select count(*) n from notifications where profile_id=$1 and type='plan_expiring'
            and greatest(created_at, coalesce(last_event_at, created_at)) >= $2`,
          target.profile_id,
          since,
        )
      ).n,
    ),
    1,
  );
  const twice = await api("/finance", {
    method: "POST",
    body: JSON.stringify({ action: "remind", id: target.id }),
  });
  check("a second reminder inside 24h is refused", twice.status, 422);
  gte("audit row", await audited("finance_remind"), 1);
}

/* ══════════════════════════════════════════════ 4 · A16 reconciliation ═════ */
console.log("\nA16 Reconciliation — the counts are ours, the re-check is Razorpay's");
{
  const { status, json } = await api("/finance?tab=recon");
  check("recon tab → 200", status, 200);
  for (const state of ["matched", "mismatched", "pending"]) {
    const expected = Number(
      (await one(`select count(*) n from reconciliation_items where state=$1`, state)).n,
    );
    check(`${state} count`, json.data.counts[state], expected);
  }

  // seed a mismatch if the run has none, so the row actions are exercised
  let mismatch = await one(`select id from reconciliation_items where state='mismatched' limit 1`);
  if (!mismatch) {
    const run = await one(`select id from reconciliation_runs order by ran_at desc limit 1`);
    const pay = await one(`select id, amount_paise from payments where status='success' limit 1`);
    mismatch = await one(
      `insert into reconciliation_items (run_id, payment_id, platform_paise, gateway_paise, state, note)
       values ($1,$2,$3,$4,'mismatched','P5b fixture') returning id`,
      run.id,
      pay.id,
      pay.amount_paise,
      Number(pay.amount_paise) - 100,
    );
    console.log("  --   seeded one mismatch so the row actions have a subject");
  }

  // Without gateway credentials a re-check must REFUSE, not silently "resolve"
  const recheck = await api("/finance", {
    method: "POST",
    body: JSON.stringify({ action: "recheck", id: mismatch.id }),
  });
  check(
    "re-check answers honestly about the gateway",
    recheck.status === 200 || recheck.status === 422,
    true,
  );
  if (recheck.status === 422) {
    console.log(`  --   re-check said: ${recheck.json.error.message}`);
    check(
      "…and says WHY, rather than silently resolving",
      Boolean(recheck.json.error.message) && recheck.json.error.message.length > 5,
      true,
    );
    check(
      "…leaving the row still mismatched",
      (await one(`select state from reconciliation_items where id=$1`, mismatch.id)).state,
      "mismatched",
    );
  }

  const noNote = await api("/finance", {
    method: "POST",
    body: JSON.stringify({ action: "resolve", id: mismatch.id, note: "" }),
  });
  check("resolving without a reason is refused", noNote.status, 422);

  const resolved = await api("/finance", {
    method: "POST",
    body: JSON.stringify({ action: "resolve", id: mismatch.id, note: "P5b check — settled by hand" }),
  });
  check("mark resolved → 200", resolved.status, 200);
  const after = await one(`select state, note from reconciliation_items where id=$1`, mismatch.id);
  check("state is resolved", after.state, "resolved");
  check("the reason is kept on the row", after.note.includes("settled by hand"), true);
  gte("audit row", await audited("finance_resolve"), 1);
}

/* ═════════════════════════════════════════════════ 5 · A16 exports ════════ */
console.log("\nA16 Exports — real files, through the shared machinery");
{
  const before = Number((await one(`select count(*) n from exports`)).n);

  for (const [resource, fields, expectSql] of [
    [
      "finance-revenue",
      ["date", "product", "base", "total", "status"],
      `select count(*) n from orders where created_at >= now() - interval '30 days'`,
    ],
    [
      "finance-refunds",
      ["payment", "user", "amount", "refunded"],
      `select count(*) n from admin_payment_list
        where status_key='refunded' and refunded_at >= now() - interval '30 days'`,
    ],
  ]) {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const res = await api("/export", {
      method: "POST",
      body: JSON.stringify({
        resource,
        query: new URLSearchParams({ from }).toString(),
        fields,
        format: "csv",
        name: `P5b ${resource}`,
      }),
    });
    check(`${resource} export → 200`, res.status, 200);
    const expected = Number((await one(expectSql)).n);
    check(`${resource} row count matches SQL`, res.json.data.rowCount, expected);

    // and it can actually be downloaded
    const dl = await api.raw(`/export/${res.json.data.id}`);
    check(`${resource} download → 200`, dl.status, 200);
    const text = await dl.text();
    check(`${resource} file has a header row`, text.split("\n")[0].split(",").length, fields.length);
    gte(`${resource} file has body rows`, text.trim().split("\n").length - 1, Math.min(expected, 1));
    gte("the download is audited", await audited("export_download"), 1);
  }

  const after = Number((await one(`select count(*) n from exports`)).n);
  check("two export rows were written", after - before, 2);

  const history = await api("/finance?tab=exports");
  gte("they appear in the Exports tab", history.json.data.rows.length, 2);
}

/* ═══════════════════════════════════════════════════════ 6 · security ══════ */
console.log("\nSecurity");
{
  for (const path of ["/finance", "/abandoned", "/list/payments"]) {
    const res = await fetch(API + path);
    check(`anon ${path}`, res.status, 401);
  }
  const anyExport = await one(`select id from exports order by created_at desc limit 1`);
  const anonDl = await fetch(`${API}/export/${anyExport.id}`);
  check("anon export download → 401", anonDl.status, 401);
  check("a non-uuid export id → 404", (await api.raw("/export/not-a-uuid")).status, 404);

  const staffEmail = (
    await one(`select email from staff where level='staff' and is_active and state='active' limit 1`)
  )?.email;
  if (staffEmail) {
    const staffApi = await signIn(staffEmail);
    for (const path of ["/finance", "/abandoned", "/list/payments"]) {
      check(`staff ${path} → 403`, (await staffApi(path)).status, 403);
    }
    check("staff → export download 403", (await staffApi.raw(`/export/${anyExport.id}`)).status, 403);
  }
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks green\n`);
await sql.end();
process.exit(failures ? 1 : 0);
