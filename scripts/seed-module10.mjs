/**
 * Module 10 seed — every notification type, every group, every state, for a
 * real user of each role (owner / broker / builder / buyer).
 *
 * Deliberately writes through `notify_upsert`, the SAME Postgres function the
 * TypeScript engine calls. So the seeded rows are produced by the real write
 * path (category, marketing flag, default actions and deep link all resolved
 * from `notification_types`) rather than hand-built INSERTs that could drift
 * from what production writes.
 *
 *   node scripts/seed-module10.mjs            # reset + seed (idempotent)
 *   node scripts/seed-module10.mjs --keep     # add on top of what's there
 *
 * It CLEARS its own rows first by default. Running it twice without that put a
 * second copy of every row in the inbox, which reads like the producer is
 * double-firing — the exact kind of thing a seeder must never fake. Only rows
 * tagged `data ? 'seed'` are removed; real production rows are never touched.
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

const c = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: E.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const HOURS = (n) => `${n} hours`;
const DAYS = (n) => `${n} days`;

await c.connect();

if (!process.argv.includes("--keep")) {
  const r = await c.query(`delete from notifications where data ? 'seed'`);
  console.log(`reset: removed ${r.rowCount} previously seeded notification(s)`);
}

// ---- pick one real, active user per role ----------------------------------
const pick = async (role, notIn = []) => {
  const { rows } = await c.query(
    `select id, name from profiles
      where role = $1 and is_registered and state = 'active'
        and ($2::uuid[] is null or not (id = any($2)))
      order by created_at limit 1`,
    [role, notIn.length ? notIn : null],
  );
  return rows[0];
};

const owner = await pick("owner");
const broker = await pick("broker");
const builder = await pick("builder");
const buyer = await pick("owner", [owner.id]); // a second owner acts as the buyer side
if (!owner || !broker || !builder || !buyer) throw new Error("need at least one active user per role");

// ---- real subjects to point the rows at ------------------------------------
const listingOf = async (profileId) => {
  const { rows } = await c.query(
    `select id, title, area_label, cover_url from listings
      where profile_id = $1 and status = 'live' order by created_at desc limit 1`,
    [profileId],
  );
  return rows[0] ?? null;
};
const anyListing = async () => (await c.query(
  `select id, title, area_label, cover_url, profile_id from listings where status='live' order by created_at desc limit 1`,
)).rows[0];

const threadFor = async (profileId) => (await c.query(
  `select id, buyer_id, poster_id from chat_threads where poster_id = $1 or buyer_id = $1 limit 1`, [profileId],
)).rows[0] ?? null;

// `own*` is a listing the user REALLY owns — the rows that carry an owner-only
// action (Still available? Yes/No) must point at one, or the button would 404
// on tap and demo a dead control.
const ownerOwn = await listingOf(owner.id);
const brokerOwn = await listingOf(broker.id);
const builderOwn = await listingOf(builder.id);
const ownerListing = ownerOwn ?? (await anyListing());
const brokerListing = brokerOwn ?? ownerListing;
const builderListing = builderOwn ?? ownerListing;
const ownerThread = await threadFor(owner.id);
const brokerThread = await threadFor(broker.id);

const label = (l) => (l ? [l.title, l.area_label].filter(Boolean).join(", ") : "your listing");

/**
 * One seeded notification. `age` backdates BOTH created_at and last_event_at so
 * the row lands in the intended Today / This week / Earlier bucket — the group
 * is computed from last_event_at, never stored.
 */
async function seed(profileId, type, title, opts = {}) {
  const { rows } = await c.query(
    `select * from notify_upsert($1,$2::notification_type,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,null)`,
    [
      profileId, type, title, opts.body ?? null, opts.groupKey ?? null, opts.href ?? null,
      opts.thumb ?? null, opts.actions ? JSON.stringify(opts.actions) : null,
      opts.threadId ?? null, opts.actorId ?? null,
      JSON.stringify({ seed: "module10", ...(opts.data ?? {}) }),
      opts.entityKind ?? null, opts.entityId ?? null,
    ],
  );
  const id = rows[0].id;
  if (opts.age) {
    await c.query(
      `update notifications set created_at = now() - $2::interval, last_event_at = now() - $2::interval where id = $1`,
      [id, opts.age],
    );
  }
  if (opts.read) await c.query(`update notifications set read_at = now() where id = $1`, [id]);
  // Mirror what the engine records, so the ledger is not empty for seeded rows.
  await c.query(
    `insert into notification_deliveries (notification_id, profile_id, channel, status, reason)
     values ($1,$2,'inapp','sent',null) on conflict do nothing`, [id, profileId],
  );
  return id;
}

