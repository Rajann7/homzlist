/**
 * Seeds Module 6 (P2 Feed & Stories) so every card type, ring type and state is
 * real: fresh-approved listings for the story row, a second active boost (FIFO
 * ordering), and saves / inquiries / reports / story_seen / not-interested rows
 * so those flows are proven with data — not empty screens.
 *
 * Idempotent for its own interaction rows. Dev only (direct Postgres).
 *   node scripts/seed-module6.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const c = await dbConnect();
const q = (s, p) => c.query(s, p);
const one = async (s, p) => (await q(s, p)).rows[0];
const idByPhone = async (phone) => (await one("select id from profiles where phone=$1", [phone]))?.id;

const RAJKOT = "365a99e6-fd34-4062-9fc3-dccb22d8a699";
const amit = await idByPhone("+919999000007");   // buyer (broker) — saves/inquiries/reports
const suresh = await idByPhone("+919999000013");  // builder — dashboard

// Align the demo viewer to Rajkot so the city-scoped feed + stories surface data.
await q("update profiles set city_id=$2 where id=$1", [amit, RAJKOT]);

// ---- 1. Fresh stories: bump the 6 most recent OTHER-owner live listings to now
const fresh = (await q(
  `update listings set live_at = now() - (floor(random()*6)||' hours')::interval
     where id in (
       select id from listings where status='live' and availability='available' and profile_id <> $1
       order by created_at desc limit 6
     ) returning id, profile_id`, [amit])).rows;

// ---- 2. Second active boost (FIFO ordering demo) — pick a fresh OTHER listing
const boostTarget = fresh.find((r) => r.profile_id !== amit)?.id;
if (boostTarget) {
  const existing = await one("select id from boosts where listing_id=$1 and status='active'", [boostTarget]);
  const template = await one("select catalog_code, price_paise from boosts order by created_at desc limit 1");
  if (!existing && template) {
    await q(
      `insert into boosts (profile_id, listing_id, catalog_code, duration_days, targeting, target_label, price_paise, status, starts_at, ends_at)
       select profile_id, id, $2, 7, 'city', 'Rajkot', $3, 'active', now() - interval '1 hour', now() + interval '6 days'
         from listings where id=$1`, [boostTarget, template.catalog_code, template.price_paise]);
  }
}

// ---- 3. Interaction rows (reset our seeded ones first) ----------------------
await q("delete from saves where profile_id=$1", [amit]);
await q("delete from inquiries where profile_id=$1", [amit]);
await q("delete from reports where reporter_id=$1", [amit]);
await q("delete from story_seen where profile_id=$1", [amit]);
await q("delete from feed_not_interested where profile_id=$1", [amit]);

const others = (await q("select id, profile_id from listings where status='live' and profile_id <> $1 order by created_at desc limit 5", [amit])).rows;
// saves (3)
for (const l of others.slice(0, 3)) await q("insert into saves (profile_id, listing_id) values ($1,$2) on conflict do nothing", [amit, l.id]);
// inquiry (1) — to a listing owned by someone else
if (others[0]) await q("insert into inquiries (profile_id, listing_id, poster_id, message, intents, share_number) values ($1,$2,$3,$4,$5,true) on conflict do nothing",
  [amit, others[0].id, others[0].profile_id, "Hi, is this still available? Site visit possible this weekend?", ["site_visit", "loan"]]);
// report (1)
if (others[1]) await q("insert into reports (reporter_id, subject_type, subject_id, reason, note) values ($1,'listing',$2,'wrong_price','Price looks off') on conflict do nothing", [amit, others[1].id]);
// story_seen (1) — grey one ring for Amit
if (others[2]) await q("insert into story_seen (profile_id, city_id, segment_id) values ($1,$2,$3) on conflict do nothing", [amit, RAJKOT, others[2].id]);

// ---- 4. Builder dashboard: ensure the builder has a live project + matching reqs
const builderProj = await one("select id, city_id from projects where profile_id=$1 and status='live' limit 1", [suresh]);
if (!builderProj) {
  // Promote one of the builder's projects to live (or note absence).
  const draft = await one("select id from projects where profile_id=$1 order by created_at desc limit 1", [suresh]);
  if (draft) await q("update projects set status='live', live_at=now(), city_id=coalesce(city_id,$2) where id=$1", [draft.id, RAJKOT]);
}

// ---- report -----------------------------------------------------------------
const r = await one(`select
  (select count(*) from listings where status='live' and live_at > now()-interval '24 hours') stories_src,
  (select count(*) from boosts where status='active') active_boosts,
  (select count(*) from saves where profile_id=$1) saves,
  (select count(*) from inquiries where profile_id=$1) inquiries,
  (select count(*) from reports where reporter_id=$1) reports,
  (select count(*) from story_seen where profile_id=$1) seen,
  (select count(*) from projects where profile_id=$2 and status='live') builder_projects`, [amit, suresh]);
console.log("Seeded Module 6:", JSON.stringify(r, null, 1));
console.log("Demo viewer (buyer/broker, Rajkot):", amit);
console.log("Builder (dashboard):", suresh);
await c.end();
