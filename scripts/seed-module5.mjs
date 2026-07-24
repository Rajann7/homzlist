/**
 * Seeds Module 5 (P8) so every screen + state renders against REAL rows:
 *   - a live requirement (poster: Rahul Mehta) receiving proposals in ALL statuses
 *   - proposals SENT by Amit Shah across several requirements (all statuses)
 *   - Amit granted ₹2,999 Requirement Access → unlocked browse
 *   - visits (buyer: Amit) in every section/status/outcome
 *   - leads for a broker (RK Properties) + builder (Suresh Reddy) across all stages
 *
 * Idempotent: clears the three Module-5 tables + its own seeded requirement/plan
 * and re-inserts. Dev only — uses the direct Postgres connection.
 *
 *   node scripts/seed-module5.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432, user: "postgres", password: E.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const q = (s, p) => c.query(s, p);
const one = async (s, p) => (await q(s, p)).rows[0];
const idByPhone = async (phone) => (await one("select id from profiles where phone=$1", [phone]))?.id;

const RAJKOT = "365a99e6-fd34-4062-9fc3-dccb22d8a699";

// ---- actors (resolved from the real dev DB) --------------------------------
const poster = await idByPhone("+919999000001");   // Rahul Mehta (owner) — receives proposals
const amit   = await idByPhone("+919999000007");   // Amit Shah (broker) — sender + unlocked viewer + visit buyer
const rk      = await idByPhone("+919825012345");  // RK Properties (broker) — sender + leads owner
const divya   = await idByPhone("+919999000012");  // Divya Menon (broker) — sender
const kiran   = await idByPhone("+919999000008");  // Kiran Desai (broker) — sender
const sanjay  = await idByPhone("+919999000011");  // Sanjay Rao (broker) — sender
const pooja   = await idByPhone("+919999000010");  // Pooja Nair (broker) — sender
const suresh  = await idByPhone("+919999000013");  // Suresh Reddy (builder) — leads owner
const sneha   = await idByPhone("+919999000004");  // Sneha Patel (owner) — lead person / poster of other reqs

if (![poster, amit, rk, divya, kiran, sanjay, pooja, suresh, sneha].every(Boolean)) {
  console.error("Missing an expected seed actor — aborting."); await c.end(); process.exit(1);
}

// Amit lists in Mavdi/Rajkot but his profile city was another metro — align it so
// the city-scoped browse cascade (which correctly STOPS at the viewer's city,
// Doc2 §8.3) actually surfaces Rajkot requirements to our unlocked viewer.
await q("update profiles set city_id=$2 where id=$1", [amit, RAJKOT]);

// Mavdi area id (for exact-tier matching); city-tier still works without it.
const mavdi = (await one(
  "select id from locations where level='area' and lower(name)='mavdi' and parent_id=$1 limit 1", [RAJKOT]
))?.id ?? null;
const areaIds = mavdi ? [mavdi] : [];

// Live listings we can attach / visit (real ids).
const amitListing = (await one("select id from listings where profile_id=$1 and status='live' limit 1", [amit]))?.id;
const rkListings = (await q("select id from listings where profile_id=$1 and status='live' order by created_at limit 4", [rk])).rows.map((r) => r.id);
const snehaListing = (await one("select id from listings where profile_id=$1 and status='live' limit 1", [sneha]))?.id;

// ---- reset (idempotent) -----------------------------------------------------
await q("delete from leads");
await q("delete from visits");
await q("delete from proposals");
await q("delete from requirements where notes = 'SEED-M5'");
await q("update user_plans set status='revoked', revoked_reason='seed-reset' where terms->>'seed'='module5'");

// ---- 1. Poster's live requirement (receives all proposal states) -----------
const reqId = randomUUID();
const now = new Date();
const in30 = new Date(now.getTime() + 30 * 864e5);
await q(
  `insert into public.requirements
     (id, profile_id, kind, type_code, bhk, budget_min_paise, budget_max_paise, area_ids, area_label, city_id,
      urgency, notes, status, is_active, slot_consumed_at, submitted_at, approved_at, live_at, expires_at)
   values ($1,$2,'sell','flat',3,6000000000,8500000000,$3,'Mavdi, Rajkot',$4,
      'immediate','SEED-M5','live',true, now(), now(), now(), now(), $5)`,
  [reqId, poster, areaIds, RAJKOT, in30.toISOString()],
);

// ---- 2. Grant Amit ₹2,999 Requirement Access (unlocked browse) -------------
await q(
  `insert into public.user_plans
     (profile_id, catalog_code, name, terms, proposal_quota, proposal_used, requirement_quota, requirement_used, expires_at, status)
   values ($1,'p2999','Requirement Access',
     '{"requirement_access":true,"seed":"module5","proposals_expire_with_plan":true}'::jsonb,
     30, 5, 1, 0, $2, 'active')`,
  [amit, in30.toISOString()],
);

// ---- 3. Proposals RECEIVED on the poster's requirement (all statuses) -------
const mkProposal = async (sender, status, mode, listingId, message, ageHours, responded) => {
  const id = randomUUID();
  const created = new Date(now.getTime() - ageHours * 36e5);
  const exp = new Date(created.getTime() + 30 * 864e5);
  await q(
    `insert into public.proposals
       (id, requirement_id, sender_id, poster_id, mode, listing_id, message, status, expires_at, responded_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, reqId, sender, poster, mode, listingId, message, status, exp.toISOString(),
     responded ? new Date(created.getTime() + 36e5).toISOString() : null, created.toISOString()],
  );
  return id;
};

await mkProposal(rk, "pending", "listing", rkListings[0] ?? null,
  "Hi, I have a 3 BHK in Shree Residency, Mavdi — ₹82 Lakh, semi-furnished, east facing. Ready to move.", 2, false);
await mkProposal(divya, "pending", "chat", null,
  "Hi, I have a few options in Mavdi that fit your budget. Can we discuss your needs?", 5, false);
await mkProposal(kiran, "accepted", "listing", null,
  "Hi, sharing a 3 BHK that matches — happy to arrange a visit this weekend.", 40, true);
await mkProposal(sanjay, "declined", "chat", null,
  "Hi, I can help you find a 3 BHK in Mavdi. Let's connect.", 60, true);
await mkProposal(pooja, "not_relevant", "chat", null,
  "Great investment options available, call me now!!!", 72, true);
// Expired one (created 31 days ago, still pending → cron will flip; seed as expired to show the state)
await mkProposal(amit, "expired", "listing", amitListing ?? null,
  "Hi, I have a 3 BHK in Mavdi — ₹78 Lakh. Let me know if it works.", 24 * 31, false);

// ---- 4. Proposals SENT by Amit across other live requirements (all states) -
const otherReqs = (await q(
  `select id from public.requirements where status='live' and profile_id <> $1 and id <> $2 limit 8`, [amit, reqId]
)).rows.map((r) => r.id);
const sentStates = [
  ["pending", false], ["accepted", true], ["declined", true], ["fulfilled", false],
];
let amitSent = 1; // the expired one above already counts
for (let i = 0; i < otherReqs.length && i < sentStates.length; i++) {
  const [status, responded] = sentStates[i];
  const rid = otherReqs[i];
  const poster2 = (await one("select profile_id from requirements where id=$1", [rid]))?.profile_id;
  if (!poster2 || poster2 === amit) continue;
  const id = randomUUID();
  const created = new Date(now.getTime() - (i + 1) * 12 * 36e5);
  await q(
    `insert into public.proposals (id, requirement_id, sender_id, poster_id, mode, listing_id, message, status, expires_at, responded_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, rid, amit, poster2, i % 2 === 0 ? "listing" : "chat", i % 2 === 0 ? amitListing : null,
     "Hi, I have a matching property — happy to share details.", status, new Date(created.getTime() + 30 * 864e5).toISOString(),
     responded ? new Date(created.getTime() + 36e5).toISOString() : null, created.toISOString()],
  );
  amitSent++;
}
// Keep Amit's plan proposal_used honest with what he "sent".
await q("update user_plans set proposal_used = least($2, proposal_quota) where profile_id=$1 and terms->>'seed'='module5'", [amit, amitSent]);

// ---- 5. Visits (buyer: Amit) — every section/status/outcome ----------------
const mkVisit = async (listingId, posterId, offsetHours, status, outcome, note, cancel) => {
  const when = new Date(now.getTime() + offsetHours * 36e5);
  await q(
    `insert into public.visits (listing_id, buyer_id, poster_id, scheduled_at, note, status, outcome, cancel_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [listingId, amit, posterId, when.toISOString(), note, status, outcome, cancel],
  );
};
const visitListing = rkListings[0] ?? snehaListing ?? amitListing;
const visitPoster = rk;
await mkVisit(visitListing, visitPoster, 26, "confirmed", null, "Looking forward to it", null);      // tomorrow
await mkVisit(snehaListing ?? visitListing, sneha, 24 * 4, "proposed", null, null, null);             // this week
await mkVisit(visitListing, visitPoster, -20, "confirmed", null, null, null);                          // past-due → outcome prompt
await mkVisit(visitListing, visitPoster, -24 * 5, "completed", "done", null, null);                    // completed
await mkVisit(snehaListing ?? visitListing, sneha, -24 * 3, "cancelled", "cancelled", null, "Schedule conflict"); // cancelled

// ---- 6. Leads — broker (RK) + builder (Suresh), all stages -----------------
const leadPeople = [poster, sneha, divya, kiran, sanjay, pooja]; // buyers/interested parties
const stages = ["new", "contacted", "visit", "negotiation", "closed_won", "closed_lost"];
const activities = {
  new: "Inquiry received", contacted: "Called — interested", visit: "Visit confirmed for Sat",
  negotiation: "Negotiating price", closed_won: "Deal closed", closed_lost: "Chose another property",
};
const mkLead = async (owner, listingId, i) => {
  const stage = stages[i % stages.length];
  const person = leadPeople[i % leadPeople.length];
  if (person === owner) return;
  await q(
    `insert into public.leads (owner_id, lead_profile_id, listing_id, source, stage, last_activity, last_activity_at, notes)
     values ($1,$2,$3,$4,$5,$6, now() - ($7 || ' hours')::interval, $8)`,
    [owner, person, listingId, i % 3 === 0 ? "proposal" : i % 3 === 1 ? "visit" : "inquiry",
     stage, activities[stage], String(i * 6), JSON.stringify(i === 2 ? [{ text: "Prefers ground floor", at: now.toISOString() }] : [])],
  );
};
for (let i = 0; i < 6; i++) await mkLead(rk, rkListings[i % rkListings.length] ?? null, i);
// Builder pipeline: a couple of leads too.
for (let i = 0; i < 3; i++) await mkLead(suresh, null, i);

// ---- report -----------------------------------------------------------------
const counts = await one(`select
  (select count(*) from proposals) proposals,
  (select count(*) from proposals where poster_id=$1) received,
  (select count(*) from proposals where sender_id=$2) sent_by_amit,
  (select count(*) from visits where buyer_id=$2) visits,
  (select count(*) from leads where owner_id=$3) rk_leads,
  (select count(*) from leads where owner_id=$4) suresh_leads`, [poster, amit, rk, suresh]);
console.log("Seeded Module 5:");
console.log(`  requirement (poster Rahul): ${reqId}`);
console.log(`  proposals total=${counts.proposals} received=${counts.received} sentByAmit=${counts.sent_by_amit}`);
console.log(`  visits(Amit)=${counts.visits}  leads RK=${counts.rk_leads} Suresh=${counts.suresh_leads}`);
console.log(`  Amit (unlocked viewer + sender): ${amit}`);
console.log(`  RK Properties (leads/broker): ${rk}   Suresh (builder): ${suresh}`);
console.log("Status spread (received):",
  (await q("select status, count(*) from proposals where poster_id=$1 group by status order by status", [poster])).rows);
await c.end();
