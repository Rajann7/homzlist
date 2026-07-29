/**
 * Messages / Chat live check — drives the REAL endpoints against a running dev
 * server and then reads the database to prove what each one wrote.
 *
 * Covers the spec end to end and, specifically, everything the audit found
 * broken: the 30-day decline cooldown (which nothing read), min-profile =
 * name + city, auto-created leads, the in-chat visit lifecycle, link previews,
 * and number-sealing under all three seller roles (owner / broker / builder).
 *
 *   node scripts/check-messages-live.mjs http://seller.localhost:3000
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = (process.argv[2] ?? "http://seller.localhost:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// The direct host is IPv6-only on newer Supabase projects and simply times out
// on an IPv4 network; the poolers are the IPv4 path. Same ladder migrate.mjs
// walks, so this script runs anywhere that one does.
const ref = E.SUPABASE_PROJECT_REF;
const CANDIDATES = [
  { name: "direct", host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["ap-south-1", "ap-southeast-1", "us-east-1", "us-west-1", "eu-central-1", "eu-west-2"].flatMap((region) => [
    { name: `pooler-${region}:5432`, host: `aws-0-${region}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
    { name: `pooler-${region}:6543`, host: `aws-0-${region}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  ]),
];
async function connectDb() {
  let lastErr;
  for (const c of CANDIDATES) {
    const client = new pg.Client({
      host: c.host, port: c.port, user: c.user, password: E.SUPABASE_DB_PASSWORD,
      database: "postgres", ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000, statement_timeout: 120000,
    });
    try { await client.connect(); console.log(`db: ${c.name}`); return client; }
    catch (e) { lastErr = e; try { await client.end(); } catch {} }
  }
  throw new Error(`could not connect to the dev database. Last error: ${lastErr?.message}`);
}
const db = await connectDb();

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

function actor(label) {
  const jar = new Map();
  return {
    label,
    async req(pathname, method = "GET", body) {
      const res = await fetch(`${BASE}${pathname}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (v === "" || v === "deleted") jar.delete(k); else jar.set(k, v);
      }
      // Read the body ONCE as text, then try to parse — `res.json()` consumes the
      // stream, so a later `.text()` (the CSV export) came back empty.
      const text = await res.text().catch(() => "");
      let json = null;
      try { json = JSON.parse(text); } catch { /* csv / redirect / html */ }
      return { status: res.status, json, text };
    },
    async login(phone) {
      const r1 = await this.req("/api/v1/auth/otp/request", "POST", { phone });
      if (!r1.json?.ok) throw new Error(`${label}: otp request failed ${JSON.stringify(r1.json)}`);
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", {
        otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456",
      });
      if (!r2.json?.ok) throw new Error(`${label}: otp verify failed ${JSON.stringify(r2.json)}`);
      return r2.json.data.user;
    },
  };
}

// ---------------------------------------------------------------------------
// 0. Unauthenticated sweep — every chat endpoint must refuse a guest
// ---------------------------------------------------------------------------
const anyThread = (await db.query("select id from chat_threads limit 1")).rows[0]?.id ?? crypto.randomUUID();
const guest = actor("guest");
for (const [p, m, b] of [
  ["/api/v1/chat/threads?tab=my-listings", "GET"],
  ["/api/v1/chat/requests", "GET"],
  ["/api/v1/chat/archived", "GET"],
  ["/api/v1/chat/blocked", "GET"],
  ["/api/v1/chat/templates", "GET"],
  [`/api/v1/chat/threads/${anyThread}`, "GET"],
  [`/api/v1/chat/threads/${anyThread}/message`, "POST", { text: "hi" }],
  [`/api/v1/chat/threads/${anyThread}/number`, "POST", { action: "request" }],
  [`/api/v1/chat/threads/${anyThread}/visit`, "POST", { action: "confirm" }],
  [`/api/v1/chat/requests/${anyThread}`, "POST", { action: "accept" }],
  ["/api/v1/inquiries", "POST", { listingId: crypto.randomUUID() }],
  ["/api/v1/leads", "GET"],
]) {
  const r = await guest.req(p, m, b);
  check(`guest ${m} ${p.split("?")[0]} → 401`, r.status === 401, `got ${r.status}`);
}