// ===========================================================================
// OWNER — the design's own row list, in the design's own words
// ===========================================================================
console.log(`owner   : ${owner.name}`);
await seed(owner.id, "inquiry_received", `**${buyer.name}** sent an inquiry on your ${label(ownerListing)}`, {
  body: `${buyer.name} sent you an inquiry`, age: "12 minutes", actorId: buyer.id,
  threadId: ownerThread?.id ?? null, thumb: ownerListing?.cover_url ?? null,
  entityKind: "listing", entityId: ownerListing?.id ?? null,
  href: ownerThread ? `/messages/${ownerThread.id}` : "/messages",
});
await seed(owner.id, "number_requested", `**${broker.name}** requested your phone number`, {
  body: `${broker.name} requested your phone number`, age: "25 minutes", actorId: broker.id,
  threadId: ownerThread?.id ?? null, href: ownerThread ? `/messages/${ownerThread.id}` : "/messages",
});
await seed(owner.id, "listing_approved", `Your listing **${label(ownerListing)}** is now live`, {
  body: "It is visible in the feed and in search.", age: HOURS(1),
  thumb: ownerListing?.cover_url ?? null, entityKind: "listing", entityId: ownerListing?.id ?? null,
  href: ownerListing ? `/listings/${ownerListing.id}` : "/listings",
});
await seed(owner.id, "listing_changes_requested", `Changes requested on **${label(brokerListing)}** — photos are too dark`, {
  body: "photos are too dark", age: HOURS(3), entityKind: "listing", entityId: brokerListing?.id ?? null,
  href: brokerListing ? `/create/form?edit=${brokerListing.id}` : "/listings",
});
await seed(owner.id, "listing_rejected", "Your listing was rejected — **Duplicate listing**", {
  body: "Fix the reason and re-submit.", age: HOURS(4),
  entityKind: "listing", entityId: ownerListing?.id ?? null,
  data: { rejectReason: "Duplicate listing" },
  href: ownerListing ? `/listings/${ownerListing.id}` : "/listings",
});
if (ownerOwn) await seed(owner.id, "still_available", `Is **${label(ownerListing)}** still available? Listings are checked every 2 months.`, {
  body: "Answer to keep it live — no answer hides it in 15 days.", age: DAYS(2), read: true,
  entityKind: "listing", entityId: ownerListing?.id ?? null,
  href: ownerListing ? `/listings/${ownerListing.id}` : "/listings",
});
await seed(owner.id, "plan_expiring", "Your **₹2,999 plan** expires in 7 days", {
  body: "Renew to keep your listings live — expired plans stop new posts.", age: DAYS(3), read: true,
});
await seed(owner.id, "boost_approved", `Your boost is **live** on ${label(ownerListing)}`, {
  body: "Running till 12 Aug · Satellite area", age: DAYS(3), read: true,
});
await seed(owner.id, "boost_expiring", "Your **boost ends tomorrow**", {
  body: "7 Days · Satellite area · ₹1,499", age: DAYS(3), read: true,
  actions: [{ key: "renew_boost", label: "Renew — ₹1,499", style: "primary" }],
});
await seed(owner.id, "payment_success", "Payment successful — **₹999 Listing Plan**", {
  body: "Invoice HL-2026-0114. Tap to view or download it.", age: DAYS(12), read: true,
});
await seed(owner.id, "payment_failed", "Payment failed — **₹499 top-up**", {
  body: "Card declined by the bank.", age: DAYS(14), read: true,
});
await seed(owner.id, "refund_processed", "**₹999 refunded** — it will reach your account in 5–7 days", {
  body: "Boost was not approved.", age: DAYS(16), read: true,
});
await seed(owner.id, "report_outcome", "**Action taken** on the listing you reported", {
  body: "Thanks for helping keep HomzList clean.", age: DAYS(18), read: true,
  href: ownerListing ? `/property/${ownerListing.id}` : null,
});
await seed(owner.id, "suspension_lifted", "Your account is **active again**", {
  body: "You can post, chat and receive inquiries as usual.", age: DAYS(19), read: true,
});
await seed(owner.id, "new_device_login", "New login from **Chrome on Windows**", {
  body: "If this wasn't you, sign out of all devices.", age: DAYS(19), read: true,
});
await seed(owner.id, "performance_nudge", `No inquiries in 30 days on ${label(brokerListing)} — add daylight photos to get up to **3× more**`, {
  body: "Bright, wide photos are the single biggest driver of inquiries.", age: DAYS(20), read: true,
  entityKind: "listing", entityId: brokerListing?.id ?? null,
});
await seed(owner.id, "area_added", "**Kuvadva Road** is now available — post your listing there", {
  body: "The area you asked for is live in the location picker.", age: DAYS(21), read: true, href: "/create",
});
await seed(owner.id, "weekly_digest", "Your week: **340 views, 6 leads**", {
  body: "Across all your live listings in the last 7 days.", age: DAYS(23), read: true,
});

