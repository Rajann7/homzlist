/**
 * Concurrency proof for migration 0009: N simultaneous checkouts against a
 * per_user_limit coupon must grant exactly per_user_limit slots — never more.
 * Each attempt runs on its OWN connection so these are real parallel
 * transactions, not serialized statements on one socket.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = "C:/Users/RAJAN/Music/homzlist-app";
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const cfg = {
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432, user: "postgres", password: E.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
};
const conn = async () => { const c = new pg.Client(cfg); await c.connect(); return c; };

const admin = await conn();
const CONCURRENCY = 12;

async function scenario(label, perUserLimit, usageCap, profileCount) {
  const code = `RACE${Date.now().toString().slice(-8)}`;
  const { rows: [cp] } = await admin.query(
    `insert into coupons (code, discount_type, discount_value, per_user_limit, usage_cap)
     values ($1,'flat',10000,$2,$3) returning id`, [code, perUserLimit, usageCap]);

  const { rows: profiles } = await admin.query(
    `select id from profiles where role is not null order by created_at limit $1`, [profileCount]);

  // Pre-create the orders (checkout does this before claiming).
  const orders = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const p = profiles[i % profiles.length].id;
    const { rows: [o] } = await admin.query(
      `insert into orders (profile_id, kind, catalog_code, terms_snapshot, base_paise,
                           taxable_paise, total_paise, coupon_id, coupon_code)
       values ($1,'plan','p999','{}'::jsonb,99900,89900,106082,$2,$3) returning id`,
      [p, cp.id, code]);
    orders.push({ orderId: o.id, profileId: p });
  }

  // Fire them all at once, each on its own connection.
  const results = await Promise.all(orders.map(async ({ orderId, profileId }) => {
    const c = await conn();
    try {
      const { rows: [r] } = await c.query(
        `select claim_coupon_slot($1,$2,$3,30) as ok`, [cp.id, profileId, orderId]);
      return r.ok;
    } finally { await c.end(); }
  }));

  const granted = results.filter(Boolean).length;
  const { rows: [liveRow] } = await admin.query(
    `select count(*)::int n from coupon_claims where coupon_id=$1 and state<>'released'`, [cp.id]);
  const live = liveRow.n;
  const { rows: perUser } = await admin.query(
    `select profile_id, count(*)::int n from coupon_claims
      where coupon_id=$1 and state<>'released' group by 1 order by 2 desc`, [cp.id]);

  const maxPerUser = perUser.length ? perUser[0].n : 0;
  const expected = usageCap === null
    ? Math.min(CONCURRENCY, perUserLimit * profileCount)
    : Math.min(CONCURRENCY, perUserLimit * profileCount, usageCap);
  const pass = granted === expected && maxPerUser <= perUserLimit && live === granted;

  console.log(`\n[${pass ? "PASS" : "FAIL"}] ${label}`);
  console.log(`  ${CONCURRENCY} concurrent claims · per_user_limit=${perUserLimit} · usage_cap=${usageCap} · users=${profileCount}`);
  console.log(`  granted=${granted} (expected ${expected})  live_claims=${live}  max_per_user=${maxPerUser}`);

  // Slot release: an abandoned hold must free its slot for a later order.
  if (label.startsWith("A")) {
    // Release the order that actually WON the race — the losers hold nothing.
    const { rows: [winner] } = await admin.query(
      `select order_id, profile_id from coupon_claims where coupon_id=$1 and state='held' limit 1`, [cp.id]);
    const first = { orderId: winner.order_id, profileId: winner.profile_id };
    await admin.query(`select release_coupon_claim($1)`, [first.orderId]);
    const { rows: [o2] } = await admin.query(
      `insert into orders (profile_id, kind, catalog_code, terms_snapshot, base_paise,
                           taxable_paise, total_paise, coupon_id, coupon_code)
       values ($1,'plan','p999','{}'::jsonb,99900,89900,106082,$2,$3) returning id`,
      [first.profileId, cp.id, code]);
    const { rows: [again] } = await admin.query(
      `select claim_coupon_slot($1,$2,$3,30) as ok`, [cp.id, first.profileId, o2.id]);
    console.log(`  [${again.ok ? "PASS" : "FAIL"}] released slot is reusable by a new order: ${again.ok}`);

    // …but a REDEEMED slot must never come back.
    await admin.query(`select redeem_coupon_claim($1)`, [o2.id]);
    await admin.query(`select release_coupon_claim($1)`, [o2.id]);
    const { rows: [st] } = await admin.query(`select state from coupon_claims where order_id=$1`, [o2.id]);
    console.log(`  [${st.state === "redeemed" ? "PASS" : "FAIL"}] redeemed slot survives a release attempt: state=${st.state}`);
  }

  // Clean up this scenario's synthetic rows.
  await admin.query(`delete from orders where coupon_id=$1`, [cp.id]);
  await admin.query(`delete from coupons where id=$1`, [cp.id]);
  return pass;
}

const a = await scenario("A · single user, per_user_limit=1", 1, null, 1);
const b = await scenario("B · single user, per_user_limit=3", 3, null, 1);
const c = await scenario("C · 4 users x limit 1 (per-user isolation)", 1, null, 4);
const d = await scenario("D · global usage_cap=5 across 6 users", 1, 5, 6);

console.log(`\n${a && b && c && d ? "ALL SCENARIOS PASS" : "SOME SCENARIOS FAILED"}`);
await admin.end();