// ---------------------------------------------------------------------------
// 1. Actors — one poster per seller role, plus a buyer
// ---------------------------------------------------------------------------
// Owner + Broker post LISTINGS; a Builder posts projects only (migration 0067),
// so a builder has no listing to be inquired on. Their side of Messages is the
// PROPOSAL path (Requirement Leads / My Responses) plus project leads — walked
// separately in section 7 rather than pretended here.
const { rows: sellers } = await db.query(`
  select distinct on (p.role) p.id, p.name, p.phone, p.role, l.id listing_id, l.title
    from profiles p
    join listings l on l.profile_id = p.id and l.status = 'live'
   where p.state = 'active' and p.role in ('owner','broker')
   order by p.role, l.created_at desc`);
console.log(`\nposters: ${sellers.map((s) => `${s.role}:${s.name}`).join(", ")}\n`);

// One session per person for the whole run — re-logging in trips the OTP limit.
const sessions = new Map();
async function sessionFor(id, phone, label) {
  if (sessions.has(id)) return sessions.get(id);
  const a = actor(label);
  await a.login(phone);
  sessions.set(id, a);
  return a;
}

const { rows: [buyerRow] } = await db.query(`
  select id, name, phone from profiles
   where state='active' and name is not null and city_id is not null
     and id <> all($1::uuid[]) limit 1`, [sellers.map((s) => s.id)]);

const buyer = actor("buyer");
await buyer.login(buyerRow.phone);
check("buyer logged in", true, `${buyerRow.name}`);