// Grouping proof: three messages in one thread collapse into ONE row.
if (ownerThread) {
  for (let i = 0; i < 3; i++) {
    const r = await c.query(
      `select * from notify_upsert($1,'new_message'::notification_type,$2,$3,$4,$5,null,null,$6,$7,$8::jsonb,null,null,null)`,
      [owner.id, `**${buyer.name}:** message ${i + 1}`, `message ${i + 1}`,
       `thread:${ownerThread.id}`, `/messages/${ownerThread.id}`, ownerThread.id, buyer.id,
       JSON.stringify({ seed: "module10" })],
    );
    if (r.rows[0].grouped) {
      await c.query(`update notifications set title = $2 where id = $1`,
        [r.rows[0].id, `**${buyer.name}:** ${r.rows[0].group_count} new messages`]);
    }
  }
}

// ===========================================================================
// BROKER — proposals, saved-search matches, requirement expiry
// ===========================================================================
console.log(`broker  : ${broker.name}`);
await seed(broker.id, "proposal_received", `**${builder.name}** sent a proposal on your requirement (3 BHK, ₹40–60 L)`, {
  body: `${builder.name} proposed on your requirement`, age: HOURS(5), actorId: builder.id,
  threadId: brokerThread?.id ?? null, href: brokerThread ? `/messages/${brokerThread.id}` : "/messages",
});
await seed(broker.id, "proposal_accepted", "Your proposal was **accepted** — 3 BHK, Satellite, ₹40–60 L", {
  body: "The chat is open. Reply to keep it moving.", age: HOURS(9),
});
await seed(broker.id, "proposal_declined", "Your proposal was **declined** — 2 BHK, Bopal, ₹30–40 L", {
  body: "Your proposal count is not refunded for a declined proposal.", age: DAYS(2), read: true,
});
await seed(broker.id, "proposal_expired", "Your proposal **expired** — 4 BHK, Prahlad Nagar", {
  body: "30 days with no response. The proposal count is not refunded.", age: DAYS(4), read: true,
});
await seed(broker.id, "saved_search_match", "**12 new properties** match your saved search 3 BHK · ₹40–60 L · Satellite", {
  body: "34 total properties now match this saved search.", age: DAYS(1), read: true,
  href: "/search/results?q=Satellite",
});
await seed(broker.id, "price_drop", `Price dropped **₹5 L** on a property you saved — ${label(builderListing)}`, {
  body: "Now ₹58 L.", age: DAYS(1), read: true, thumb: builderListing?.cover_url ?? null,
  entityKind: "listing", entityId: builderListing?.id ?? null,
  href: builderListing ? `/property/${builderListing.id}` : "/search",
});
await seed(broker.id, "saved_listing_status", `${label(builderListing)} is now marked **sold**`, {
  body: "It was on your saved list.", age: DAYS(3), read: true, thumb: builderListing?.cover_url ?? null,
  href: builderListing ? `/property/${builderListing.id}` : "/search",
});
await seed(broker.id, "requirement_expiring", "Your **requirement expires in 5 days**", {
  body: "3 BHK, Satellite, ₹40–60 L — reopen it to keep receiving proposals.", age: DAYS(2), read: true,
});
if (brokerOwn) await seed(broker.id, "still_available", `Is **${label(brokerListing)}** still available? Listings are checked every 2 months.`, {
  body: "Answer to keep it live — no answer hides it in 15 days.", age: HOURS(6),
  entityKind: "listing", entityId: brokerListing?.id ?? null,
  href: brokerListing ? `/listings/${brokerListing.id}` : "/listings",
});
await seed(broker.id, "number_requested", `**${buyer.name}** requested your phone number`, {
  body: `${buyer.name} requested your phone number`, age: "40 minutes", actorId: buyer.id,
  threadId: brokerThread?.id ?? null, href: brokerThread ? `/messages/${brokerThread.id}` : "/messages",
});
await seed(broker.id, "chat_accepted", `**${owner.name}** accepted your inquiry — you can chat now`, {
  body: `${owner.name} accepted — you can chat now`, age: HOURS(2), actorId: owner.id,
  threadId: brokerThread?.id ?? null, href: brokerThread ? `/messages/${brokerThread.id}` : "/messages",
});
await seed(broker.id, "trial_ending", "Your **free trial** ends in 2 days", {
  body: "Pick a plan to keep your listings live.", age: DAYS(5), read: true,
});

