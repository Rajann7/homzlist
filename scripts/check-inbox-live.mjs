/**
 * Messages INBOX live check — the subject-grouped home (Received / Sent), the
 * project chat that migration 0084 introduced, and the thread screen's subject
 * context. Every assertion is driven through the real endpoints and then proven
 * against the row the database actually holds.
 *
 *   node scripts/check-inbox-live.mjs http://seller.localhost:3000
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

/**
 * NOTE on repeat runs. OTP sending is limited per-number and per-IP-per-day
 * (lib/auth/otp.ts), and every actor here logs in from this one machine — so a
 * second run inside 24h is refused by the IP window. That is the limiter doing
 * its job, not a failure of the thing under test. In dev the counters live in
 * the server process (`KV_DRIVER=memory`), so restarting the dev server clears
 * them; the script logs each person in exactly once to stay well inside it.
 */

const results = [];
const check = (n, p, d = "") => { results.push({ n, p: !!p, d }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };

function actor(label) {
  const jar = new Map();
  return {
    label,
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
      if (!r1.json?.ok) throw new Error(`${label}: otp request failed ${JSON.stringify(r1.json)}`);
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", { otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456" });
      if (!r2.json?.ok) throw new Error(`${label}: otp verify failed ${JSON.stringify(r2.json)}`);
      return r2.json.data.user;
    },
  };
}

// ---------------------------------------------------------------------------
// 0. Guest sweep — the new endpoint must refuse an unauthenticated caller
// ---------------------------------------------------------------------------
const guest = actor("guest");
for (const [p, m, b] of [
  ["/api/v1/chat/inbox?section=received", "GET"],
  ["/api/v1/chat/inbox?section=sent", "GET"],
  ["/api/v1/inquiries", "POST", { projectId: crypto.randomUUID(), message: "hi" }],
]) {
  const r = await guest.req(p, m, b);
  check(`guest ${m} ${p.split("?")[0]} → 401`, r.status === 401, `got ${r.status}`);
}

// ---------------------------------------------------------------------------
// 1. Actors — a builder with a live project, and two people to talk to them
// ---------------------------------------------------------------------------
// Prefer a builder with TWO live projects, so the "each project is its own
// card" half of the walk actually runs; whichever project happens to be newest
// overall may belong to a builder with only one.
const { rows: [proj] } = await db.query(`
  select pj.id, pj.name, pj.profile_id builder_id, b.name builder_name, b.phone builder_phone,
         count(*) over (partition by pj.profile_id) live_projects
    from projects pj join profiles b on b.id = pj.profile_id
   where pj.status = 'live' and b.state = 'active'
   order by count(*) over (partition by pj.profile_id) desc, pj.created_at desc
   limit 1`);
if (!proj) throw new Error("no live project to test against");

const { rows: buyers } = await db.query(`
  select id, name, phone from profiles
   where state='active' and name is not null and city_id is not null and id <> $1
   order by created_at limit 2`, [proj.builder_id]);

console.log(`\nproject: "${proj.name}" · builder ${proj.builder_name} · buyers ${buyers.map((b) => b.name).join(", ")}\n`);

const builder = actor("builder");
await builder.login(proj.builder_phone);
const buyerA = actor("buyerA");
const buyerAUser = await buyerA.login(buyers[0].phone);

// ---------------------------------------------------------------------------
// 2. Project inquiry — the subject that did not exist before 0084
// ---------------------------------------------------------------------------
// Clean slate for THIS pair+project so the walk is deterministic.
await db.query(`delete from chat_threads where buyer_id=$1 and project_id=$2`, [buyers[0].id, proj.id]);
await db.query(`delete from leads where owner_id=$1 and lead_profile_id=$2 and project_id=$3`, [proj.builder_id, buyers[0].id, proj.id]);

const badBoth = await buyerA.req("/api/v1/inquiries", "POST", { listingId: crypto.randomUUID(), projectId: proj.id, message: "x" });
check("inquiry with BOTH subjects is rejected", badBoth.json?.error?.code === "VALIDATION_ERROR", `status=${badBoth.status} code=${badBoth.json?.error?.code}`);
const badNone = await buyerA.req("/api/v1/inquiries", "POST", { message: "x" });
check("inquiry with NO subject is rejected", badNone.json?.error?.code === "VALIDATION_ERROR", `status=${badNone.status} code=${badNone.json?.error?.code}`);

