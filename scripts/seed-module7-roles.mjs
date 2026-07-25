/**
 * Seeds Module 7 chat so EACH role hero — owner (Rahul Mehta), broker (Amit
 * Shah), builder (Arjun Iyer) — has ≥10 real conversations in EVERY one of the
 * four Messages tabs, with a realistic status/state mix, exactly as the P7
 * design shows them:
 *
 *   My Listings      — 10 accepted inquiries FROM buyers on the hero's listing
 *                      (+ a couple pending → Requests, + 1 declined → cooldown)
 *   My Inquiries     — 10 inquiries the hero SENT on other owners' listings
 *                      (mix: accepted / pending / declined)
 *   Requirement Leads— 10 accepted proposals ON the hero's requirement
 *   My Responses     — 10 proposals the hero SENT on other requirements
 *                      (mix: accepted / pending / declined / expired)
 *
 * Everything is a real row (thread + participants + messages + source
 * inquiry/proposal). Idempotent: re-inserts only what's missing, tops each tab
 * up to 10. Dev only (direct Postgres).  node scripts/seed-module7-roles.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = new pg.Client({ host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres", password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const q = (s, p) => c.query(s, p);
const one = async (s, p) => (await q(s, p)).rows[0];
const rows = async (s, p) => (await q(s, p)).rows;
const idByPhone = async (phone) => (await one("select id from profiles where phone=$1", [phone]))?.id;

const HEROES = [
  { role: "owner", phone: "+919999000001", name: "Rahul Mehta" },
  { role: "broker", phone: "+919999000007", name: "Amit Shah" },
  { role: "builder", phone: "+919999000017", name: "Arjun Iyer" },
];

const OPENERS = [
  "Hi, I'm interested in this property. Is it still available?",
  "Can we schedule a site visit this weekend?",
  "Is the price negotiable for a serious buyer?",
  "What's the carpet area and floor?",
  "Are documents and index copy ready?",
  "Is it available for immediate possession?",
  "Any maintenance charges I should know about?",
  "Could you share a few more photos?",
  "Is parking included with the unit?",
  "Is this owner-occupied or rented currently?",
  "Loved the location — can we talk numbers?",
  "Is a home loan already sanctioned on this?",
  "What's the best time to visit this week?",
];
const PROPOSAL_MSGS = [
  "I have a matching property that fits your budget — sharing details.",
  "A few good options in your preferred area. Can we discuss?",
  "Ready-to-move unit that matches your requirement.",
  "I represent a verified owner with exactly this configuration.",
  "Slightly above budget but great value — worth a look.",
  "Resale unit, well maintained, matches your BHK need.",
  "New project launch that fits your requirement perfectly.",
  "Have two shortlisted options — when can we connect?",
  "Owner is motivated to close quickly on this one.",
  "Premium listing in your target society — details inside.",
];

// SQL mirrors of ensureInquiry/ProposalThread (kept idempotent) ---------------
async function growInquiry({ buyer, listing_id, poster, message, status, ageH }) {
  let inq = await one("select id from inquiries where profile_id=$1 and listing_id=$2", [buyer, listing_id]);
  if (!inq) inq = await one(
    "insert into inquiries (profile_id, listing_id, poster_id, message, intents, share_number, status) values ($1,$2,$3,$4,'{}',true,$5) returning id",
    [buyer, listing_id, poster, message, status === "declined" ? "declined" : status === "accepted" ? "accepted" : "sent"],
  );
  let t = await one("select id from chat_threads where kind='inquiry' and buyer_id=$1 and listing_id=$2", [buyer, listing_id]);
  if (!t) {
    t = await one(
      `insert into chat_threads (kind, buyer_id, poster_id, listing_id, source_inquiry_id, status, last_message_preview, last_message_kind, last_message_sender, created_at)
       values ('inquiry',$1,$2,$3,$4,$5,left($6,140),'text',$1, now() - ($7||' hours')::interval) returning id`,
      [buyer, poster, listing_id, inq.id, status, message, ageH],
    );
    await q("insert into thread_participants (thread_id, profile_id, role) values ($1,$2,'buyer'),($1,$3,'poster') on conflict do nothing", [t.id, buyer, poster]);
    await q("insert into chat_messages (thread_id, sender_id, kind, body, created_at) values ($1,$2,'text',$3, now() - ($4||' hours')::interval)", [t.id, buyer, message, ageH]);
    // A short reply on accepted threads so the preview + unread feel real.
    if (status === "accepted") await q("insert into chat_messages (thread_id, sender_id, kind, body, created_at) values ($1,$2,'text',$3, now() - (($4-1)||' hours')::interval)", [t.id, poster, "Yes, still available. Happy to help!", ageH]);
  }
  await q("update chat_threads set status=$2 where id=$1", [t.id, status]);
  await q("update inquiries set thread_id=$1, status=$3 where id=$2", [t.id, inq.id, status === "declined" ? "declined" : status === "accepted" ? "accepted" : "sent"]);
  await q("update chat_threads set cooldown_until = case when $2::text='declined' then now()+interval '30 days' else null end where id=$1", [t.id, status]);
  return t.id;
}

async function growProposal({ sender, poster, requirement_id, message, status, ageH }) {
  let prop = await one("select id from proposals where requirement_id=$1 and sender_id=$2", [requirement_id, sender]);
  if (!prop) prop = await one(
    "insert into proposals (requirement_id, sender_id, poster_id, mode, message, status, expires_at) values ($1,$2,$3,'chat',$4,$5, now()+interval '30 days') returning id",
    [requirement_id, sender, poster, message, status],
  );
  await q("update proposals set status=$2, responded_at=case when $3 then now() else responded_at end where id=$1", [prop.id, status, status === "accepted" || status === "declined"]);
  const threadStatus = status === "accepted" ? "accepted" : "pending";
  let t = await one("select id from chat_threads where source_proposal_id=$1", [prop.id]);
  if (!t) {
    t = await one(
      `insert into chat_threads (kind, buyer_id, poster_id, requirement_id, source_proposal_id, status, last_message_preview, last_message_kind, last_message_sender, created_at)
       values ('proposal',$1,$2,$3,$4,$5,left($6,140),'text',$1, now() - ($7||' hours')::interval) returning id`,
      [sender, poster, requirement_id, prop.id, threadStatus, message, ageH],
    );
    await q("insert into thread_participants (thread_id, profile_id, role) values ($1,$2,'buyer'),($1,$3,'poster') on conflict do nothing", [t.id, sender, poster]);
    await q("insert into chat_messages (thread_id, sender_id, kind, body, created_at) values ($1,$2,'text',$3, now() - ($4||' hours')::interval)", [t.id, sender, message, ageH]);
    if (status === "accepted") await q("insert into chat_messages (thread_id, sender_id, kind, body, created_at) values ($1,$2,'text',$3, now() - (($4-1)||' hours')::interval)", [t.id, poster, "Thanks — this looks promising. Let's talk.", ageH]);
  }
  await q("update chat_threads set status=$2 where id=$1", [t.id, threadStatus]);
  await q("update proposals set thread_id=$1 where id=$2", [t.id, prop.id]);
  return t.id;
}

// Ensure the hero owns at least one live listing + one live requirement, cloning
// a real one if they have none (the builder hero starts with zero).
async function ensureOwnListing(heroId) {
  let l = await one("select id from listings where profile_id=$1 and status='live' order by created_at desc limit 1", [heroId]);
  if (l) return l.id;
  l = await one(
    `insert into listings (profile_id, type_code, kind, status, availability, title, description, price_paise, area_label, cover_url, photo_count, live_at, approved_at, submitted_at, created_at)
     select $1, type_code, kind, 'live', 'available', title, description, price_paise, area_label, cover_url, coalesce(photo_count,1), now(), now(), now(), now()
     from listings where status='live' and profile_id<>$1 order by created_at desc limit 1 returning id`,
    [heroId],
  );
  return l.id;
}
async function ensureOwnRequirement(heroId) {
  let r = await one("select id from requirements where profile_id=$1 order by created_at desc limit 1", [heroId]);
  if (r) { await q("update requirements set status='live', is_active=true, expires_at=now()+interval '25 days' where id=$1", [r.id]); return r.id; }
  r = await one(
    `insert into requirements (profile_id, type_code, kind, bhk, budget_min_paise, budget_max_paise, area_label, status, is_active, expires_at, live_at, approved_at, submitted_at, created_at)
     select $1, type_code, kind, bhk, budget_min_paise, budget_max_paise, area_label, 'live', true, now()+interval '25 days', now(), now(), now(), now()
     from requirements where profile_id<>$1 order by created_at desc limit 1 returning id`,
    [heroId],
  );
  return r.id;
}

const pick = (arr, n) => arr.slice(0, n);
const statusMix = (i) => (i < 7 ? "accepted" : i < 9 ? "pending" : "declined"); // 7/2/1
const respMix = (i) => (i < 4 ? "accepted" : i < 7 ? "pending" : i < 9 ? "declined" : "expired"); // 4/3/2/1

for (const hero of HEROES) {
  const H = await idByPhone(hero.phone);
  const others = (await rows("select id from profiles where id<>$1 and role in ('owner','broker','builder') order by created_at", [H])).map((r) => r.id);
  const counterparties = pick(others, 13);

  const myListing = await ensureOwnListing(H);
  const myReq = await ensureOwnRequirement(H);

  // ---- Tab 1: My Listings — buyers inquire on hero's listing ---------------
  // 10 accepted (fills the tab) + 2 pending (Requests) + 1 declined (cooldown).
  for (let i = 0; i < 13; i++) {
    const buyer = counterparties[i];
    const status = i < 10 ? "accepted" : i < 12 ? "pending" : "declined";
    await growInquiry({ buyer, listing_id: myListing, poster: H, message: OPENERS[i % OPENERS.length], status, ageH: 3 + i * 2 });
  }

  // ---- Tab 2: My Inquiries — hero inquires on 10 other listings ------------
  const otherListings = await rows(
    "select id, profile_id from listings where status='live' and profile_id<>$1 order by created_at desc limit 10", [H],
  );
  for (let i = 0; i < otherListings.length; i++) {
    const l = otherListings[i];
    await growInquiry({ buyer: H, listing_id: l.id, poster: l.profile_id, message: OPENERS[(i + 3) % OPENERS.length], status: statusMix(i), ageH: 4 + i * 3 });
  }

  // ---- Tab 3: Requirement Leads — 10 accepted proposals on hero's req ------
  for (let i = 0; i < 10; i++) {
    const sender = counterparties[i];
    await growProposal({ sender, poster: H, requirement_id: myReq, message: PROPOSAL_MSGS[i % PROPOSAL_MSGS.length], status: "accepted", ageH: 5 + i * 2 });
  }

  // ---- Tab 4: My Responses — hero proposes on 10 other requirements --------
  const otherReqs = await rows(
    "select id, profile_id from requirements where profile_id<>$1 order by created_at desc limit 10", [H],
  );
  for (let i = 0; i < otherReqs.length; i++) {
    const r = otherReqs[i];
    await growProposal({ sender: H, poster: r.profile_id, requirement_id: r.id, message: PROPOSAL_MSGS[(i + 2) % PROPOSAL_MSGS.length], status: respMix(i), ageH: 6 + i * 2 });
  }

  // Per-side state variety on a few of the hero's accepted threads.
  const acc = (await rows("select id from chat_threads where (buyer_id=$1 or poster_id=$1) and status='accepted' order by last_message_at desc limit 4", [H])).map((r) => r.id);
  if (acc[0]) await q("update thread_participants set pinned=true where thread_id=$1 and profile_id=$2", [acc[0], H]);
  if (acc[1]) await q("update thread_participants set muted=true where thread_id=$1 and profile_id=$2", [acc[1], H]);
  if (acc[2]) await q("update thread_participants set archived=true where thread_id=$1 and profile_id=$2", [acc[2], H]);

  // Per-tab proof for this hero.
  const proof = await one(
    `select
       (select count(*) from chat_threads where poster_id=$1 and kind='inquiry'  and status='accepted') my_listings,
       (select count(*) from chat_threads where buyer_id=$1  and kind='inquiry')                          my_inquiries,
       (select count(*) from chat_threads where poster_id=$1 and kind='proposal' and status='accepted') req_leads,
       (select count(*) from chat_threads where buyer_id=$1  and kind='proposal')                        my_responses`,
    [H],
  );
  console.log(`${hero.role.padEnd(7)} ${hero.name.padEnd(12)} → My Listings ${proof.my_listings} · My Inquiries ${proof.my_inquiries} · Requirement Leads ${proof.req_leads} · My Responses ${proof.my_responses}`);
}

const totals = await one("select (select count(*) from chat_threads) threads, (select count(*) from chat_messages) messages, (select count(*) from proposals) proposals, (select count(*) from inquiries) inquiries");
console.log("\nTOTALS:", totals);
await c.end();
console.log("seed-module7-roles done.");