// ===========================================================================
// BUILDER — the builder-only matching-requirement row + batch approval
// ===========================================================================
console.log(`builder : ${builder.name}`);
await seed(builder.id, "requirement_match", "New requirement matches your area — **3 BHK, 150 Feet Ring Road, ₹60–80 L**", {
  body: "Send a proposal before someone else does.", age: DAYS(1), read: true,
});
// Batch dedup proof: 10 approvals in one bucket collapse into one counted row.
for (let i = 0; i < 10; i++) {
  const r = await c.query(
    `select * from notify_upsert($1,'listing_approved'::notification_type,$2,$3,$4,$5,null,null,null,null,$6::jsonb,null,null,null)`,
    [builder.id, `Your listing **Unit ${i + 1}** is now live`, "It is visible in the feed and in search.",
     "approved:listing", "/listings", JSON.stringify({ seed: "module10" })],
  );
  if (r.rows[0].grouped) {
    await c.query(`update notifications set title = $2, thumb_url = null where id = $1`,
      [r.rows[0].id, `**${r.rows[0].group_count} listings approved** — tap to review`]);
  }
}
await seed(builder.id, "boost_rejected", "Your boost **wasn't approved**", {
  body: "Photos do not match the project · ₹4,999 is being refunded (5–7 days).", age: DAYS(2), read: true,
});
await seed(builder.id, "boost_expired", "Your **boost has ended**", {
  body: "Project is back to its normal position. Boost again in 1 tap.", age: DAYS(6), read: true,
});
await seed(builder.id, "plan_expired", "Your **₹9,999 Builder plan** has expired", {
  body: "Your live listings stay up for the grace period. Renew to keep posting.", age: DAYS(8), read: true,
});
await seed(builder.id, "city_launched", "HomzList is now live in **Vadodara**", {
  body: "You asked to be notified when we launched here.", age: DAYS(30), read: true,
});
await seed(builder.id, "number_shared", `**${owner.name}** shared their number with you`, {
  body: `${owner.name} shared their number`, age: HOURS(2),
});
await seed(builder.id, "boost_stopped", "Your boost was **stopped**", {
  body: "Listing marked as sold. Unused days aren't refunded — see the Refund Policy.", age: DAYS(40), read: true,
});

// ===========================================================================
// BUYER — an empty-ish inbox plus one unread, to prove the empty/filter states
// ===========================================================================
console.log(`buyer   : ${buyer.name}`);
await seed(buyer.id, "price_drop", `Price dropped **₹3 L** on a property you saved — ${label(ownerListing)}`, {
  body: "Now ₹52 L.", age: HOURS(2), thumb: ownerListing?.cover_url ?? null,
  entityKind: "listing", entityId: ownerListing?.id ?? null,
  href: ownerListing ? `/property/${ownerListing.id}` : "/search",
});
await seed(buyer.id, "saved_search_match", "**5 new properties** match your saved search 2 BHK · ₹30–40 L · Bopal", {
  body: "18 total properties now match this saved search.", age: DAYS(2), read: true, href: "/search/results?q=Bopal",
});

// ---- proof ----------------------------------------------------------------
const summary = await c.query(
  `select p.name, p.role,
          count(*) total,
          count(*) filter (where n.read_at is null) unread,
          count(*) filter (where n.category='inquiry') inq,
          count(*) filter (where n.category='listing') lst,
          count(*) filter (where n.category='requirement') req,
          count(*) filter (where n.category='payment') pay
     from notifications n join profiles p on p.id = n.profile_id
    where n.dismissed_at is null and n.data ? 'seed'
    group by p.name, p.role order by p.role, p.name`,
);
console.table(summary.rows);

const types = await c.query(
  `select count(distinct type) distinct_types, count(*) rows from notifications where data ? 'seed'`,
);
console.log("distinct types seeded:", types.rows[0]);

await c.end();