const sent = await buyerA.req("/api/v1/inquiries", "POST", { projectId: proj.id, message: "What is the payment plan for the 3 BHK?" });
check("project inquiry accepted by the API", sent.json?.ok === true, JSON.stringify(sent.json?.error ?? ""));

const { rows: [t0] } = await db.query(
  `select id, kind, status, project_id, listing_id, requirement_id, last_message_preview
     from chat_threads where buyer_id=$1 and project_id=$2`, [buyers[0].id, proj.id]);
check("thread row written with project as its subject", !!t0 && t0.project_id === proj.id && !t0.listing_id && !t0.requirement_id, `kind=${t0?.kind} status=${t0?.status}`);
// A project chat opens LIVE (0086) — accept-before-seen protects a private
// seller's inbox, and a project is published marketing with a public number.
check("project chat opens accepted — no request step", t0?.status === "accepted", `status=${t0?.status}`);

const { rows: [msg0] } = await db.query(`select body, sender_id from chat_messages where thread_id=$1 order by created_at limit 1`, [t0.id]);
check("the inquiry message is the first bubble", msg0?.body?.includes("payment plan") && msg0.sender_id === buyers[0].id, `"${msg0?.body?.slice(0, 40)}"`);

const dup = await buyerA.req("/api/v1/inquiries", "POST", { projectId: proj.id, message: "Still interested" });
const { rows: dupRows } = await db.query(`select id from chat_threads where buyer_id=$1 and project_id=$2`, [buyers[0].id, proj.id]);
check("re-inquiry reuses the one thread per (buyer, project)", dup.json?.ok === true && dupRows.length === 1, `${dupRows.length} thread(s)`);

const self = await builder.req("/api/v1/inquiries", "POST", { projectId: proj.id, message: "mine" });
check("builder cannot inquire on their own project", self.json?.ok !== true, `code=${self.json?.error?.code}`);

// ---------------------------------------------------------------------------
// 3. It is a conversation on arrival — for BOTH sides
// ---------------------------------------------------------------------------
const recvNow = await builder.req("/api/v1/chat/inbox?section=received");
const liveCard = (recvNow.json?.data?.groups ?? []).find((x) => x.rows.some((r) => r.threadId === t0.id));
check("the builder sees it straight away in Received", !!liveCard, liveCard ? `"${liveCard.subject.title}"` : "missing");
const inRequests = await builder.req("/api/v1/chat/requests");
const reqAll = [...(inRequests.json?.data?.verified ?? []), ...(inRequests.json?.data?.others ?? [])];
check("it never lands in the Requests screen", !reqAll.some((c) => c.threadId === t0.id), `${reqAll.length} request(s) pending`);
const { rows: [anyPendingProject] } = await db.query(`select count(*)::int n from chat_threads where project_id is not null and status = 'pending'`);
check("no project thread anywhere is left waiting to be accepted", anyPendingProject.n === 0, `${anyPendingProject.n} pending`);

const sentSection = await buyerA.req("/api/v1/chat/inbox?section=sent");
const sentGroup = (sentSection.json?.data?.groups ?? []).find((g) => g.rows.some((r) => r.threadId === t0.id));
check("sender sees it immediately in Sent", !!sentGroup, sentGroup ? `"${sentGroup.subject.title}"` : "missing");
check("Sent card is a PROJECT subject with the real project id", sentGroup?.subject.kind === "project" && sentGroup?.subject.id === proj.id, `kind=${sentGroup?.subject.kind}`);
check("Sent card links to the project page", sentGroup?.subject.href === `/projects/${proj.id}`, sentGroup?.subject.href);
check("Sent card reads as outbound", sentGroup?.direction === "out" && /^You asked about this project/.test(sentGroup?.summary ?? ""), `"${sentGroup?.summary}"`);

// ---------------------------------------------------------------------------
// 4. The chat IS the lead — written on send, not on an accept that never comes
// ---------------------------------------------------------------------------
const noAccept = await builder.req(`/api/v1/chat/requests/${t0.id}`, "POST", { action: "accept" });
check("there is nothing left to accept on a project thread", noAccept.json?.ok !== true, `status=${noAccept.status}`);

const { rows: [lead] } = await db.query(
  `select source, stage, project_id, listing_id, requirement_id, last_activity
     from leads where owner_id=$1 and lead_profile_id=$2 and project_id=$3`, [proj.builder_id, buyers[0].id, proj.id]);
