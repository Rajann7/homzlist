/**
 * Inquiry → Lead connection system, live check.
 *
 * Walks the whole replacement for chat through the real endpoints and then
 * proves every claim against the row the database actually holds:
 *
 *   guest sweep → 401 · options from inquiry_options · send an inquiry ·
 *   inquiries + leads rows · consent row · grouped Received with counts ·
 *   per-subject drill-in with the FULL number · contact event moves New →
 *   Contacted · status write · report into the shared admin queue · Sent tab
 *   derived state · IDOR probes · builder role wall · consent refusal.
 *
 *   node scripts/check-leads-live.mjs http://seller.localhost:3000
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
// 0. Guest sweep — every new endpoint refuses an unauthenticated caller
// ---------------------------------------------------------------------------
const guest = actor("guest");
for (const [p, m, b] of [
  ["/api/v1/leads", "GET"],
  ["/api/v1/leads/sent", "GET"],
  ["/api/v1/leads/subject/listing/00000000-0000-0000-0000-000000000000", "GET"],
  ["/api/v1/contact-numbers", "GET"],
  ["/api/v1/inquiries?kind=listing", "GET"],
  ["/api/v1/inquiries", "POST", { listingId: crypto.randomUUID(), wants: ["price"], consent: true }],
]) {
  const r = await guest.req(p, m, b);
  check(`guest ${m} ${p.split("?")[0]} → 401`, r.status === 401, `got ${r.status}`);
}

// ---------------------------------------------------------------------------
// 1. Actors: a live listing, its owner, and a buyer who is not the owner
// ---------------------------------------------------------------------------
const { rows: [listing] } = await db.query(`
  select l.id, l.title, l.profile_id owner_id, o.name owner_name, o.phone owner_phone
    from listings l join profiles o on o.id = l.profile_id
   where l.status = 'live' and o.state = 'active'
   order by l.created_at desc limit 1`);
if (!listing) throw new Error("no live listing to test against");

const { rows: [buyer] } = await db.query(`
  select id, name, phone, role from profiles
   where state='active' and name is not null and city_id is not null
     and id <> $1 and (role is null or role <> 'builder')
   order by created_at desc limit 1`, [listing.owner_id]);
if (!buyer) throw new Error("no buyer profile to test with");

console.log(`\nlisting ${listing.id} (${listing.title ?? "untitled"}) · owner ${listing.owner_name} · buyer ${buyer.name}\n`);

// Clean slate for a repeatable run.
await db.query(`delete from leads where listing_id=$1 and lead_profile_id=$2`, [listing.id, buyer.id]);
await db.query(`delete from inquiries where listing_id=$1 and profile_id=$2`, [listing.id, buyer.id]);
await db.query(`delete from reports where subject_type='lead' and reporter_id=$1`, [listing.owner_id]);

const buyerA = actor("buyer");
await buyerA.login(buyer.phone);

// ---------------------------------------------------------------------------
// 2. Options come from the config table, not from a component
// ---------------------------------------------------------------------------
const opts = await buyerA.req("/api/v1/inquiries?kind=listing");
const { rows: [{ count: optCount }] } = await db.query(
  `select count(*)::int from inquiry_options where is_active and 'listing' = any(applies_to) and kind='want'`);
check("options served from inquiry_options",
  opts.json?.ok && opts.json.data.wants.length === optCount && optCount > 0,
  `api ${opts.json?.data?.wants?.length} vs db ${optCount}`);
check("consent text + version travel with the options",
  Boolean(opts.json?.data?.consentText && opts.json?.data?.consentVersion), opts.json?.data?.consentVersion);

// ---------------------------------------------------------------------------
// 3. Consent is mandatory, and the wants must be real codes
// ---------------------------------------------------------------------------
const noConsent = await buyerA.req("/api/v1/inquiries", "POST", {
  listingId: listing.id, wants: ["price"], contactPref: "call", whenToken: "tomorrow", consent: false,
});
check("consent:false → 422 (nothing written)", noConsent.status === 422, `got ${noConsent.status}`);

const junk = await buyerA.req("/api/v1/inquiries", "POST", {
  listingId: listing.id, wants: ["definitely_not_an_option"], contactPref: "call", whenToken: "tomorrow", consent: true,
});
check("unknown want code → 422", junk.status === 422, `got ${junk.status}`);

// ---------------------------------------------------------------------------
// 4. Send it for real
// ---------------------------------------------------------------------------
const idem = crypto.randomUUID();
const sent = await buyerA.req("/api/v1/inquiries", "POST", {
  listingId: listing.id, wants: ["price", "photos"], contactPref: "call",
  whenToken: "tomorrow", consent: true, idempotencyKey: idem,
});
check("POST /inquiries → sent", sent.json?.ok === true, JSON.stringify(sent.json?.error ?? sent.status));
const leadId = sent.json?.data?.leadId;

const { rows: [inq] } = await db.query(
  `select wants, contact_pref, when_token, preferred_on, contact_number, consent_version, consent_at, message
     from inquiries where listing_id=$1 and profile_id=$2`, [listing.id, buyer.id]);
check("inquiries row holds the three answers", Boolean(inq) &&
  inq.wants.join(",") === "price,photos" && inq.contact_pref === "call" && inq.when_token === "tomorrow",
  inq ? `${inq.wants} · ${inq.contact_pref} · ${inq.when_token}` : "no row");
check("'tomorrow' resolved to a real date (IST)", Boolean(inq?.preferred_on),
  inq?.preferred_on ? new Date(inq.preferred_on).toISOString().slice(0, 10) : "null");
check("consent recorded as a row, not a checkbox", Boolean(inq?.consent_version && inq?.consent_at),
  `${inq?.consent_version} @ ${inq?.consent_at?.toISOString?.() ?? inq?.consent_at}`);
check("no message composed", inq?.message === "", JSON.stringify(inq?.message));

const { rows: [lead] } = await db.query(
  `select id, stage, seen_at, wants, contact_number, subject_snapshot, inquiry_id
     from leads where listing_id=$1 and lead_profile_id=$2`, [listing.id, buyer.id]);
check("lead created for the owner", Boolean(lead) && lead.stage === "new", lead?.stage);
check("lead snapshots the subject", Boolean(lead?.subject_snapshot?.title), lead?.subject_snapshot?.title);
check("lead is unseen on arrival", lead?.seen_at === null);

// Double-tap Send: same key, still one lead.
await buyerA.req("/api/v1/inquiries", "POST", {
  listingId: listing.id, wants: ["price", "photos"], contactPref: "call",
  whenToken: "tomorrow", consent: true, idempotencyKey: idem,
});
const { rows: [{ count: leadCount }] } = await db.query(
  `select count(*)::int from leads where listing_id=$1 and lead_profile_id=$2`, [listing.id, buyer.id]);
check("re-send does not mint a second lead", leadCount === 1, `${leadCount} rows`);

// ---------------------------------------------------------------------------
// 5. The owner's Received tab
// ---------------------------------------------------------------------------
const ownerA = actor("owner");
await ownerA.login(listing.owner_phone);

const groups = await ownerA.req("/api/v1/leads");
const subject = groups.json?.data?.subjects?.find((s) => s.id === listing.id);
check("Received groups the owner's own posts", Boolean(subject), subject ? `${subject.kind} · ${subject.title}` : "missing");
check("subject carries a live count", subject?.total >= 1 && subject?.unseen >= 1,
  `${subject?.unseen} new / ${subject?.total} total`);

const drill = await ownerA.req(`/api/v1/leads/subject/listing/${listing.id}`);
const mine = drill.json?.data?.leads?.find((l) => l.id === lead.id);
check("drill-in returns that lead", Boolean(mine));
check("owner sees the FULL number, unmasked",
  Boolean(mine?.contactNumber) && !String(mine.contactNumber).includes("•"), mine?.contactNumber);
check("overdue filter exists on the counts", drill.json?.data?.counts?.some((c) => c.key === "overdue"));

// ---------------------------------------------------------------------------
// 6. Contact event — the only proof a connection happened
// ---------------------------------------------------------------------------
await ownerA.req(`/api/v1/leads/${lead.id}`, "PATCH", { action: "contact", channel: "call" });
const { rows: ev } = await db.query(`select channel, actor_id from lead_contact_events where lead_id=$1`, [lead.id]);
check("tapping Call writes a contact event", ev.length === 1 && ev[0].channel === "call", JSON.stringify(ev));
const { rows: [afterCall] } = await db.query(`select stage from leads where id=$1`, [lead.id]);
check("contact event moves New → Contacted", afterCall.stage === "contacted", afterCall.stage);

await ownerA.req(`/api/v1/leads/${lead.id}`, "PATCH", { action: "status", status: "converted" });
const { rows: [afterStatus] } = await db.query(`select stage from leads where id=$1`, [lead.id]);
check("status write persists", afterStatus.stage === "converted", afterStatus.stage);

// ---------------------------------------------------------------------------
// 7. Report → the shared admin queue
// ---------------------------------------------------------------------------
const rep = await ownerA.req(`/api/v1/leads/${lead.id}`, "PATCH", { action: "report", reason: "spam", note: "live check" });
const { rows: [reportRow] } = await db.query(
  `select subject_type, subject_id, reason, status from reports where subject_type='lead' and subject_id=$1`, [lead.id]);
check("report lands in `reports` as subject_type='lead'",
  rep.json?.ok === true && reportRow?.subject_type === "lead" && reportRow?.status === "open",
  reportRow ? `${reportRow.reason} · ${reportRow.status}` : "no row");

// ---------------------------------------------------------------------------
// 8. The sender's Sent tab — and no CRM-stage leak
// ---------------------------------------------------------------------------
const sentTab = await buyerA.req("/api/v1/leads/sent");
const sentRow = sentTab.json?.data?.sent?.find((s) => s.id === lead.id);
check("Sent tab shows the inquiry", Boolean(sentRow), sentRow?.stateLabel);
check("sender sees a derived state, never 'Converted'/'Archived'",
  Boolean(sentRow) && ["Sent", "Seen", "Owner contacted you", "Closed"].includes(sentRow.stateLabel), sentRow?.stateLabel);
check("sender payload carries no pipeline stage",
  Boolean(sentRow) && !("stage" in sentRow) && !("status" in sentRow), Object.keys(sentRow ?? {}).join(","));

// ---------------------------------------------------------------------------
// 9. IDOR probes
// ---------------------------------------------------------------------------
const idor1 = await buyerA.req(`/api/v1/leads/${lead.id}`);
check("buyer GET of the owner's lead → 404", idor1.status === 404, `got ${idor1.status}`);
const idor2 = await buyerA.req(`/api/v1/leads/subject/listing/${listing.id}`);
check("buyer drilling the owner's listing gets an empty list",
  idor2.json?.ok === true && (idor2.json.data.leads?.length ?? 0) === 0, `${idor2.json?.data?.leads?.length} leads`);
const idor3 = await buyerA.req(`/api/v1/leads/${lead.id}`, "PATCH", { action: "status", status: "archived" });
check("buyer cannot move the owner's lead", idor3.status === 404, `got ${idor3.status}`);
const { rows: [untouched] } = await db.query(`select stage from leads where id=$1`, [lead.id]);
check("…and the row really did not move", untouched.stage === "converted", untouched.stage);

// ---------------------------------------------------------------------------
// 10. Self-inquiry and the builder wall
// ---------------------------------------------------------------------------
const self = await ownerA.req("/api/v1/inquiries", "POST", {
  listingId: listing.id, wants: ["price"], contactPref: "call", whenToken: "anytime", consent: true,
});
// SELF_ACTION_BLOCKED has no explicit HTTP mapping in lib/api, so it lands on
// the 400 default. Any 4xx is the refusal; what matters is that nothing wrote.
const { rows: [{ count: selfRows }] } = await db.query(
  `select count(*)::int from inquiries where listing_id=$1 and profile_id=$2`, [listing.id, listing.owner_id]);
check("owner inquiring on their own listing → refused, nothing written",
  self.status >= 400 && self.status < 500 && selfRows === 0, `HTTP ${self.status}, ${selfRows} rows`);

const { rows: [builder] } = await db.query(
  `select id, phone from profiles where role='builder' and state='active' and phone is not null limit 1`);
if (builder) {
  const b = actor("builder");
  await b.login(builder.phone);
  const bTry = await b.req("/api/v1/inquiries", "POST", {
    listingId: listing.id, wants: ["price"], contactPref: "call", whenToken: "anytime", consent: true,
  });
  check("builder cannot inquire on a property → 403", bTry.status === 403, `got ${bTry.status}`);
  const bOpts = await b.req("/api/v1/inquiries?kind=listing");
  check("…and the sheet is told not to render the button", bOpts.json?.data?.allowed === false, String(bOpts.json?.data?.allowed));
} else {
  check("builder wall (skipped — no builder profile)", true, "no builder in dev data");
}

// ---------------------------------------------------------------------------
// 11. /messages must not 404 — old links, pushes and the PWA shortcut
// ---------------------------------------------------------------------------
const redirect = await ownerA.req("/messages");
check("/messages redirects instead of 404", redirect.status === 307 || redirect.status === 308 || redirect.status === 200,
  `got ${redirect.status}`);

// ---------------------------------------------------------------------------
// 12. Requirement side — Send Proposal (I Have a Property / I Can Arrange It)
// ---------------------------------------------------------------------------
const { rows: [req] } = await db.query(`
  select r.id, r.profile_id owner_id, o.phone owner_phone
    from requirements r join profiles o on o.id = r.profile_id
   where r.status='live' and r.is_active and o.state='active'
   order by r.created_at desc limit 1`);

// Somebody with proposal quota left — otherwise NEED_TOPUP is all this walk
// can ever prove, which is the wall, not the flow.
const { rows: [proposer] } = await db.query(`
  select p.id, p.name, p.phone
    from user_plans up join profiles p on p.id = up.profile_id
   where up.status='active' and (up.proposal_quota < 0 or up.proposal_used < up.proposal_quota)
     and p.state='active' and p.name is not null and p.city_id is not null
     and (p.role is null or p.role <> 'builder')
   order by (up.proposal_quota < 0) desc, (up.proposal_quota - up.proposal_used) desc
   limit 1`);

if (req && proposer && req.owner_id !== proposer.id) {
  await db.query(`delete from leads where requirement_id=$1 and lead_profile_id=$2`, [req.id, proposer.id]);
  await db.query(`delete from proposals where requirement_id=$1 and sender_id=$2`, [req.id, proposer.id]);

  const buyerA = actor("proposer");
  await buyerA.login(proposer.phone);
  const buyer = proposer;

  const sheet = await buyerA.req(`/api/v1/requirements/${req.id}/proposals`);
  check("proposal sheet serves chips + consent from the config table",
    sheet.json?.ok && Array.isArray(sheet.json.data.offers) && sheet.json.data.offers.length > 0 && Boolean(sheet.json.data.consentText),
    `${sheet.json?.data?.offers?.length} offer chips`);
  check("proposal sheet lists projects as offerable too",
    sheet.json?.ok && Array.isArray(sheet.json.data.projects), typeof sheet.json?.data?.projects);

  const noConsentProp = await buyerA.req(`/api/v1/requirements/${req.id}/proposals`, "POST", {
    mode: "help", offers: ["matching_soon"], contactPref: "call", whenToken: "anytime", consent: false,
  });
  check("proposal without consent → 422", noConsentProp.status === 422, `got ${noConsentProp.status}`);
  const { rows: [{ count: propRows0 }] } = await db.query(
    `select count(*)::int from proposals where requirement_id=$1 and sender_id=$2`, [req.id, buyer.id]);
  check("…and nothing was written", propRows0 === 0, `${propRows0} rows`);

  const propSend = await buyerA.req(`/api/v1/requirements/${req.id}/proposals`, "POST", {
    mode: "help", offers: ["matching_soon", "loan_help"], contactPref: "whatsapp", whenToken: "today", consent: true,
  });
  check("proposal send → sent", propSend.json?.ok === true, JSON.stringify(propSend.json?.error ?? propSend.status));

  if (propSend.json?.ok) {
    const { rows: [propLead] } = await db.query(
      `select l.id, l.stage, l.wants, l.contact_pref, l.when_token, l.preferred_on, l.proposal_id,
              p.consent_version, p.mode
         from leads l join proposals p on p.id = l.proposal_id
        where l.requirement_id=$1 and l.lead_profile_id=$2`, [req.id, buyer.id]);
    check("proposal creates a lead for the requirement owner", Boolean(propLead) && propLead.stage === "new", propLead?.stage);
    check("…carrying the three answers",
      propLead?.wants?.join(",") === "matching_soon,loan_help" && propLead?.contact_pref === "whatsapp" && propLead?.when_token === "today",
      `${propLead?.wants} · ${propLead?.contact_pref} · ${propLead?.when_token}`);
    check("…stored as mode 'help', not the retired 'chat'", propLead?.mode === "help", propLead?.mode);
    check("…with a consent record on the proposal", Boolean(propLead?.consent_version), propLead?.consent_version);
    check("'today' resolved to a date", Boolean(propLead?.preferred_on),
      propLead?.preferred_on ? new Date(propLead.preferred_on).toISOString().slice(0, 10) : "null");
  }
} else {
  check("requirement proposal walk (skipped — no live requirement or nobody with quota)", true, "dev data");
}

// ---------------------------------------------------------------------------
// 13. Admin surfaces — the lead viewer replaced the chat viewer
// ---------------------------------------------------------------------------
const adminGuest = await guest.req(`/api/v1/admin/leads/${lead.id}`);
check("admin lead viewer refuses a non-admin", adminGuest.status === 401 || adminGuest.status === 403, `got ${adminGuest.status}`);
const adminAsUser = await ownerA.req(`/api/v1/admin/leads/${lead.id}`);
check("…and refuses a signed-in ordinary user too", adminAsUser.status === 401 || adminAsUser.status === 403, `got ${adminAsUser.status}`);
const goneChat = await ownerA.req(`/api/v1/admin/threads/${lead.id}`);
check("the old admin chat viewer is gone", goneChat.status === 404, `got ${goneChat.status}`);

// The report the owner filed must be visible in the queue view the admin
// screen reads — that is what "it shows in admin" means.
const { rows: [queued] } = await db.query(
  `select subject_type, report_count from admin_report_queue where subject_id=$1`, [lead.id]);
check("lead report appears in admin_report_queue",
  queued?.subject_type === "lead", queued ? `${queued.subject_type} · ${queued.report_count}` : "not in queue");

// ---------------------------------------------------------------------------
// 14. The reminder jobs exist AND run (a promise with a job behind it)
// ---------------------------------------------------------------------------
if (E.CRON_SECRET) {
  const cron = await fetch(`${BASE}/api/v1/cron/notifications`, {
    method: "POST", headers: { authorization: `Bearer ${E.CRON_SECRET}` },
  });
  const cj = await cron.json().catch(() => null);
  const sched = cj?.data?.scheduled;
  check("notification cron runs the lead nudges",
    cron.status === 200 && sched && "leadDueToday" in sched && "leadUnanswered" in sched,
    sched ? `due=${sched.leadDueToday} unanswered=${sched.leadUnanswered}` : `HTTP ${cron.status}`);
} else {
  check("lead nudge cron (skipped — no CRON_SECRET in .env.local)", true, "");
}

// ---------------------------------------------------------------------------
console.log("");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:"); failed.forEach((f) => console.log(` ❌ ${f.n} — ${f.d}`)); }
await db.end();
process.exit(failed.length ? 1 : 0);
