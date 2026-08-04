/**
 * Concurrency proof for migration 0011: the inline cancel handler and the hourly
 * sweep both refund cancelled/rejected boosts. Only ONE of them may ever call
 * Razorpay for a given payment. N simultaneous claims must yield exactly one
 * winner, a failed attempt must hand the claim back, and a stale claim must be
 * reclaimable so a dead process can't strand a refund forever.
 */
import fs from "node:fs";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const ROOT = "C:/Users/RAJAN/Music/homzlist-app";
const E = {};
for (const l of fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const conn = () => dbConnect();

const admin = await conn();
let pass = true;
const check = (ok, msg) => { if (!ok) pass = false; console.log(`  [${ok ? "PASS" : "FAIL"}] ${msg}`); };

// A throwaway boost on a real profile + listing.
const { rows: [p] } = await admin.query(`select id from profiles where role is not null limit 1`);
const { rows: [l] } = await admin.query(`select id from listings limit 1`);
const { rows: [b] } = await admin.query(`
  insert into boosts (profile_id, listing_id, catalog_code, duration_days, targeting,
                      target_label, price_paise, status)
  values ($1,$2,'boost7',7,'area','This area',49900,'cancelled') returning id`, [p.id, l.id]);

console.log("\n=== boost refund single-flight ===");

// 1. 10 simultaneous claims on separate connections → exactly one winner.
const results = await Promise.all(Array.from({ length: 10 }, async () => {
  const c = await conn();
  try {
    const { rows: [r] } = await c.query(`select claim_boost_refund($1, 15) as ok`, [b.id]);
    return r.ok;
  } finally { await c.end(); }
}));
check(results.filter(Boolean).length === 1,
  `10 concurrent claims → exactly 1 winner (got ${results.filter(Boolean).length})`);

// 2. A failed attempt releases the claim, so the next sweep can retry.
await admin.query(`select release_boost_refund_claim($1)`, [b.id]);
const { rows: [again] } = await admin.query(`select claim_boost_refund($1, 15) as ok`, [b.id]);
check(again.ok === true, "released claim is re-claimable by the next sweep");

// 3. A live claim blocks everyone else.
const { rows: [blocked] } = await admin.query(`select claim_boost_refund($1, 15) as ok`, [b.id]);
check(blocked.ok === false, "a live claim blocks a second refunder");

// 4. A claim from a dead process goes stale and can be reclaimed.
await admin.query(`update boosts set refund_claimed_at = now() - interval '30 minutes' where id=$1`, [b.id]);
const { rows: [stale] } = await admin.query(`select claim_boost_refund($1, 15) as ok`, [b.id]);
check(stale.ok === true, "a stale (dead-process) claim is reclaimable — refund can't strand");

// 5. Once actually refunded, nobody may claim again.
await admin.query(`update boosts set refunded_at = now() where id=$1`, [b.id]);
const { rows: [done] } = await admin.query(`select claim_boost_refund($1, 15) as ok`, [b.id]);
check(done.ok === false, "a refunded boost can never be claimed again (no double refund)");

await admin.query(`delete from boosts where id=$1`, [b.id]);
await admin.end();

console.log(`\n${pass ? "ALL SCENARIOS PASS" : "SOME SCENARIOS FAILED"}`);
process.exit(pass ? 0 : 1);