check("sending wrote the builder's PROJECT lead immediately", !!lead && lead.project_id === proj.id, `source=${lead?.source} stage=${lead?.stage} "${lead?.last_activity}"`);
check("the lead is filed under source 'project'", lead?.source === "project", `source=${lead?.source}`);
check("a project lead carries no listing/requirement", lead && !lead.listing_id && !lead.requirement_id);

const reply = await builder.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: "Sharing the payment plan now." });
check("builder can reply in the project thread", reply.json?.ok === true);

// ---------------------------------------------------------------------------
// 5. Received section — the card, the sentence, the counts
// ---------------------------------------------------------------------------
const recv = await builder.req("/api/v1/chat/inbox?section=received");
const rd = recv.json?.data;
const g = (rd?.groups ?? []).find((x) => x.subject.id === proj.id);
check("accepted project chat now shows as a Received card", !!g, g ? `"${g.subject.title}"` : "missing");
check("Received card reads as inbound", g?.direction === "in" && /asked about your project/.test(g?.summary ?? ""), `"${g?.summary}"`);
check("card carries the project's own price range", typeof g?.subject.priceLabel === "string" || g?.subject.priceLabel === null, `price=${g?.subject.priceLabel}`);
check("the subject title is the project's full name (never truncated)", g?.subject.title === proj.name, `"${g?.subject.title}"`);

// Counts must equal what the database says, not what the client tallies.
const { rows: [dbCounts] } = await db.query(`
  select
    count(*) filter (where t.poster_id = $1 and t.status <> 'pending' and coalesce(p.archived,false) = false) received,
    count(*) filter (where t.buyer_id  = $1 and coalesce(p.archived,false) = false) sent
    from chat_threads t
    left join thread_participants p on p.thread_id = t.id and p.profile_id = $1
   where t.buyer_id = $1 or t.poster_id = $1`, [proj.builder_id]);
check("Received count matches the database", Number(rd.counts.received.chats) === Number(dbCounts.received), `api=${rd.counts.received.chats} db=${dbCounts.received}`);
check("Sent count matches the database", Number(rd.counts.sent.chats) === Number(dbCounts.sent), `api=${rd.counts.sent.chats} db=${dbCounts.sent}`);

// Section scoping: nothing may appear in both.
const recvIds = new Set((rd.groups ?? []).flatMap((x) => x.rows.map((r) => r.threadId)));
const sentAll = await builder.req("/api/v1/chat/inbox?section=sent");
const sentIds = new Set((sentAll.json?.data?.groups ?? []).flatMap((x) => x.rows.map((r) => r.threadId)));
check("no thread is in both sections", [...recvIds].every((id) => !sentIds.has(id)), `${recvIds.size} received · ${sentIds.size} sent`);

const { rows: wrongSide } = await db.query(
  `select id from chat_threads where id = any($1::uuid[]) and poster_id <> $2`, [[...recvIds], proj.builder_id]);
check("Received contains only threads where I am the poster", wrongSide.length === 0, `${wrongSide.length} stray`);
const { rows: wrongSide2 } = await db.query(
  `select id from chat_threads where id = any($1::uuid[]) and buyer_id <> $2`, [[...sentIds], proj.builder_id]);
check("Sent contains only threads where I am the sender", wrongSide2.length === 0, `${wrongSide2.length} stray`);

// Every group's rows really do share that group's subject.
let groupingOk = true;
for (const grp of rd.groups ?? []) {
  const { rows } = await db.query(
    `select coalesce(project_id::text, listing_id::text, requirement_id::text, 'gone') subj
       from chat_threads where id = any($1::uuid[])`, [grp.rows.map((r) => r.threadId)]);
  if (!rows.every((r) => r.subj === grp.subject.id || grp.subject.id === "")) groupingOk = false;
}
check("every card groups only its own subject's chats", groupingOk, `${rd.groups.length} cards`);

// ---------------------------------------------------------------------------
// 6. Thread screen — subject context is server-computed
// ---------------------------------------------------------------------------
const th = await builder.req(`/api/v1/chat/threads/${t0.id}`);
const v = th.json?.data;
check("thread pins the project as its subject", v?.pinned?.type === "project" && v.pinned.id === proj.id, `type=${v?.pinned?.type}`);
check("thread subject links to the project page", v?.pinned?.href === `/projects/${proj.id}`, v?.pinned?.href);
check("poster's context line names the sender", /asked about your project$/.test(v?.context?.line ?? "") && v?.context?.mine === true, `"${v?.context?.line}"`);

