/**
 * Seeds Module 7 (P7 Chat, Inquiry & Number system) so every screen, tab and
 * state in the design is real — never an empty screen:
 *   - grows a chat_thread (+ participants + first message) from EVERY existing
 *     inquiry and proposal (idempotent — reuses a thread if already grown);
 *   - promotes a realistic status mix: accepted / pending (→ Requests) / declined
 *     (cooldown);
 *   - enriches showcase threads with the full bubble set: back-and-forth text,
 *     a photo, reactions, a quoted reply, the number request→allow→NumberCard
 *     →continuity flow, a visit proposal→confirmed, system lines, a deleted
 *     bubble, and per-side pin/mute/archive + a block + a custom template;
 *   - guarantees the broker hero (Amit Shah) has ALL FOUR tabs populated.
 *
 * Idempotent. Dev only (direct Postgres).  node scripts/seed-module7.mjs
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
const idByPhone = async (phone) => (await one("select id from profiles where phone=$1", [phone]))?.id;

const AMIT = await idByPhone("+919999000007");   // broker hero — all 4 tabs
const SNEHA = await idByPhone("+919999000004");   // owner — My Listings
const RAHUL = await idByPhone("+919999000001");   // owner — Requirement Leads
const RK = await idByPhone("+919825012345");      // broker — busy poster
const SANJAY = await idByPhone("+919999000011");  // broker — buyer/proposer
const DIVYA = await idByPhone("+919999000012");   // broker — proposer
const NEHA = await idByPhone("+919999000006");    // owner — buyer
const PRIYA = await idByPhone("+919999000002");   // owner — buyer

// ---------------------------------------------------------------------------
// thread growers (SQL mirror of lib/chat/service ensureInquiry/ProposalThread)
// ---------------------------------------------------------------------------
async function growInquiry(inq, status) {
  let t = await one("select id from chat_threads where kind='inquiry' and buyer_id=$1 and listing_id=$2", [inq.profile_id, inq.listing_id]);
  if (!t) {
    t = await one(
      `insert into chat_threads (kind, buyer_id, poster_id, listing_id, source_inquiry_id, status, last_message_preview, last_message_kind, last_message_sender, created_at)
       values ('inquiry',$1,$2,$3,$4,$5,left($6,140),'text',$1, now() - ($7||' hours')::interval) returning id`,
      [inq.profile_id, inq.poster_id, inq.listing_id, inq.id, status, inq.message, inq.age ?? 24],
    );
    await q("insert into thread_participants (thread_id, profile_id, role) values ($1,$2,'buyer'),($1,$3,'poster') on conflict do nothing", [t.id, inq.profile_id, inq.poster_id]);
    await q("insert into chat_messages (thread_id, sender_id, kind, body, created_at) values ($1,$2,'text',$3, now() - ($4||' hours')::interval)", [t.id, inq.profile_id, inq.message, inq.age ?? 24]);
  }
  await q("update chat_threads set status=$2 where id=$1", [t.id, status]);
  await q("update inquiries set thread_id=$1, status=$3 where id=$2", [t.id, inq.id, status === "declined" ? "declined" : status === "accepted" ? "accepted" : "sent"]);
  if (status === "declined") await q("update chat_threads set cooldown_until=now()+interval '30 days' where id=$1", [t.id]);
  return t.id;
}

async function growProposal(p) {
  let t = await one("select id from chat_threads where source_proposal_id=$1", [p.id]);
  const status = p.status === "accepted" ? "accepted" : p.status === "declined" || p.status === "not_relevant" || p.status === "expired" || p.status === "fulfilled" ? (p.status === "accepted" ? "accepted" : "pending") : "pending";
  const threadStatus = p.status === "accepted" ? "accepted" : "pending";
  if (!t) {
    t = await one(
      `insert into chat_threads (kind, buyer_id, poster_id, requirement_id, attached_listing_id, source_proposal_id, status, last_message_preview, last_message_kind, last_message_sender, created_at)
       values ('proposal',$1,$2,$3,$4,$5,$6,left($7,140),'text',$1, now() - interval '20 hours') returning id`,
      [p.sender_id, p.poster_id, p.requirement_id, p.mode === "listing" ? p.listing_id : null, p.id, threadStatus, p.message],
    );
    await q("insert into thread_participants (thread_id, profile_id, role) values ($1,$2,'buyer'),($1,$3,'poster') on conflict do nothing", [t.id, p.sender_id, p.poster_id]);
    await q("insert into chat_messages (thread_id, sender_id, kind, body, created_at) values ($1,$2,'text',$3, now() - interval '20 hours')", [t.id, p.sender_id, p.message]);
  }
  await q("update chat_threads set status=$2 where id=$1", [t.id, threadStatus]);
  await q("update proposals set thread_id=$1 where id=$2", [t.id, p.id]);
  return t.id;
}

// ---------------------------------------------------------------------------
// 1. Grow every inquiry — status mix (accepted default; first 2 pending; 1 declined)
// ---------------------------------------------------------------------------
const inqs = (await q("select id, profile_id, listing_id, poster_id, message, created_at from inquiries order by created_at desc")).rows
  .map((r, i) => ({ ...r, age: 2 + i * 3 }));
let pendingKept = 0, declinedKept = 0;
for (const inq of inqs) {
  let status = "accepted";
  if (pendingKept < 3) { status = "pending"; pendingKept++; }
  else if (declinedKept < 1) { status = "declined"; declinedKept++; }
  await growInquiry(inq, status);
}
console.log(`grew ${inqs.length} inquiry threads (${pendingKept} pending, ${declinedKept} declined, rest accepted)`);

// ---------------------------------------------------------------------------
// 2. Ensure the broker hero (Amit) has tab 1 (My Listings) + tab 3 (Requirement Leads)
// ---------------------------------------------------------------------------
// tab 1: inquiries FROM buyers ON Amit's live listings
const amitListings = (await q("select id, title from listings where profile_id=$1 and status='live' limit 3", [AMIT])).rows;
const buyers = [SANJAY, NEHA, PRIYA];
const openers = [
  "Hi, I'm interested in your listing. Is it still available?",
  "Looks good — can we schedule a site visit this weekend?",
  "Is the price negotiable for a serious buyer?",
];
for (let i = 0; i < amitListings.length; i++) {
  const l = amitListings[i], b = buyers[i];
  let inq = await one("select id from inquiries where profile_id=$1 and listing_id=$2", [b, l.id]);
  if (!inq) inq = await one("insert into inquiries (profile_id, listing_id, poster_id, message, intents, share_number, status) values ($1,$2,$3,$4,'{}',true,'sent') returning id", [b, l.id, AMIT, openers[i]]);
  await growInquiry({ id: inq.id, profile_id: b, listing_id: l.id, poster_id: AMIT, message: openers[i], age: 4 + i * 6 }, i === 0 ? "accepted" : i === 1 ? "accepted" : "pending");
}
console.log(`ensured Amit My-Listings: ${amitListings.length} inbound inquiry threads`);

// tab 3: Amit's requirement live + proposals on it
const amitReq = await one("select id from requirements where profile_id=$1 order by created_at desc limit 1", [AMIT]);
if (amitReq) {
  await q("update requirements set status='live', is_active=true, expires_at=now()+interval '25 days' where id=$1", [amitReq.id]);
  const proposers = [{ id: SANJAY, msg: "Hi, I have a 3 BHK in Mavdi that fits your budget. Sharing details." }, { id: DIVYA, msg: "I have a few matching options in Mavdi — can we discuss?" }];
  for (let i = 0; i < proposers.length; i++) {
    const pr = proposers[i];
    let prop = await one("select id, status from proposals where requirement_id=$1 and sender_id=$2", [amitReq.id, pr.id]);
    if (!prop) prop = await one("insert into proposals (requirement_id, sender_id, poster_id, mode, message, status, expires_at) values ($1,$2,$3,'chat',$4,$5, now()+interval '30 days') returning id, status", [amitReq.id, pr.id, AMIT, pr.msg, i === 0 ? "accepted" : "pending"]);
    await growProposal({ id: prop.id, sender_id: pr.id, poster_id: AMIT, requirement_id: amitReq.id, mode: "chat", listing_id: null, message: pr.msg, status: prop.status });
  }
  console.log("ensured Amit Requirement-Leads: 2 proposal threads");
}

// ---------------------------------------------------------------------------
// 3. Grow every proposal thread (tab 3 posters + tab 4 senders)
// ---------------------------------------------------------------------------
const props = (await q("select id, requirement_id, sender_id, poster_id, mode, listing_id, message, status from proposals")).rows;
for (const p of props) await growProposal(p);
console.log(`grew ${props.length} proposal threads`);

// ---------------------------------------------------------------------------
// 4. Enrich a showcase thread with the FULL bubble set (Amit ↔ RK, 3 BHK Shree Residency)
// ---------------------------------------------------------------------------
const showcase = await one(
  "select id, buyer_id, poster_id, listing_id from chat_threads where kind='inquiry' and buyer_id=$1 and poster_id=$2 and status='accepted' limit 1",
  [AMIT, RK],
);
if (showcase) {
  const T = showcase.id, BUYER = showcase.buyer_id, POSTER = showcase.poster_id;
  // Clear prior enrichment so re-runs stay clean (keep the seed opener).
  await q("delete from chat_messages where thread_id=$1 and kind<>'text'", [T]);
  await q("delete from chat_messages where thread_id=$1 and kind='text' and created_at > now() - interval '19 hours'", [T]);
  await q("delete from number_requests where thread_id=$1", [T]);

  const im = async (senderId, kind, body, meta, minsAgo) =>
    (await one(
      "insert into chat_messages (thread_id, sender_id, kind, body, meta, created_at) values ($1,$2,$3,$4,$5, now() - ($6||' minutes')::interval) returning id",
      [T, senderId, kind, body, meta ?? {}, minsAgo],
    )).id;

  // system safety card (first)
  await im(null, "system", "Never pay token or advance before a site visit. HomzList is not responsible for payments made outside the platform.", { subtype: "safety" }, 600);
  const b1 = await im(POSTER, "text", "Yes, it's available. When would you like to visit?", {}, 90);
  const b2 = await im(BUYER, "text", "This weekend works. Is the price negotiable?", {}, 84);
  // quoted reply → b1
  await q("insert into chat_messages (thread_id, sender_id, kind, body, reply_to, created_at) values ($1,$2,'text',$3,$4, now() - interval '80 minutes')", [T, POSTER, "Great — Saturday 11 AM then?", b1]);
  // reaction on a received bubble
  const react = await im(POSTER, "text", "Sure, Saturday works.", {}, 70);
  await q("update chat_messages set reactions=$2 where id=$1", [react, JSON.stringify({ "👍": [BUYER] })]);
  // photo message
  const cover = (await one("select cover_url from listings where id=$1", [showcase.listing_id]))?.cover_url;
  if (cover) await im(BUYER, "photo", null, { }, 60), await q("update chat_messages set photo_url=$2, photo_w=1080, photo_h=1080 where thread_id=$1 and kind='photo'", [T, cover]);
  // link preview + caution
  await im(BUYER, "link", "Check this project: https://homzlist.com/property/green-valley", { title: "Green Valley Heights — Shreeji Builders", domain: "homzlist.com", external: false }, 55);
  // deleted bubble
  const del = await im(BUYER, "text", "wrong chat sorry", {}, 50);
  await q("update chat_messages set deleted_all=true, body=null where id=$1", [del]);
  // number request → allow → system line → NumberCard → continuity
  const nrCard = await im(BUYER, "number_request", null, { requesterId: BUYER }, 40);
  const nr = await one("insert into number_requests (thread_id, requester_id, target_id, status, message_id, responded_at, created_at) values ($1,$2,$3,'allowed',$4, now() - interval '38 minutes', now() - interval '40 minutes') returning id", [T, BUYER, POSTER, nrCard]);
  await im(null, "system", "RK Properties shared their number", { subtype: "number-shared" }, 38);
  await im(POSTER, "number_card", null, { owner: "poster" }, 37);
  await im(null, "continuity", "Did you connect on call?", {}, 36);
  // visit proposal → confirmed visit row
  const when = "now() + interval '2 days'";
  const visit = await one(`insert into visits (listing_id, buyer_id, poster_id, scheduled_at, status, thread_id, created_at) values ($1,$2,$3, ${when}, 'confirmed', $4, now() - interval '30 minutes') returning id`, [showcase.listing_id, BUYER, POSTER, T]);
  await im(BUYER, "visit_proposal", "Proposed a site visit", { visitId: visit.id, scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString() }, 30);
  await im(POSTER, "visit_confirmed", "Site visit confirmed", { visitId: visit.id, scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString() }, 28);
  // a recent unread received message (for the unread divider + badge on the buyer side)
  await im(POSTER, "text", "See you Saturday! I'll share the exact location pin.", {}, 5);
  // buyer has NOT read the last poster message → make buyer's read cursor older
  await q("update thread_participants set last_read_at = now() - interval '20 minutes' where thread_id=$1 and profile_id=$2", [T, BUYER]);
  await q("update thread_participants set last_read_at = now() where thread_id=$1 and profile_id=$2", [T, POSTER]);
  console.log("enriched showcase thread (Amit ↔ RK) with full bubble set + number flow + visit");
}

// ---------------------------------------------------------------------------
// 5. Per-side state: pin / mute / archive · a block · a custom template
// ---------------------------------------------------------------------------
const amitThreads = (await q("select id from chat_threads where (buyer_id=$1 or poster_id=$1) and status='accepted' order by last_message_at desc", [AMIT])).rows;
if (amitThreads[0]) await q("update thread_participants set pinned=true where thread_id=$1 and profile_id=$2", [amitThreads[0].id, AMIT]);
if (amitThreads[1]) await q("update thread_participants set muted=true where thread_id=$1 and profile_id=$2", [amitThreads[1].id, AMIT]);
if (amitThreads[2]) await q("update thread_participants set archived=true where thread_id=$1 and profile_id=$2", [amitThreads[2].id, AMIT]);

// A block: Amit blocks the participant of a low-priority accepted thread
if (amitThreads[3]) {
  const other = (await one("select case when buyer_id=$2 then poster_id else buyer_id end o from chat_threads where id=$1", [amitThreads[3].id, AMIT]))?.o;
  if (other) await q("insert into chat_blocks (blocker_id, blocked_id) values ($1,$2) on conflict do nothing", [AMIT, other]);
}

// Custom quick-reply template for Amit
await q("insert into chat_templates (profile_id, body, sort) select $1,$2,100 where not exists (select 1 from chat_templates where profile_id=$1 and body=$2)", [AMIT, "I'm available for a call between 6–8 PM on weekdays."]);
console.log("set pin/mute/archive + block + custom template");

// ---------------------------------------------------------------------------
// proof
// ---------------------------------------------------------------------------
const counts = await one(`select
  (select count(*) from chat_threads) threads,
  (select count(*) from chat_threads where status='pending') pending,
  (select count(*) from chat_threads where status='declined') declined,
  (select count(*) from chat_messages) messages,
  (select count(*) from number_requests where status='allowed') numbers_allowed,
  (select count(*) from chat_blocks) blocks,
  (select count(*) from chat_templates where profile_id is not null) custom_templates`);
console.log("\nPROOF:", counts);
await c.end();
console.log("seed-module7 done.");
