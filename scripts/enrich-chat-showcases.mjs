/**
 * Enriches ONE accepted inquiry thread for each hero poster (owner + builder,
 * broker already done by seed-module7) with the full P7 bubble set so every
 * message type renders in every role's browser. Idempotent (clears prior
 * enrichment first). Dev only.  node scripts/enrich-chat-showcases.mjs
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

async function enrich(posterPhone, label) {
  const poster = await idByPhone(posterPhone);
  // pick an accepted inquiry thread where this person is the poster
  const t = await one("select id, buyer_id, poster_id, listing_id from chat_threads where kind='inquiry' and poster_id=$1 and status='accepted' order by last_message_at desc limit 1", [poster]);
  if (!t) { console.log(`${label}: no accepted inquiry thread to enrich`); return; }
  const T = t.id, BUYER = t.buyer_id, POSTER = t.poster_id;
  const buyerName = (await one("select name from profiles where id=$1", [BUYER]))?.name ?? "Buyer";

  await q("delete from chat_messages where thread_id=$1 and kind<>'text'", [T]);
  await q("delete from chat_messages where thread_id=$1 and created_at > now() - interval '19 hours' and kind='text'", [T]);
  await q("delete from number_requests where thread_id=$1", [T]);

  const im = async (sender, kind, body, meta, mins) =>
    (await one("insert into chat_messages (thread_id, sender_id, kind, body, meta, created_at) values ($1,$2,$3,$4,$5, now()-($6||' minutes')::interval) returning id", [T, sender, kind, body, meta ?? {}, mins])).id;

  await im(null, "system", "Never pay token or advance before a site visit. HomzList is not responsible for payments made outside the platform.", { subtype: "safety" }, 400);
  const b1 = await im(POSTER, "text", "Yes, it's available. Would you like to see it this weekend?", {}, 120);
  await im(BUYER, "text", "Yes please. Is parking included?", {}, 116);
  await q("insert into chat_messages (thread_id, sender_id, kind, body, reply_to, created_at) values ($1,$2,'text',$3,$4, now()-interval '112 minutes')", [T, POSTER, "Two covered parkings included.", b1]);
  const r = await im(BUYER, "text", "Great, thanks!", {}, 108);
  await q("update chat_messages set reactions=$2 where id=$1", [r, JSON.stringify({ "👍": [POSTER] })]);
  const cover = (await one("select cover_url from listings where id=$1", [t.listing_id]))?.cover_url;
  if (cover) { const ph = await im(BUYER, "photo", null, {}, 96); await q("update chat_messages set photo_url=$2, photo_w=1080, photo_h=1080 where id=$1", [ph, cover]); }
  await im(BUYER, "link", "More details here: https://homzlist.com/property/listing", { title: "Listing details — HomzList", domain: "homzlist.com", external: false }, 90);
  const del = await im(BUYER, "text", "oops", {}, 85);
  await q("update chat_messages set deleted_all=true, body=null where id=$1", [del]);
  // number flow: buyer requested, poster allowed
  const nrCard = await im(BUYER, "number_request", null, { requesterId: BUYER }, 60);
  await q("insert into number_requests (thread_id, requester_id, target_id, status, message_id, responded_at, created_at) values ($1,$2,$3,'allowed',$4, now()-interval '58 minutes', now()-interval '60 minutes')", [T, BUYER, POSTER, nrCard]);
  await im(null, "system", `${label} shared their number`, { subtype: "number-shared" }, 58);
  await im(POSTER, "number_card", null, { owner: "poster" }, 57);
  await im(null, "continuity", "Did you connect on call?", {}, 56);
  const visit = await one("insert into visits (listing_id, buyer_id, poster_id, scheduled_at, status, thread_id, created_at) values ($1,$2,$3, now()+interval '3 days','confirmed',$4, now()-interval '50 minutes') returning id", [t.listing_id, BUYER, POSTER, T]);
  await im(BUYER, "visit_proposal", "Proposed a site visit", { visitId: visit.id, scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString() }, 50);
  await im(POSTER, "visit_confirmed", "Site visit confirmed", { visitId: visit.id, scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString() }, 48);
  await im(BUYER, "text", "See you then!", {}, 6);
  await q("update thread_participants set last_read_at=now()-interval '30 minutes' where thread_id=$1 and profile_id=$2", [T, POSTER]);
  console.log(`${label}: enriched thread ${T.slice(0, 8)} (buyer ${buyerName}) with full bubble set + number + visit`);
  return T;
}

const owner = await enrich("+919999000004", "Sneha Patel (owner)");
const builder = await enrich("+919999000014", "Manish Agarwal (builder)");
console.log("\nOWNER_THREAD=" + owner);
console.log("BUILDER_THREAD=" + builder);
await c.end();