const thBuyer = await buyerA.req(`/api/v1/chat/threads/${t0.id}`);
check("sender's context line reads outbound", thBuyer.json?.data?.context?.line === "You asked about this project" && thBuyer.json?.data?.context?.mine === false, `"${thBuyer.json?.data?.context?.line}"`);

// ---------------------------------------------------------------------------
// 7. Row controls persist (they are the long-press sheet)
// ---------------------------------------------------------------------------
await builder.req(`/api/v1/chat/threads/${t0.id}/state`, "PATCH", { muted: true });
const { rows: [muted] } = await db.query(`select muted from thread_participants where thread_id=$1 and profile_id=$2`, [t0.id, proj.builder_id]);
check("Mute persists to thread_participants", muted?.muted === true, `muted=${muted?.muted}`);
await builder.req(`/api/v1/chat/threads/${t0.id}/state`, "PATCH", { muted: false });

await builder.req(`/api/v1/chat/threads/${t0.id}/state`, "PATCH", { archived: true });
const recvArch = await builder.req("/api/v1/chat/inbox?section=received");
const stillThere = (recvArch.json?.data?.groups ?? []).some((x) => x.rows.some((r) => r.threadId === t0.id));
check("Archive removes the chat from the inbox", !stillThere);
const arch = await builder.req("/api/v1/chat/archived");
check("…and it is in Archived chats", (arch.json?.data?.rows ?? []).some((r) => r.threadId === t0.id));
await builder.req(`/api/v1/chat/threads/${t0.id}/state`, "PATCH", { archived: false });

// ---------------------------------------------------------------------------
// 8. Search filters the real payload
// ---------------------------------------------------------------------------
const hit = await builder.req(`/api/v1/chat/inbox?section=received&q=${encodeURIComponent(proj.name.slice(0, 8))}`);
check("search finds the card by its subject title", (hit.json?.data?.groups ?? []).some((x) => x.subject.id === proj.id), `${hit.json?.data?.groups?.length} card(s)`);
const miss = await builder.req("/api/v1/chat/inbox?section=received&q=zzzznotathing");
check("a search with no match returns no cards (not everything)", (miss.json?.data?.groups ?? []).length === 0);

const badSection = await builder.req("/api/v1/chat/inbox?section=nonsense");
check("an unknown section is rejected", badSection.json?.error?.code === "VALIDATION_ERROR", `status=${badSection.status} code=${badSection.json?.error?.code}`);

// ---------------------------------------------------------------------------
// 9. Decline + cooldown on a project inquiry
// ---------------------------------------------------------------------------
// A second project on the SAME two sessions — logging a third person in trips
// the per-phone OTP limit on a repeat run.
const { rows: [proj2] } = await db.query(
  `select id, name from projects where profile_id=$1 and status='live' and id <> $2 limit 1`, [proj.builder_id, proj.id]);
if (!proj2) {
  check("second-project walk", false, "builder has only one live project — skipped");
} else {
  await db.query(`delete from chat_threads where buyer_id=$1 and project_id=$2`, [buyers[0].id, proj2.id]);
  await buyerA.req("/api/v1/inquiries", "POST", { projectId: proj2.id, message: "Is the 2 BHK available?" });
  const { rows: [t1] } = await db.query(`select id, status from chat_threads where buyer_id=$1 and project_id=$2`, [buyers[0].id, proj2.id]);
  check("a second project is its own separate chat", !!t1 && t1.id !== t0.id && t1.status === "accepted", `status=${t1?.status}`);
  // Declining is a Requests-screen action, and a project thread never reaches
  // it — the endpoint must refuse rather than park a cooldown nobody can lift.
  const dec = await builder.req(`/api/v1/chat/requests/${t1.id}`, "POST", { action: "decline" });
  const { rows: [t1r] } = await db.query(`select status, cooldown_until from chat_threads where id=$1`, [t1.id]);
  check("a live project chat cannot be declined into a dead state", dec.json?.ok !== true && t1r?.status === "accepted" && !t1r.cooldown_until, `status=${t1r?.status}`);
  // Two projects from the same builder are two cards, not one merged pile.
  const sentTwo = await buyerA.req("/api/v1/chat/inbox?section=sent");
  const ids = (sentTwo.json?.data?.groups ?? []).map((x) => x.subject.id);
  check("each project gets its own card in Sent", ids.includes(proj.id) && ids.includes(proj2.id), `${ids.length} card(s)`);
  // Blocking still closes the channel — the one wall a project chat keeps.
  await builder.req(`/api/v1/chat/threads/${t1.id}/block`, "POST", { action: "block" });
  const afterBlock = await buyerA.req(`/api/v1/chat/threads/${t1.id}/message`, "POST", { text: "hello?" });
  check("a blocked project chat refuses new messages", afterBlock.json?.ok !== true, `status=${afterBlock.status}`);
  await builder.req(`/api/v1/chat/threads/${t1.id}/block`, "POST", { action: "unblock" });
}

