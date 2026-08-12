/**
 * Seed one lead of EVERY kind and state, through the real API.
 *
 *   node scripts/seed-leads-states.mjs [http://seller.lvh.me:3000]
 *
 * The Leads screens have a lot of states — property / project / requirement,
 * new / contacted / converted / archived, overdue, an offer attached, a subject
 * that has since been taken down — and a screen you have only ever seen with
 * two rows in it is a screen you have not really seen. Everything here is
 * created by calling the endpoints a person would hit, so what lands in the
 * database is exactly what the product writes.
 *
 * Only the two things a user cannot do are done in SQL: back-dating a preferred
 * date (to make an OVERDUE lead) and granting proposal quota in dev.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = (process.argv[2] ?? "http://seller.lvh.me:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ref = E.SUPABASE_PROJECT_REF;
const CANDIDATES = [
  { name: "direct", host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["ap-south-1", "ap-southeast-1", "us-east-1", "eu-central-1"].flatMap((r) => [
    { name: `pooler-${r}:5432`, host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
    { name: `pooler-${r}:6543`, host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  ]),
];
async function connectDb() {
  let last;
  for (const c of CANDIDATES) {
    const cl = new pg.Client({ host: c.host, port: c.port, user: c.user, password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await cl.connect(); console.log(`db: ${c.name}`); return cl; } catch (e) { last = e; try { await cl.end(); } catch {} }
  }
  throw new Error(`db connect failed: ${last?.message}`);
}
const db = await connectDb();

function actor(label) {
  const jar = new Map();
  return {
    label, id: null,
    async req(u, m = "GET", b) {
      const r = await fetch(`${BASE}${u}`, {
        method: m,
        headers: { ...(b ? { "Content-Type": "application/json" } : {}), ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
        body: b ? JSON.stringify(b) : undefined, redirect: "manual",
      });
      for (const c of r.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";"); const i = pair.indexOf("=");
        const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
        if (v === "" || v === "deleted") jar.delete(k); else jar.set(k, v);
      }
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text };
    },
    async login(phone) {
      const r1 = await this.req("/api/v1/auth/otp/request", "POST", { phone });
      if (!r1.json?.ok) throw new Error(`${label}: otp request ${JSON.stringify(r1.json?.error)}`);
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", { otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456" });
      if (!r2.json?.ok) throw new Error(`${label}: otp verify ${JSON.stringify(r2.json?.error)}`);
      this.id = r2.json.data.user?.id ?? null;
      return r2.json.data.user;
    },
  };
}

const log = (m) => console.log(`  · ${m}`);

// ---- who and what ----------------------------------------------------------
// THE SELLER is whoever we want the Leads screen to belong to; everyone else
// sends to them, so one account ends up with every state on one screen.
const SELLER_PHONE = process.env.SEED_SELLER_PHONE ?? "9826008333";
const { rows: [seller] } = await db.query(`select id, name, phone, role from profiles where phone = $1`, [`+91${SELLER_PHONE.slice(-10)}`]);
if (!seller) throw new Error(`no profile for ${SELLER_PHONE}`);

const { rows: sellerListings } = await db.query(
  `select id, title from listings where profile_id=$1 and status='live' order by created_at desc limit 3`, [seller.id]);
const { rows: sellerProjects } = await db.query(
  `select id, name from projects where profile_id=$1 and status='live' order by created_at desc limit 1`, [seller.id]);
const { rows: sellerReqs } = await db.query(
  `select id from requirements where profile_id=$1 and status='live' and is_active order by created_at desc limit 1`, [seller.id]);

// Senders: two people who are not the seller, of different roles.
const { rows: senders } = await db.query(
  `select id, name, phone, role from profiles
    where state='active' and name is not null and city_id is not null and phone is not null
      and id <> $1 and (role is null or role <> 'builder')
    order by created_at desc limit 4`, [seller.id]);
const { rows: [builderSender] } = await db.query(
  `select p.id, p.name, p.phone from profiles p
    where p.role='builder' and p.state='active' and p.phone is not null and p.id <> $1
      and exists (select 1 from projects j where j.profile_id=p.id and j.status='live')
    order by p.created_at desc limit 1`, [seller.id]);

console.log(`\nseller: ${seller.name} (${seller.role}) — ${sellerListings.length} listings, ${sellerProjects.length} projects, ${sellerReqs.length} requirements`);
console.log(`senders: ${senders.map((s) => `${s.name}/${s.role ?? "—"}`).join(", ")}${builderSender ? `, ${builderSender.name}/builder` : ""}\n`);

if (!sellerListings.length) throw new Error("the seed seller has no live listing to receive leads on");

// ---- fresh start for the rows we are about to make -------------------------
const senderIds = [...senders.map((s) => s.id), builderSender?.id].filter(Boolean);
await db.query(`delete from leads where owner_id=$1 and lead_profile_id = any($2)`, [seller.id, senderIds]);
await db.query(`delete from inquiries where poster_id=$1 and profile_id = any($2)`, [seller.id, senderIds]);
await db.query(`delete from proposals where poster_id=$1 and sender_id = any($2)`, [seller.id, senderIds]);

// ---- send, as real people --------------------------------------------------
const sessions = new Map();
const sessionFor = async (p) => {
  if (!sessions.has(p.id)) { const a = actor(p.name); await a.login(p.phone); sessions.set(p.id, a); }
  return sessions.get(p.id);
};

const WANTS = [["price", "photos"], ["availability"], ["visit", "details"], ["more"]];
const WHENS = ["today", "tomorrow", "anytime", "today"];
const PREFS = ["call", "whatsapp", "call", "whatsapp"];

const made = [];
console.log("sending inquiries…");
for (let i = 0; i < Math.min(senders.length, 4); i++) {
  const p = senders[i];
  const a = await sessionFor(p);
  const target = sellerListings[i % sellerListings.length];
  const r = await a.req("/api/v1/inquiries", "POST", {
    listingId: target.id, wants: WANTS[i], contactPref: PREFS[i], whenToken: WHENS[i], consent: true,
  });
  if (r.json?.ok) { made.push({ who: p.name, leadId: r.json.data.leadId, on: target.title ?? target.id }); log(`${p.name} → ${target.title ?? "listing"} (${PREFS[i]}, ${WHENS[i]})`); }
  else log(`${p.name} → refused: ${r.json?.error?.code ?? r.status}`);
}

if (sellerProjects.length && senders[0]) {
  const a = await sessionFor(senders[0]);
  const r = await a.req("/api/v1/inquiries", "POST", {
    projectId: sellerProjects[0].id, wants: ["price", "details"], contactPref: "whatsapp", whenToken: "tomorrow", consent: true,
  });
  log(r.json?.ok ? `${senders[0].name} → project ${sellerProjects[0].name}` : `project inquiry refused: ${r.json?.error?.code}`);
}

// A requirement answered two ways, so the Requirements group has both shapes.
if (sellerReqs.length) {
  for (const p of [senders[1], builderSender].filter(Boolean)) {
    // Dev-only: make sure they can actually spend a proposal.
    await db.query(
      `update user_plans set proposal_quota = greatest(proposal_quota, proposal_used + 2)
        where profile_id=$1 and status='active' and proposal_quota >= 0`, [p.id]);
    const a = await sessionFor(p);
    const { rows: own } = await db.query(
      `select id from listings where profile_id=$1 and status='live' limit 1`, [p.id]);
    const body = own.length
      ? { mode: "listing", listingId: own[0].id, contactPref: "call", whenToken: "today", consent: true }
      : { mode: "help", offers: ["matching_soon", "loan_help"], contactPref: "whatsapp", whenToken: "anytime", consent: true };
    const r = await a.req(`/api/v1/requirements/${sellerReqs[0].id}/proposals`, "POST", body);
    log(r.json?.ok ? `${p.name} → requirement (${body.mode})` : `${p.name} → requirement refused: ${r.json?.error?.code}`);
  }
}

// ---- spread them across the states the screen has to draw ------------------
const sellerA = actor("seller");
await sellerA.login(seller.phone);
const groups = await sellerA.req("/api/v1/leads");
const subjects = groups.json?.data?.subjects ?? [];
let all = [];
for (const s of subjects) {
  const r = await sellerA.req(`/api/v1/leads/subject/${s.kind}/${s.id}`);
  all.push(...(r.json?.data?.leads ?? []).map((l) => ({ ...l, subjectKind: s.kind })));
}
all = all.filter((l) => senderIds.includes(l.person.id));
console.log(`\nspreading ${all.length} lead(s) across states…`);

const setStatus = (id, status) => sellerA.req(`/api/v1/leads/${id}`, "PATCH", { action: "status", status });
if (all[1]) { await setStatus(all[1].id, "contacted"); log("one → Contacted"); }
if (all[2]) { await setStatus(all[2].id, "converted"); log("one → Converted"); }
if (all[3]) { await setStatus(all[3].id, "archived"); log("one → Archived"); }

// OVERDUE: a lead still New whose promised day has passed. Only reachable by
// moving the clock back, which no endpoint can do.
if (all[0]) {
  await db.query(`update leads set preferred_on = current_date - 2, stage='new', seen_at=null where id=$1`, [all[0].id]);
  log("one → Overdue (preferred day moved back 2 days)");
}

// A subject that has since been taken down, so the "no longer available" path
// on the lead has a real row behind it.
if (sellerListings[2]) {
  await db.query(`update listings set status='archived' where id=$1`, [sellerListings[2].id]);
  log(`listing "${sellerListings[2].title ?? sellerListings[2].id}" → archived (its leads must still read)`);
}

// ---- what the screens will now show ---------------------------------------
const { rows: summary } = await db.query(`
  select coalesce(
           case when listing_id is not null then 'listing'
                when project_id is not null then 'project'
                when requirement_id is not null then 'requirement' end, '—') kind,
         stage, count(*) n
    from leads where owner_id = $1 group by 1,2 order by 1,2`, [seller.id]);
console.log("\nleads now on this seller's screen:");
for (const r of summary) console.log(`  ${r.kind.padEnd(12)} ${r.stage.padEnd(12)} ${r.n}`);

await db.end();