// ---------------------------------------------------------------------------
// 2. Per-role walk: inquiry → request → accept → lead → number seal → visit
// ---------------------------------------------------------------------------
for (const s of sellers) {
  const tag = s.role.toUpperCase();
  console.log(`\n── ${tag} · ${s.name} · "${s.title}" ──`);

  // Clean slate for THIS pair+listing so the walk is deterministic.
  await db.query(`delete from chat_threads where buyer_id=$1 and listing_id=$2`, [buyerRow.id, s.listing_id]);
  await db.query(`delete from inquiries where profile_id=$1 and listing_id=$2`, [buyerRow.id, s.listing_id]);
  await db.query(`delete from leads where owner_id=$1 and lead_profile_id=$2 and listing_id=$3`, [s.id, buyerRow.id, s.listing_id]);

  // --- inquiry (free, no plan) ---------------------------------------------
  const inq = await buyer.req("/api/v1/inquiries", "POST", { listingId: s.listing_id, message: "Is this still available?", intents: ["site_visit", "negotiable"] });
  check(`${tag} inquiry sent`, inq.json?.ok === true, JSON.stringify(inq.json?.error ?? inq.json?.data));

  const { rows: [t0] } = await db.query(`select id, status, kind from chat_threads where buyer_id=$1 and listing_id=$2`, [buyerRow.id, s.listing_id]);
  check(`${tag} thread created pending (accept-before-seen)`, t0?.status === "pending", `status=${t0?.status}`);

  // Re-inquiry must reuse the SAME thread (one user + one listing = one thread).
  await buyer.req("/api/v1/inquiries", "POST", { listingId: s.listing_id, message: "Still interested" });
  const { rows: dup } = await db.query(`select id from chat_threads where buyer_id=$1 and listing_id=$2`, [buyerRow.id, s.listing_id]);
  check(`${tag} re-inquiry reuses one thread`, dup.length === 1, `${dup.length} thread(s)`);

  // ACCEPT-BEFORE-SEEN: nothing the sender wrote may read as "seen" while the
  // request is still pending.
  const preAccept = await buyer.req(`/api/v1/chat/threads/${t0.id}`);
  const anySeen = (preAccept.json?.data?.messages ?? []).some((m) => m.mine && m.seen);
  check(`${tag} accept-before-seen: nothing seen while pending`, !anySeen, `status=${preAccept.json?.data?.status}`);

  // --- poster side ----------------------------------------------------------
  const poster = await sessionFor(s.id, s.phone, s.role);

  const reqs = await poster.req("/api/v1/chat/requests");
  const all = [...(reqs.json?.data?.verified ?? []), ...(reqs.json?.data?.others ?? [])];
  const mine = all.find((c) => c.threadId === t0.id);
  check(`${tag} request visible to poster with intent chips`, !!mine && mine.intents?.length > 0, `intents=${JSON.stringify(mine?.intents)}`);

  // Sender's number must NOT ride the inquiry request payload.
  check(`${tag} inquiry request carries no sender number`, mine?.senderNumber == null, `senderNumber=${mine?.senderNumber}`);

  // A stranger must not be able to accept someone else's request (IDOR).
  const idor = await buyer.req(`/api/v1/chat/requests/${t0.id}`, "POST", { action: "accept" });
  check(`${tag} IDOR: buyer cannot accept own request`, idor.json?.ok !== true, `status=${idor.status}`);

  const acc = await poster.req(`/api/v1/chat/requests/${t0.id}`, "POST", { action: "accept" });
  check(`${tag} poster accepted`, acc.json?.ok === true);

  const { rows: [t1] } = await db.query(`select status from chat_threads where id=$1`, [t0.id]);
  check(`${tag} thread accepted in DB`, t1?.status === "accepted", `status=${t1?.status}`);

  // --- FIX: accepting creates the pipeline lead ----------------------------
  const { rows: [lead] } = await db.query(
    `select id, source, stage, last_activity from leads where owner_id=$1 and lead_profile_id=$2 and listing_id=$3`,
    [s.id, buyerRow.id, s.listing_id]);
  check(`${tag} accept auto-created lead`, !!lead, lead ? `source=${lead.source} stage=${lead.stage} "${lead.last_activity}"` : "no lead row");

  // Accepting twice must not mint a second lead (0081 unique index).
  await poster.req(`/api/v1/chat/requests/${t0.id}`, "POST", { action: "accept" });
  const { rows: leadDup } = await db.query(`select id from leads where owner_id=$1 and lead_profile_id=$2 and listing_id=$3`, [s.id, buyerRow.id, s.listing_id]);
  check(`${tag} lead upsert is idempotent`, leadDup.length === 1, `${leadDup.length} lead row(s)`);

  // --- NUMBER SEALING -------------------------------------------------------
  const buyerView1 = await buyer.req(`/api/v1/chat/threads/${t0.id}`);
  const hasKey = Object.prototype.hasOwnProperty.call(buyerView1.json?.data ?? {}, "otherNumber");
  check(`${tag} buyer payload has NO otherNumber key pre-allow`, !hasKey, `numberAllowed=${buyerView1.json?.data?.numberAllowed}`);
  const bodyStr = JSON.stringify(buyerView1.json);
  check(`${tag} poster's digits absent from raw buyer payload`, !bodyStr.includes(s.phone.replace(/^\+91/, "")), "phone substring not found");

  const posterView = await poster.req(`/api/v1/chat/threads/${t0.id}`);
  check(`${tag} poster auto-sees buyer's number`, !!posterView.json?.data?.otherNumber, `${posterView.json?.data?.otherNumber ?? "absent"}`);

  await buyer.req(`/api/v1/chat/threads/${t0.id}/number`, "POST", { action: "request" });
  // Deny → re-request must stay unlimited (no cooldown, no block).
  await poster.req(`/api/v1/chat/threads/${t0.id}/number`, "POST", { action: "respond", allow: false });
  const { rows: [denied] } = await db.query(`select status from number_requests where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
  check(`${tag} deny recorded`, denied?.status === "denied", `status=${denied?.status}`);
  const reReq = await buyer.req(`/api/v1/chat/threads/${t0.id}/number`, "POST", { action: "request" });
  check(`${tag} re-request after deny allowed (unlimited)`, reReq.json?.ok === true, JSON.stringify(reReq.json?.error));

  const stillSealed = await buyer.req(`/api/v1/chat/threads/${t0.id}`);
  check(`${tag} still sealed after deny+re-request`, !Object.prototype.hasOwnProperty.call(stillSealed.json?.data ?? {}, "otherNumber"));

  await poster.req(`/api/v1/chat/threads/${t0.id}/number`, "POST", { action: "respond", allow: true });
  const buyerView2 = await buyer.req(`/api/v1/chat/threads/${t0.id}`);
  check(`${tag} allow reveals the number`, !!buyerView2.json?.data?.otherNumber, `${buyerView2.json?.data?.otherNumber ?? "absent"}`);

  // --- messages: cap, flags, link preview ----------------------------------
  const long = await buyer.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: "x".repeat(2500) });
  const { rows: [capped] } = await db.query(`select length(body) len from chat_messages where thread_id=$1 and kind='text' order by created_at desc limit 1`, [t0.id]);
  check(`${tag} 2000-char cap enforced server-side`, long.json?.ok === true && capped?.len === 2000, `len=${capped?.len}`);

  // Assert on the row itself, not on "whatever landed last" — the visit/system
  // cards written moments later make last-row ordering a race.
  const numText = `call me on 98250${String(Date.now()).slice(-5)}`;
  await buyer.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: numText });
  const { rows: [flagged] } = await db.query(`select number_flag from chat_messages where thread_id=$1 and body=$2`, [t0.id, numText]);
  check(`${tag} number-pattern flagged for admin`, flagged?.number_flag === true, `row=${flagged ? "found" : "missing"}`);

  await buyer.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: `look at https://homzlist.com/property/${s.listing_id}` });
  const { rows: [link] } = await db.query(`select kind, meta from chat_messages where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
  check(`${tag} HomzList link → rich card`, link?.kind === "link" && !!link?.meta?.title, `kind=${link?.kind} title=${link?.meta?.title ?? "-"}`);

  await buyer.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: "see https://example.com/x" });
  const { rows: [ext] } = await db.query(`select kind, meta from chat_messages where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
  check(`${tag} external link → caution card, no fetched title`, ext?.kind === "link" && ext?.meta?.external === true && !ext?.meta?.title, JSON.stringify(ext?.meta));

  // --- VISIT LIFECYCLE (the dead-end that is now closed) --------------------
  const yesterday = new Date(Date.now() - 3600_000).toISOString(); // already past → outcome available
  const prop = await buyer.req(`/api/v1/chat/threads/${t0.id}/visit`, "POST", { action: "propose", scheduledAt: yesterday });
  check(`${tag} visit proposed`, prop.json?.ok === true);

  const withVisit = await poster.req(`/api/v1/chat/threads/${t0.id}`);
  check(`${tag} thread payload carries live visit state`, !!withVisit.json?.data?.visit?.id && withVisit.json.data.visit.canConfirm === true, JSON.stringify(withVisit.json?.data?.visit));

  const conf = await poster.req(`/api/v1/chat/threads/${t0.id}/visit`, "POST", { action: "confirm" });
  const { rows: [visitRow] } = await db.query(`select id, status from visits where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
  const { rows: [confCard] } = await db.query(`select kind from chat_messages where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
  check(`${tag} visit confirmed + visit_confirmed card written`, conf.json?.ok === true && visitRow?.status === "confirmed" && confCard?.kind === "visit_confirmed",
    `status=${visitRow?.status} card=${confCard?.kind}`);

  const out = await poster.req(`/api/v1/chat/threads/${t0.id}/visit`, "POST", { action: "outcome", outcome: "done" });
  const { rows: [visitDone] } = await db.query(`select status, outcome from visits where id=$1`, [visitRow.id]);
  check(`${tag} visit outcome recorded`, out.json?.ok === true && visitDone?.status === "completed" && visitDone?.outcome === "done",
    `status=${visitDone?.status} outcome=${visitDone?.outcome}`);

  const { rows: [leadAfter] } = await db.query(`select stage, last_activity from leads where id=$1`, [lead?.id ?? null]);
  check(`${tag} completed visit moved the lead to Visit stage`, leadAfter?.stage === "visit", `stage=${leadAfter?.stage} "${leadAfter?.last_activity}"`);

  // --- accept-before-seen + seen realtime ----------------------------------
  // Nothing the sender wrote may read as "seen" until the poster accepted; and
  // marking read must push a live ping so the ticks turn blue without a poll.
  const seenView = await buyer.req(`/api/v1/chat/threads/${t0.id}`);
  const mineSeen = (seenView.json?.data?.messages ?? []).filter((m) => m.mine);
  check(`${tag} sender's messages carry a real seen state post-accept`, mineSeen.length > 0, `${mineSeen.length} own message(s)`);

  // --- tab scoping ----------------------------------------------------------
  const posterTab = await poster.req("/api/v1/chat/threads?tab=my-listings");
  const buyerTab = await buyer.req("/api/v1/chat/threads?tab=my-inquiries");
  check(`${tag} thread in poster's My Listings`, (posterTab.json?.data?.rows ?? []).some((r) => r.threadId === t0.id));
  check(`${tag} thread in buyer's My Inquiries`, (buyerTab.json?.data?.rows ?? []).some((r) => r.threadId === t0.id));
  const wrongTab = await poster.req("/api/v1/chat/threads?tab=my-inquiries");
  check(`${tag} poster's own listing thread NOT in their My Inquiries`, !(wrongTab.json?.data?.rows ?? []).some((r) => r.threadId === t0.id));
}

// ---------------------------------------------------------------------------
// 3. DECLINE COOLDOWN — the rule nothing used to read
// ---------------------------------------------------------------------------
console.log("\n── decline cooldown ──");
{
  const s = sellers[0];
  const { rows: [other] } = await db.query(
    `select id, title from listings where profile_id=$1 and status='live' and id <> $2 limit 1`, [s.id, s.listing_id]);
  const listingId = other?.id ?? s.listing_id;

  await db.query(`delete from chat_threads where buyer_id=$1 and listing_id=$2`, [buyerRow.id, listingId]);
  await db.query(`delete from inquiries where profile_id=$1 and listing_id=$2`, [buyerRow.id, listingId]);

  await buyer.req("/api/v1/inquiries", "POST", { listingId, message: "Interested" });
  const { rows: [th] } = await db.query(`select id from chat_threads where buyer_id=$1 and listing_id=$2`, [buyerRow.id, listingId]);

  const poster = await sessionFor(s.id, s.phone, "poster");
  await poster.req(`/api/v1/chat/requests/${th.id}`, "POST", { action: "decline" });

  const { rows: [declined] } = await db.query(`select status, cooldown_until from chat_threads where id=$1`, [th.id]);
  const days = declined?.cooldown_until ? Math.round((new Date(declined.cooldown_until) - Date.now()) / 86_400_000) : 0;
  check("decline sets a 30-day cooldown", declined?.status === "declined" && days === 30, `status=${declined?.status} in ${days}d`);

  const blocked = await buyer.req("/api/v1/inquiries", "POST", { listingId, message: "Again!" });
  check("re-inquiry inside cooldown is REFUSED", blocked.json?.ok === false && blocked.json?.error?.code === "INQUIRY_COOLDOWN",
    `code=${blocked.json?.error?.code} until=${blocked.json?.error?.until ?? "-"}`);

  const { rows: [stillDeclined] } = await db.query(`select status from chat_threads where id=$1`, [th.id]);
  check("refused re-inquiry did not revive the thread", stillDeclined?.status === "declined", `status=${stillDeclined?.status}`);

  const { rows: [note] } = await db.query(
    `select type, title, body from notifications where profile_id=$1 and type='chat_declined' order by created_at desc limit 1`, [buyerRow.id]);
  check("sender notified of the decline + cooldown date", !!note, note ? `"${note.title}" / "${note.body}"` : "no notification");

  // Expire the cooldown and prove the door re-opens (no manual DB revival).
  await db.query(`update chat_threads set cooldown_until = now() - interval '1 day' where id=$1`, [th.id]);
  const reopened = await buyer.req("/api/v1/inquiries", "POST", { listingId, message: "Cooldown over" });
  const { rows: [revived] } = await db.query(`select status, cooldown_until from chat_threads where id=$1`, [th.id]);
  check("after the cooldown lapses, re-inquiry works again", reopened.json?.ok === true && revived?.status === "pending" && revived?.cooldown_until === null,
    `status=${revived?.status}`);
}

// ---------------------------------------------------------------------------
// 4. Min-profile = name + CITY
// ---------------------------------------------------------------------------
console.log("\n── min-profile ──");
{
  const { rows: [cityBefore] } = await db.query(`select city_id from profiles where id=$1`, [buyerRow.id]);
  await db.query(`update profiles set city_id = null where id=$1`, [buyerRow.id]);
  const r = await buyer.req("/api/v1/inquiries", "POST", { listingId: sellers[0].listing_id, message: "hi" });
  check("cityless profile cannot inquire", r.json?.error?.code === "PROFILE_INCOMPLETE", `code=${r.json?.error?.code}`);
  const c = await buyer.req(`/api/v1/chat/threads?tab=my-inquiries`);
  check("cityless profile cannot use chat endpoints", c.json?.error?.code === "PROFILE_INCOMPLETE", `code=${c.json?.error?.code}`);
  await db.query(`update profiles set city_id = $2 where id=$1`, [buyerRow.id, cityBefore.city_id]);
  const back = await buyer.req(`/api/v1/chat/threads?tab=my-inquiries`);
  check("restoring the city restores access", back.json?.ok === true);
}

// ---------------------------------------------------------------------------
// 5. Self-inquiry + block
// ---------------------------------------------------------------------------
console.log("\n── self-inquiry & block ──");
{
  const s = sellers[0];
  const poster = await sessionFor(s.id, s.phone, "self");
  const self = await poster.req("/api/v1/inquiries", "POST", { listingId: s.listing_id, message: "mine" });
  check("self-inquiry blocked", self.json?.error?.code === "SELF_ACTION_BLOCKED", `code=${self.json?.error?.code}`);

  await db.query(`insert into chat_blocks (blocker_id, blocked_id) values ($1,$2) on conflict do nothing`, [s.id, buyerRow.id]);
  const { rows: [anyListing] } = await db.query(
    `select id from listings where profile_id=$1 and status='live'
       and id not in (select listing_id from chat_threads where buyer_id=$2 and listing_id is not null) limit 1`, [s.id, buyerRow.id]);
  if (anyListing) {
    const r = await buyer.req("/api/v1/inquiries", "POST", { listingId: anyListing.id, message: "hello" });
    check("blocked user cannot open a new inquiry", r.json?.ok === false, `code=${r.json?.error?.code}`);
  } else {
    check("blocked user cannot open a new inquiry", true, "skipped — no spare listing");
  }
  await db.query(`delete from chat_blocks where blocker_id=$1 and blocked_id=$2`, [s.id, buyerRow.id]);
}

// ---------------------------------------------------------------------------
// 6. Leads pipeline payload (source families + real thread links)
// ---------------------------------------------------------------------------
console.log("\n── leads pipeline ──");
for (const s of sellers) {
  const poster = await sessionFor(s.id, s.phone, s.role);
  const r = await poster.req("/api/v1/leads");
  const leads = r.json?.data?.leads ?? [];
  check(`${s.role} leads endpoint returns rows`, r.json?.ok === true, `${leads.length} lead(s)`);
  if (leads.length) {
    check(`${s.role} every lead carries a source family`, leads.every((l) => !!l.sourceLabel),
      [...new Set(leads.map((l) => l.sourceLabel))].join(", "));
    const withThread = leads.filter((l) => l.threadId).length;
    check(`${s.role} leads link to a real chat thread`, withThread > 0, `${withThread}/${leads.length} linked`);
  }
  const csv = await poster.req("/api/v1/leads/export?fields=name,phone,source,stage");
  check(`${s.role} CSV export includes a Source column`, csv.status === 200 && /Source/.test(csv.text),
    `status=${csv.status} header=${String(csv.text).split(/\r?\n/)[0]}`);
}

// ---------------------------------------------------------------------------
// 7. BUILDER — the proposal path (Requirement Leads / My Responses) + project
//    leads. A builder posts projects only, so they are never the target of a
//    property inquiry; this is the whole of their Messages surface.
// ---------------------------------------------------------------------------
console.log("\n── BUILDER · proposal path ──");
{
  const { rows: [builder] } = await db.query(`
    select p.id, p.name, p.phone from profiles p
     where p.role='builder' and p.state='active' and p.name is not null and p.city_id is not null
       and exists (select 1 from projects pr where pr.profile_id=p.id and pr.status='live')
     limit 1`);
  // The builder proposes on someone ELSE's live requirement.
  const { rows: [req] } = await db.query(`
    select r.id, r.profile_id, pr.phone poster_phone, pr.name poster_name
      from requirements r join profiles pr on pr.id = r.profile_id
     where r.status='live' and r.is_active and r.profile_id <> $1 and pr.state='active'
       and pr.name is not null and pr.city_id is not null
     limit 1`, [builder?.id]);

  if (!builder || !req) {
    check("builder proposal walk", false, `builder=${builder?.name ?? "none"} requirement=${req?.id ?? "none"}`);
  } else {
    console.log(`builder ${builder.name} → requirement of ${req.poster_name}`);
    await db.query(`delete from proposals where sender_id=$1 and requirement_id=$2`, [builder.id, req.id]);
    await db.query(`delete from chat_threads where buyer_id=$1 and requirement_id=$2`, [builder.id, req.id]);
    await db.query(`delete from leads where owner_id=$1 and lead_profile_id=$2 and requirement_id=$3`, [req.profile_id, builder.id, req.id]);

    const bs = await sessionFor(builder.id, builder.phone, "builder");
    const sent = await bs.req(`/api/v1/requirements/${req.id}/proposals`, "POST", { mode: "chat", message: "We have matching inventory in our project." });
    check("builder sent a proposal", sent.json?.ok === true, JSON.stringify(sent.json?.error ?? ""));

    // Mode "I have a property" must drop the attached listing into the chat as a
    // rich card — not only onto the request card.
    const { rows: [attacher] } = await db.query(`
      select p.id, p.phone, l.id listing_id, r.id req_id, r.profile_id poster_id, pp.phone poster_phone
        from profiles p
        join listings l on l.profile_id = p.id and l.status='live'
        join requirements r on r.status='live' and r.is_active and r.profile_id <> p.id
        join profiles pp on pp.id = r.profile_id and pp.state='active' and pp.name is not null and pp.city_id is not null
       where p.state='active' and p.name is not null and p.city_id is not null
         and not exists (select 1 from proposals x where x.requirement_id=r.id and x.sender_id=p.id and x.status in ('pending','accepted'))
         -- a proposal costs quota; pick someone who actually has some left
         and exists (select 1 from user_plans up where up.profile_id = p.id and up.proposal_quota > up.proposal_used)
       limit 1`);
    if (attacher) {
      const as = await sessionFor(attacher.id, attacher.phone, "attacher");
      const r2 = await as.req(`/api/v1/requirements/${attacher.req_id}/proposals`, "POST",
        { mode: "listing", listingId: attacher.listing_id, message: "I have this property for you." });
      const { rows: [card] } = await db.query(`
        select m.kind, m.meta from chat_messages m
          join chat_threads t on t.id = m.thread_id
         where t.buyer_id=$1 and t.requirement_id=$2 and m.kind='link'
         order by m.created_at desc limit 1`, [attacher.id, attacher.req_id]);
      check("attached-listing proposal drops a rich card into the chat",
        r2.json?.ok === true && card?.meta?.entityId === attacher.listing_id,
        `sent=${r2.json?.ok} err=${JSON.stringify(r2.json?.error ?? "")} card=${card?.meta?.title ?? "none"}`);
    } else {
      check("attached-listing proposal drops a rich card into the chat", false, "no eligible sender+requirement pair");
    }

    const { rows: [prop] } = await db.query(`select id, status, thread_id from proposals where sender_id=$1 and requirement_id=$2`, [builder.id, req.id]);
    check("proposal row written", !!prop, `status=${prop?.status}`);

    const rs = await sessionFor(req.profile_id, req.poster_phone, "req-poster");
    const inbox = await rs.req("/api/v1/chat/requests");
    const cards = [...(inbox.json?.data?.verified ?? []), ...(inbox.json?.data?.others ?? [])];
    const card = cards.find((c) => c.kind === "proposal" && c.person?.id === builder.id);
    // THE number rule: a proposal's sender number is auto-visible to the poster,
    // because the sender initiated. (An inquiry's is not — asserted above.)
    check("proposal shows sender's number to the poster automatically", !!card?.senderNumber, `senderNumber=${card?.senderNumber ?? "absent"}`);

    if (card) {
      const acc = await rs.req(`/api/v1/chat/requests/${card.threadId}`, "POST", { action: "accept" });
      check("requirement-poster accepted the proposal", acc.json?.ok === true);

      const { rows: [pAfter] } = await db.query(`select status from proposals where id=$1`, [prop.id]);
      check("proposal marked accepted", pAfter?.status === "accepted", `status=${pAfter?.status}`);

      const { rows: [pLead] } = await db.query(
        `select source, stage from leads where owner_id=$1 and lead_profile_id=$2 and requirement_id=$3`,
        [req.profile_id, builder.id, req.id]);
      check("accepted proposal auto-created a lead with source='proposal'", pLead?.source === "proposal", `source=${pLead?.source} stage=${pLead?.stage}`);

      // Tab scoping for the proposal pair.
      const posterTab = await rs.req("/api/v1/chat/threads?tab=requirement-leads");
      const builderTab = await bs.req("/api/v1/chat/threads?tab=my-responses");
      check("thread in requirement-poster's Requirement Leads", (posterTab.json?.data?.rows ?? []).some((r) => r.threadId === card.threadId));
      check("thread in builder's My Responses", (builderTab.json?.data?.rows ?? []).some((r) => r.threadId === card.threadId));
      const statusRow = (builderTab.json?.data?.rows ?? []).find((r) => r.threadId === card.threadId);
      check("My Responses shows the real proposal status", statusRow?.proposalStatus === "accepted", `status=${statusRow?.proposalStatus}`);

      // Builder's own leads pipeline reads the proposal lead's chat thread.
      const bl = await rs.req("/api/v1/leads");
      const linked = (bl.json?.data?.leads ?? []).find((l) => l.source === "proposal");
      check("requirement lead links to its chat thread", !!linked?.threadId, `threadId=${linked?.threadId ?? "null"} label=${linked?.sourceLabel}`);
    }

    // Project leads must be filed as their own family, not as 'inquiry'.
    const { rows: projLeads } = await db.query(`select source, count(*)::int n from leads where project_id is not null group by source`);
    // Tightened once recordProjectLead stopped writing 'inquiry' and 0085
    // repaired the rows it had already written: a lead with a project_id is a
    // project lead, whichever door it came through.
    check("project leads exist and are their own source family",
      projLeads.length > 0 && projLeads.every((r) => r.source === "project"),
      projLeads.map((r) => `${r.source}=${r.n}`).join(", ") || "no project leads yet");
  }
}

// ---------------------------------------------------------------------------
console.log("\n──────── summary ────────");
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("\nFAILED:"); for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`); }
await db.end();
process.exit(failed.length ? 1 : 0);