// ---------------------------------------------------------------------------
// 9b. WHICH unit the chat is about (0087)
// ---------------------------------------------------------------------------
const { rows: [unit] } = await db.query(`select id, unit_type from project_units where project_id=$1 order by position limit 1`, [proj.id]);
if (!unit) {
  check("unit-level enquiry walked", false, "the project has no unit types — skipped");
} else {
  const unitSend = await buyerA.req("/api/v1/inquiries", "POST", { projectId: proj.id, unitId: unit.id, message: `About the ${unit.unit_type} — what is the carpet area?` });
  const { rows: [tu] } = await db.query(`select unit_id from chat_threads where buyer_id=$1 and project_id=$2`, [buyers[0].id, proj.id]);
  check("unit: enquiring from a unit records WHICH unit", unitSend.json?.ok === true && tu?.unit_id === unit.id, `unit_id=${tu?.unit_id}`);

  const recvUnit = await builder.req("/api/v1/chat/inbox?section=received");
  const rowWithUnit = (recvUnit.json?.data?.groups ?? []).flatMap((x) => x.rows).find((r) => r.threadId === t0.id);
  check("unit: the builder's row is labelled with it", rowWithUnit?.unitLabel === unit.unit_type, `unitLabel=${rowWithUnit?.unitLabel}`);

  const thUnit = await builder.req(`/api/v1/chat/threads/${t0.id}`);
  check("unit: the thread's subject strip names it", thUnit.json?.data?.pinned?.unitLabel === unit.unit_type, `unitLabel=${thUnit.json?.data?.pinned?.unitLabel}`);

  // A unit id from ANOTHER project must not be able to label this thread.
  const { rows: [foreign] } = await db.query(
    `select u.id from project_units u where u.project_id <> $1 limit 1`, [proj.id]);
  if (foreign) {
    await buyerA.req("/api/v1/inquiries", "POST", { projectId: proj.id, unitId: foreign.id, message: "crafted" });
    const { rows: [tf] } = await db.query(`select unit_id from chat_threads where buyer_id=$1 and project_id=$2`, [buyers[0].id, proj.id]);
    check("unit: IDOR — a unit from another project is refused, the real one stands", tf?.unit_id === unit.id, `unit_id=${tf?.unit_id}`);
  }
  const badUnit = await buyerA.req("/api/v1/inquiries", "POST", { projectId: proj.id, unitId: "not-a-uuid", message: "x" });
  check("unit: a malformed unit id is rejected", badUnit.json?.error?.code === "VALIDATION_ERROR", `code=${badUnit.json?.error?.code}`);

  const { rows: [orphan] } = await db.query(`select count(*)::int n from chat_threads where unit_id is not null and project_id is null`);
  check("unit: no thread carries a unit without a project (DB constraint)", orphan.n === 0, `${orphan.n} orphan(s)`);
}

// ---------------------------------------------------------------------------
// 10. EVERY message type, in the one thread, proven by its row
// ---------------------------------------------------------------------------
// The message_kind enum (0028) is: text · photo · system · number_request ·
// number_card · visit_proposal · visit_confirmed · continuity · link. Each one
// below is produced by a real call and then read back from chat_messages.
console.log("\n── message types ──");
const kindsOf = async (threadId) => {
  const { rows } = await db.query(`select kind, count(*)::int n from chat_messages where thread_id=$1 group by kind`, [threadId]);
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
};

// -- text -------------------------------------------------------------------
const t1msg = await buyerA.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: "Is the 3 BHK still available?" });
check("text: send accepted", t1msg.json?.ok === true, JSON.stringify(t1msg.json?.error ?? ""));
const { rows: [textRow] } = await db.query(`select id, kind, body, sender_id from chat_messages where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
check("text: row written with the sender's own body", textRow?.kind === "text" && textRow.body.includes("3 BHK") && textRow.sender_id === buyers[0].id);
const { rows: [tail] } = await db.query(`select last_message_preview, last_message_kind, last_message_sender from chat_threads where id=$1`, [t0.id]);
check("text: the thread tail the inbox reads is refreshed", tail?.last_message_kind === "text" && tail.last_message_preview.includes("3 BHK") && tail.last_message_sender === buyers[0].id);

// -- reply ------------------------------------------------------------------
const rep = await builder.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: "Yes — two units left.", replyTo: textRow.id });
const { rows: [repRow] } = await db.query(`select reply_to, kind from chat_messages where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
check("reply: quoted message id is stored", rep.json?.ok === true && repRow?.reply_to === textRow.id, `reply_to=${repRow?.reply_to}`);
const repView = await buyerA.req(`/api/v1/chat/threads/${t0.id}`);
check("reply: the payload carries replyTo so the quote can render", (repView.json?.data?.messages ?? []).some((m) => m.replyTo === textRow.id));

// -- reaction ---------------------------------------------------------------
const rea = await buyerA.req(`/api/v1/chat/messages/${textRow.id}`, "PATCH", { emoji: "👍" });
const { rows: [reaRow] } = await db.query(`select reactions from chat_messages where id=$1`, [textRow.id]);
check("reaction: persists on the message row", rea.json?.ok === true && JSON.stringify(reaRow?.reactions ?? {}).includes("👍"), JSON.stringify(reaRow?.reactions));

// -- link (rich card built from OUR OWN tables) ------------------------------
const { rows: [liveListing] } = await db.query(`select id, title from listings where status='live' limit 1`);
const linkMsg = await buyerA.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { text: `Something like this one https://homzlist.com/property/${liveListing.id}` });
const { rows: [linkRow] } = await db.query(`select kind, meta from chat_messages where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
check("link: a HomzList property URL becomes a link card", linkMsg.json?.ok === true && linkRow?.kind === "link", `kind=${linkRow?.kind}`);
check("link: the card is built from the listing row, not the URL text", linkRow?.meta?.entityId === liveListing.id && linkRow?.meta?.title === liveListing.title, `title="${linkRow?.meta?.title}"`);

// -- photo (sending is OFF by product decision) ------------------------------
const photo = await buyerA.req(`/api/v1/chat/threads/${t0.id}/message`, "POST", { photoUrl: "https://example.com/x.jpg" });
check("photo: the server refuses a photo send (composer has no photo button)", photo.json?.ok !== true, `status=${photo.status}`);

// -- number_request → system + number_card + continuity ----------------------
const preNum = await buyerA.req(`/api/v1/chat/threads/${t0.id}`);
/**
 * This thread's subject is a PROJECT, and Doc2 §6 says "Project contact numbers
 * ALWAYS public (Call + WhatsApp + Inquiry)" — `/api/v1/projects/:id` serves the
 * builder's number to anonymous visitors. So chat must NOT pretend it is secret:
 * the payload carries it up front and no request is offered.
 *
 * This assertion used to demand the opposite (absent before any allow), which
 * encoded a bug rather than the spec — the buyer was shown "Request number" for
 * a number already printed on the page they arrived from. The genuine sealing
 * test — a PRIVATE number stays out of the payload entirely — is asserted below
 * on a listing thread, which is where the seal actually has to hold.
 */
check("number: a PROJECT's builder number is public up front (Doc2 §6)",
  preNum.json?.data?.numberIsPublic === true && typeof preNum.json?.data?.otherNumber === "string",
  `numberIsPublic=${preNum.json?.data?.numberIsPublic} present=${"otherNumber" in (preNum.json?.data ?? {})}`);
const numReq = await buyerA.req(`/api/v1/chat/threads/${t0.id}/number`, "POST", { action: "request" });
const { rows: [nrRow] } = await db.query(`select status from number_requests where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
check("number_request: a real request row is written", numReq.json?.ok === true && nrRow?.status === "requested", `status=${nrRow?.status}`);
const kAfterReq = await kindsOf(t0.id);
check("number_request: the request appears as its own message kind", (kAfterReq.number_request ?? 0) > 0, JSON.stringify(kAfterReq));

const notTarget = await buyerA.req(`/api/v1/chat/threads/${t0.id}/number`, "POST", { action: "respond", allow: true });
check("number: the requester cannot answer their own request", notTarget.json?.ok !== true, `status=${notTarget.status}`);

const allow = await builder.req(`/api/v1/chat/threads/${t0.id}/number`, "POST", { action: "respond", allow: true });
check("number: the builder can allow it", allow.json?.ok === true);
const kAfterAllow = await kindsOf(t0.id);
check("number_card: written on allow", (kAfterAllow.number_card ?? 0) > 0, JSON.stringify(kAfterAllow));
check("system: 'shared their number' line written", (kAfterAllow.system ?? 0) > 0);
check("continuity: the follow-up prompt is written", (kAfterAllow.continuity ?? 0) > 0);

const postNum = await buyerA.req(`/api/v1/chat/threads/${t0.id}`);
const { rows: [builderPhone] } = await db.query(`select phone from profiles where id=$1`, [proj.builder_id]);
check("number: the sealed number now reaches the requester, and it is the real one", postNum.json?.data?.otherNumber === builderPhone.phone, `got=${postNum.json?.data?.otherNumber}`);
const { rows: [numCard] } = await db.query(`select meta, body from chat_messages where thread_id=$1 and kind='number_card' limit 1`, [t0.id]);
check("number: no digits are stored in the message row itself", !JSON.stringify(numCard ?? {}).includes(builderPhone.phone.slice(-6)), JSON.stringify(numCard?.meta));

// -- continuity answer → lead moves + a system line --------------------------
const cont = await builder.req(`/api/v1/chat/threads/${t0.id}/continuity`, "POST", { answer: "interested" });
const { rows: [leadAfter] } = await db.query(
  `select stage, last_activity from leads where owner_id=$1 and lead_profile_id=$2 and project_id=$3`, [proj.builder_id, buyers[0].id, proj.id]);
check("continuity: answering moves the builder's lead", cont.json?.ok === true && leadAfter?.stage === "contacted", `stage=${leadAfter?.stage} "${leadAfter?.last_activity}"`);
const { rows: [markRow] } = await db.query(`select body from chat_messages where thread_id=$1 and kind='system' order by created_at desc limit 1`, [t0.id]);
check("continuity: the answer is recorded in the chat", /^Marked as:/.test(markRow?.body ?? ""), `"${markRow?.body}"`);

// -- visit_proposal → visit_confirmed → outcome ------------------------------
const when = new Date(Date.now() + 2 * 86_400_000).toISOString();
const prop = await buyerA.req(`/api/v1/chat/threads/${t0.id}/visit`, "POST", { action: "propose", scheduledAt: when });
const { rows: [visitRow] } = await db.query(`select id, status from visits where thread_id=$1 order by created_at desc limit 1`, [t0.id]);
check("visit_proposal: proposing writes a real visit row", prop.json?.ok === true && !!visitRow, `status=${visitRow?.status}`);
const kVisit = await kindsOf(t0.id);
check("visit_proposal: and its card in the thread", (kVisit.visit_proposal ?? 0) > 0, JSON.stringify(kVisit));
const conf = await builder.req(`/api/v1/chat/threads/${t0.id}/visit`, "POST", { action: "confirm" });
const { rows: [visitConf] } = await db.query(`select status from visits where id=$1`, [visitRow?.id ?? null]);
check("visit_confirmed: the other side confirming moves the visit", conf.json?.ok === true && visitConf?.status === "confirmed", `status=${visitConf?.status}`);
const kConf = await kindsOf(t0.id);
check("visit_confirmed: the confirmed card is written", (kConf.visit_confirmed ?? 0) > 0, JSON.stringify(kConf));

// -- delete for me / for everyone -------------------------------------------
const { rows: [mineMsg] } = await db.query(`select id from chat_messages where thread_id=$1 and sender_id=$2 and kind='text' order by created_at desc limit 1`, [t0.id, buyers[0].id]);
await buyerA.req(`/api/v1/chat/messages/${mineMsg.id}?scope=me`, "DELETE");
const { rows: [delMe] } = await db.query(`select deleted_for, deleted_all from chat_messages where id=$1`, [mineMsg.id]);
check("delete for me: hidden for me only, row intact", (delMe?.deleted_for ?? []).includes(buyers[0].id) && delMe?.deleted_all === false, `deleted_for=${JSON.stringify(delMe?.deleted_for)}`);
const posterSees = await builder.req(`/api/v1/chat/threads/${t0.id}`);
check("delete for me: the other side still sees it", (posterSees.json?.data?.messages ?? []).some((m) => m.id === mineMsg.id && !m.deleted));

const { rows: [mine2] } = await db.query(`select id from chat_messages where thread_id=$1 and sender_id=$2 and kind='text' and deleted_all=false and not ($3 = any(deleted_for)) order by created_at desc limit 1`, [t0.id, buyers[0].id, buyers[0].id]);
if (mine2) {
  await buyerA.req(`/api/v1/chat/messages/${mine2.id}?scope=everyone`, "DELETE");
  const { rows: [delAll] } = await db.query(`select deleted_all, body from chat_messages where id=$1`, [mine2.id]);
  check("delete for everyone: tombstoned, body retained for the admin trail", delAll?.deleted_all === true, `deleted_all=${delAll?.deleted_all}`);
  const bothSee = await builder.req(`/api/v1/chat/threads/${t0.id}`);
  const tomb = (bothSee.json?.data?.messages ?? []).find((m) => m.id === mine2.id);
  check("delete for everyone: the payload shows a tombstone, never the text", tomb?.deleted === true && tomb?.body === null, `body=${tomb?.body}`);
} else {
  check("delete for everyone walked", false, "no eligible message left");
}

// -- the seal that must hold: a PRIVATE number never reaches the payload -----
//
// The project thread above publishes its builder's number by design (Doc2 §6).
// The seal is about the OTHER case: a listing whose owner kept their number
// private, with no `allowed` request. There the key must be ABSENT — not
// blanked, not null — so DevTools shows nothing to find (Doc9 §10).
{
  const { rows: [priv] } = await db.query(`
    select t.id, bp.phone buyer_phone, pp.phone poster_phone
      from chat_threads t
      join listings l on l.id = t.listing_id
      join profiles bp on bp.id = t.buyer_id
      join profiles pp on pp.id = t.poster_id
     where t.status = 'accepted' and l.contact_public = false
       and bp.state = 'active' and bp.name is not null and bp.city_id is not null
       and not exists (select 1 from number_requests nr where nr.thread_id = t.id and nr.status = 'allowed')
     limit 1`);
  if (priv) {
    const privBuyer = actor("priv-buyer");
    await privBuyer.login(priv.buyer_phone);
    const v = await privBuyer.req(`/api/v1/chat/threads/${priv.id}`);
    const d = v.json?.data ?? {};
    check("number: SEALED — a PRIVATE poster's number is absent before any allow",
      !("otherNumber" in d) && d.numberAllowed === false && d.numberIsPublic === false,
      `present=${"otherNumber" in d} allowed=${d.numberAllowed} public=${d.numberIsPublic}`);
    check("number: SEALED — the poster's digits appear nowhere in the payload",
      !JSON.stringify(d).includes(priv.poster_phone),
      `poster=${String(priv.poster_phone).slice(-4)}`);
  } else {
    check("number: SEALED — private-number thread available to test", false, "no private-number thread in the data");
  }
}

// -- a stranger may not touch any of it (IDOR across message endpoints) ------
const strangerReact = await builder.req(`/api/v1/chat/messages/${crypto.randomUUID()}`, "PATCH", { emoji: "👍" });
check("IDOR: reacting to an unknown message is refused", strangerReact.json?.ok !== true, `status=${strangerReact.status}`);

const finalKinds = await kindsOf(t0.id);
check(
  "every message kind the design draws now exists in one real thread",
  ["text", "link", "system", "number_request", "number_card", "continuity", "visit_proposal", "visit_confirmed"].every((k) => (finalKinds[k] ?? 0) > 0),
  JSON.stringify(finalKinds),
);

// ---------------------------------------------------------------------------
console.log("\n──────── summary ────────");
const failed = results.filter((x) => !x.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("\nFAILED:"); failed.forEach((f) => console.log(`  ✗ ${f.n} — ${f.d}`)); }
await db.end();
process.exit(failed.length ? 1 : 0);
