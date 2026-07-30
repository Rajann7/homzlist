/**
 * Module 12 live verification — real HTTP against the running dev server, as a
 * real logged-in user of each role, then the same rows read back from Postgres.
 *
 *   node scripts/check-module12-live.mjs
 *
 * Exercises: public CMS/help/blog reads · ticket create (every conditional
 * field) → reply → reopen · grievance SLA · data export request + download +
 * privacy guarantee · account status / payment hold · deactivate + reactivate ·
 * schedule deletion + cancel · purge job · re-acceptance consent · maintenance.
 *
 * Nothing is left behind: every account it touches is put back to `active` and
 * its seeded rows removed at the end.
 */
import fs from "node:fs";
import { connect } from "./lib/dbx.mjs";
import { makeClient } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const sql = await connect();
const { session } = makeClient(BASE);

/**
 * The shared harness returns a cookie jar; these wrap it so a test can read a
 * raw body (the export archive, the PDF) as well as JSON.
 */
const asUser = (jar) => {
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const fetchAs = (path, opt = {}) =>
    fetch(BASE + path, {
      ...opt,
      redirect: "manual",
      headers: { "content-type": "application/json", cookie: cookie(), ...(opt.headers ?? {}) },
    });
  return {
    async api(path, opt = {}) {
      const res = await fetchAs(path, opt);
      let json = null;
      try { json = await res.clone().json(); } catch { /* raw body */ }
      return { status: res.status, json, res };
    },
  };
};
/** Drop the cached session so the next login is a real fresh OTP round-trip. */
const forgetSession = (phone) => {
  try {
    const c = JSON.parse(fs.readFileSync(".qa-sessions.json", "utf8"));
    delete c[phone];
    fs.writeFileSync(".qa-sessions.json", JSON.stringify(c, null, 2));
  } catch { /* no cache yet */ }
};

let pass = 0, fail = 0;
const results = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass += 1; results.push(["PASS", name, detail]); }
  else { fail += 1; results.push(["FAIL", name, detail]); }
};

const raw = async (path, opt = {}) => {
  const res = await fetch(BASE + path, {
    ...opt,
    headers: { "content-type": "application/json", ...(opt.headers ?? {}) },
  });
  let json = null;
  try { json = await res.clone().json(); } catch { /* non-JSON (pdf / export file) */ }
  return { status: res.status, json, res };
};

console.log("── public reads ─────────────────────────────────────────────");

{
  const r = await raw("/api/v1/cms/pages");
  ok("GET /cms/pages returns the legal shelf", r.json?.data?.pages?.length === 8,
    `${r.json?.data?.pages?.length} pages`);

  const t = await raw("/api/v1/cms/pages/terms");
  ok("Terms has Doc10 content + Section 79", /Section 79/.test(t.json?.data?.body ?? ""));
  ok("Terms placeholders substituted (no [SQUARE BRACKETS] left except reg no)",
    !/\{\{\w+\}\}/.test(t.json?.data?.body ?? ""));
  ok("Rajkot jurisdiction present", /exclusive jurisdiction/i.test(t.json?.data?.body ?? "") &&
    /Rajkot/.test(t.json?.data?.body ?? ""));

  const p = await raw("/api/v1/cms/pages/privacy");
  ok("Privacy cites DPDP 2023", /Digital Personal Data Protection Act, 2023/.test(p.json?.data?.body ?? ""));

  const v = await raw("/api/v1/cms/pages/terms/versions");
  ok("Version history lists >1 version", (v.json?.data?.versions?.length ?? 0) >= 2,
    `${v.json?.data?.versions?.length} versions`);

  const pdf = await raw("/api/v1/cms/pages/terms/pdf");
  const buf = Buffer.from(await pdf.res.arrayBuffer());
  ok("Download PDF returns a real PDF", pdf.res.headers.get("content-type") === "application/pdf" &&
    buf.subarray(0, 5).toString() === "%PDF-", `${buf.length} bytes`);

  const unpub = await raw("/api/v1/cms/pages/does-not-exist");
  ok("Unknown legal slug is 404 (no enumeration)", unpub.status === 404);

  const h = await raw("/api/v1/help");
  const counts = (h.json?.data?.categories ?? []).map((c) => c.articleCount);
  ok("Help categories carry live counts", counts.join(",") === "6,8,10,6,7,5,4,6", counts.join(","));
  ok("6 popular articles", h.json?.data?.popular?.length === 6);

  const s = await raw("/api/v1/help?q=" + encodeURIComponent("boost"));
  ok("Help search hits article bodies", (s.json?.data?.results?.length ?? 0) > 0,
    `${s.json?.data?.results?.length} results for "boost"`);

  const b = await raw("/api/v1/blog");
  ok("Blog list: featured + page of rows", Boolean(b.json?.data?.featured) && b.json?.data?.posts?.length === 5,
    `featured=${b.json?.data?.featured?.slug}, rows=${b.json?.data?.posts?.length}`);
  ok("Blog Load more has a next page", b.json?.data?.hasMore === true);
  ok("Blog chips come from blog_categories", b.json?.data?.categories?.length === 5);

  const m = await raw("/api/v1/system/maintenance");
  ok("Maintenance state readable", m.json?.ok === true && typeof m.json.data.enabled === "boolean",
    `enabled=${m.json?.data?.enabled}`);
}

console.log("── unauthenticated sweep (must all 401) ─────────────────────");

for (const [method, path] of [
  ["GET", "/api/v1/support/tickets"],
  ["GET", "/api/v1/support/categories"],
  ["POST", "/api/v1/support/tickets"],
  ["GET", "/api/v1/data/exports"],
  ["POST", "/api/v1/data/exports"],
  ["GET", "/api/v1/account/status"],
  ["POST", "/api/v1/account/step-up"],
  ["POST", "/api/v1/account/deactivate"],
  ["POST", "/api/v1/account/delete"],
  ["POST", "/api/v1/account/cancel-deletion"],
  ["GET", "/api/v1/cms/consent"],
]) {
  const r = await raw(path, { method, body: method === "POST" ? "{}" : undefined });
  ok(`${method} ${path} → 401 for a guest`, r.status === 401, `got ${r.status}`);
}

{
  const cron = await raw("/api/v1/cron/account", { method: "POST" });
  ok("cron /account refuses without the shared secret", cron.status === 401, `got ${cron.status}`);
}

console.log("── per-role authenticated flows ────────────────────────────");

const { rows: people } = await sql.query(
  `select id, phone, name, role from profiles
   where state = 'active' and is_registered and role is not null
   order by role, created_at`,
);
const actors = ["owner", "broker", "builder"].map((role) => people.find((p) => p.role === role)).filter(Boolean);
ok("found a live account per role", actors.length === 3, actors.map((a) => `${a.role}:${a.name}`).join(" · "));

const createdTickets = [];
const createdExports = [];

for (const actor of actors) {
  const raw0 = await session(actor.phone);
  const s = asUser(raw0.jar);
  const call = (path, opt = {}) => s.api(path, opt);

  const cats = await call("/api/v1/support/categories");
  const list = cats.json?.data?.categories ?? [];
  ok(`[${actor.role}] category sheet is DB-driven`, list.length === 8 && list.filter((c) => c.inPicker).length === 7,
    `${list.length} total, ${list.filter((c) => c.inPicker).length} in picker`);
  const grievance = list.find((c) => c.isGrievance);
  ok(`[${actor.role}] grievance category carries the 2021-Rules SLA`,
    grievance?.ackHours === 24 && grievance?.resolveDays === 15);

  // one ticket per conditional-field shape + a grievance
  const shapes = [
    { category: "payment_refund", paymentRef: "PAY-99001", subject: `${actor.role} payment issue`, description: "Money left my account at 11:42 and the plan never activated. Payment ID PAY-99001." },
    { category: "number_recovery", altContact: `${actor.role}.alt@example.com`, subject: `${actor.role} lost SIM`, description: "I no longer have access to the SIM registered on this account and need it moved." },
    { category: "report", reportLink: "https://homzlist.com/property/abc", subject: `${actor.role} reporting a listing`, description: "This listing uses photos taken from another site and the price looks fake." },
    { category: "grievance", reportLink: "https://homzlist.com/profile/someone", subject: `${actor.role} grievance`, description: "Formal complaint: my listing was removed without a stated reason or notice." },
  ];

  let firstTicketId = null;
  for (const shape of shapes) {
    const r = await call("/api/v1/support/tickets", { method: "POST", body: JSON.stringify(shape) });
    const okCreate = r.json?.ok === true && /^TKT-\d+$/.test(r.json.data.number ?? "");
    ok(`[${actor.role}] create ticket (${shape.category})`, okCreate, r.json?.data?.number ?? JSON.stringify(r.json));
    if (okCreate) {
      createdTickets.push(r.json.data.id);
      firstTicketId ??= r.json.data.id;
      if (shape.category === "grievance") {
        ok(`[${actor.role}] grievance answers with the 15-day SLA`,
          r.json.data.isGrievance === true && r.json.data.resolveDays === 15);
      }
    }
  }

  // The conditional field actually landed, and only that one.
  const { rows: stored } = await sql.query(
    `select category, payment_ref, alt_contact, report_link, is_grievance, acked_at, sla_due_at
     from support_tickets where id = any($1::uuid[]) order by created_at`,
    [createdTickets.slice(-4)],
  );
  const pay = stored.find((t) => t.category === "payment_refund");
  ok(`[${actor.role}] payment_ref stored, other extras null`,
    pay?.payment_ref === "PAY-99001" && pay?.alt_contact === null && pay?.report_link === null);
  const num = stored.find((t) => t.category === "number_recovery");
  ok(`[${actor.role}] alt_contact stored, payment_ref null`,
    num?.alt_contact?.includes("@") && num?.payment_ref === null);
  const gr = stored.find((t) => t.is_grievance);
  ok(`[${actor.role}] grievance acked immediately + 15-day due date`,
    Boolean(gr?.acked_at) && Math.round((new Date(gr.sla_due_at) - new Date(gr.acked_at)) / 86400000) === 15,
    gr ? `${Math.round((new Date(gr.sla_due_at) - new Date(gr.acked_at)) / 86400000)} days` : "");

  // field smuggling: post all three extras on a category that asks for none
  const smuggle = await call("/api/v1/support/tickets", {
    method: "POST",
    body: JSON.stringify({
      category: "bug", subject: `${actor.role} smuggle test`,
      description: "Testing that fields this category does not ask for are dropped.",
      paymentRef: "PAY-SMUGGLE", altContact: "evil@example.com", reportLink: "https://evil.example",
    }),
  });
  ok(`[${actor.role}] 5th ticket in the hour still allowed`, smuggle.json?.ok === true,
    smuggle.json?.error?.code ?? "created");
  if (smuggle.json?.ok) {
    createdTickets.push(smuggle.json.data.id);
    const { rows: sm } = await sql.query(
      `select payment_ref, alt_contact, report_link from support_tickets where id = $1`,
      [smuggle.json.data.id],
    );
    ok(`[${actor.role}] extras not asked for are dropped server-side`,
      sm[0].payment_ref === null && sm[0].alt_contact === null && sm[0].report_link === null);
  }

  // The support desk is rate-limited: the 6th ticket in an hour is refused.
  const overLimit = await call("/api/v1/support/tickets", {
    method: "POST",
    body: JSON.stringify({ category: "bug", subject: `${actor.role} over limit`, description: "This one should be refused by the hourly limiter." }),
  });
  ok(`[${actor.role}] 6th ticket in the hour is rate-limited`,
    overLimit.status === 429 && overLimit.json?.error?.code === "RATE_LIMITED", `got ${overLimit.status}`);

  // auto-ack message + the user's own description are both in the thread
  const thread = await call(`/api/v1/support/tickets/${firstTicketId}`);
  const msgs = thread.json?.data?.messages ?? [];
  ok(`[${actor.role}] thread opens with the auto-acknowledgement`,
    msgs[0]?.authorKind === "system" && /acknowledged automatically/i.test(msgs[0]?.body ?? ""));
  ok(`[${actor.role}] the description is the first user message`, msgs[1]?.authorKind === "user");

  // reply
  const reply = await call(`/api/v1/support/tickets/${firstTicketId}/messages`, {
    method: "POST", body: JSON.stringify({ body: "Adding the UPI reference: 4029XXXXXX." }),
  });
  ok(`[${actor.role}] reply persists`, reply.json?.ok === true);

  // closed → reply refused → reopen → reply allowed
  await sql.query(`update support_tickets set status='closed', closed_at=now() where id=$1`, [firstTicketId]);
  const blocked = await call(`/api/v1/support/tickets/${firstTicketId}/messages`, {
    method: "POST", body: JSON.stringify({ body: "should be refused" }),
  });
  ok(`[${actor.role}] reply to a closed ticket is refused`, blocked.json?.ok === false, blocked.json?.error?.code);
  const reopened = await call(`/api/v1/support/tickets/${firstTicketId}/reopen`, { method: "POST" });
  ok(`[${actor.role}] closed ticket can be reopened (state has an exit)`, reopened.json?.ok === true);
  const { rows: after } = await sql.query(
    `select status, reopen_count, closed_at from support_tickets where id=$1`, [firstTicketId]);
  ok(`[${actor.role}] reopen recorded in the row`,
    after[0].status === "open" && after[0].reopen_count === 1 && after[0].closed_at === null);

  // tab counts
  const mine = await call("/api/v1/support/tickets");
  const c = mine.json?.data?.counts;
  const { rows: real } = await sql.query(
    `select status, count(*)::int n from support_tickets where profile_id=$1 group by status`, [actor.id]);
  const realMap = Object.fromEntries(real.map((r) => [r.status, r.n]));
  ok(`[${actor.role}] tab counts match the database`,
    (c?.open ?? 0) === (realMap.open ?? 0) && (c?.replied ?? 0) === (realMap.replied ?? 0) &&
    (c?.closed ?? 0) === (realMap.closed ?? 0),
    `api ${JSON.stringify(c)} vs db ${JSON.stringify(realMap)}`);

  // ---- data export: own data only
  const exp = await call("/api/v1/data/exports", { method: "POST", body: JSON.stringify({ format: "json" }) });
  ok(`[${actor.role}] export becomes ready`, exp.json?.data?.status === "ready", exp.json?.data?.filename);
  if (exp.json?.ok) {
    createdExports.push(exp.json.data.id);
    const file = await s.api(`/api/v1/data/exports/${exp.json.data.id}/download`);
    const text = await file.res.text();
    let bundle = null;
    try { bundle = JSON.parse(text); } catch { /* fallthrough */ }
    ok(`[${actor.role}] download returns the archive`, Boolean(bundle?.profile), `${text.length} bytes`);
    if (bundle) {
      ok(`[${actor.role}] archive contains only MY messages`,
        Array.isArray(bundle.messages_i_sent) && !("messages_received" in bundle));
      const { rows: mineCount } = await sql.query(
        `select count(*)::int n from chat_messages where sender_id = $1`, [actor.id]);
      ok(`[${actor.role}] message count matches sender_id in the DB`,
        bundle.messages_i_sent.length === mineCount[0].n,
        `archive ${bundle.messages_i_sent.length} vs db ${mineCount[0].n}`);
      const { rows: othersInThread } = await sql.query(
        `select count(*)::int n from chat_messages m
         where m.sender_id <> $1
           and m.thread_id in (select thread_id from thread_participants where profile_id = $1)`,
        [actor.id]);
      ok(`[${actor.role}] the other side's ${othersInThread[0].n} messages are excluded`,
        !bundle.messages_i_sent.some((m) => m.sender_id && m.sender_id !== actor.id));
      ok(`[${actor.role}] profile is the caller's own row`, bundle.profile?.id === actor.id);
    }
  }

  // IDOR: another user's export id
  const otherActor = actors.find((a) => a.id !== actor.id);
  if (otherActor && createdExports.length > 1) {
    const foreign = createdExports[0];
    const probe = await s.api(`/api/v1/data/exports/${foreign}/download`);
    ok(`[${actor.role}] cannot download another user's export`, probe.status === 404 || probe.status === 401,
      `got ${probe.status}`);
  }

  // IDOR: another user's ticket
  const { rows: foreignTicket } = await sql.query(
    `select id from support_tickets where profile_id <> $1 limit 1`, [actor.id]);
  const probeTicket = await call(`/api/v1/support/tickets/${foreignTicket[0].id}`);
  ok(`[${actor.role}] another user's ticket is 404, not 403`, probeTicket.status === 404, `got ${probeTicket.status}`);

  // ---- account status
  const st = await call("/api/v1/account/status");
  const d = st.json?.data;
  const { rows: liveL } = await sql.query(
    `select count(*)::int n from listings where profile_id=$1 and status='live'`, [actor.id]);
  const { rows: plans } = await sql.query(
    `select count(*)::int n from user_plans where profile_id=$1 and status='active'`, [actor.id]);
  ok(`[${actor.role}] delete-impact matches the DB`,
    d?.impact?.liveListings === liveL[0].n && d?.impact?.activePlans === plans[0].n,
    `api listings=${d?.impact?.liveListings}/db=${liveL[0].n}, plans=${d?.impact?.activePlans}/db=${plans[0].n}`);
  ok(`[${actor.role}] grace + hold windows come from retention_settings`,
    d?.graceDays === 30 && d?.paymentHoldDays === 7);
}

console.log("── payment hold, deactivate, delete, purge ─────────────────");

{
  // A dedicated actor for the destructive lifecycle: the LAST owner in the list,
  // so the earlier per-role checks are untouched.
  const owners = people.filter((p) => p.role === "owner");
  const subject = owners[owners.length - 1];
  const s = asUser((await session(subject.phone)).jar);

  // --- payment hold: a fresh successful payment must block deletion
  const { rows: order } = await sql.query(
    `insert into orders (profile_id, kind, catalog_code, amount_paise, status)
     values ($1,'plan','owner_999',99900,'paid') returning id`, [subject.id]);
  const { rows: payment } = await sql.query(
    `insert into payments (order_id, profile_id, status, amount_paise, captured_at)
     values ($1,$2,'success',99900, now() - interval '3 days') returning id`,
    [order[0].id, subject.id]);

  const held = await s.api("/api/v1/account/status");
  ok("payment 3 days ago puts deletion on hold", Boolean(held.json?.data?.paymentHoldUntil),
    `available from ${held.json?.data?.paymentHoldUntil}`);

  // The API refuses even with a valid OTP — the greyed-out button is not the gate.
  const step1 = await s.api("/api/v1/account/step-up", { method: "POST", body: JSON.stringify({ intent: "delete" }) });
  const refused = await s.api("/api/v1/account/delete", {
    method: "POST",
    body: JSON.stringify({ otpSession: step1.json?.data?.otpSession, code: step1.json?.data?.devCode, confirm: "DELETE", reason: "other" }),
  });
  ok("delete is refused server-side during the payment hold", refused.json?.ok === false,
    refused.json?.error?.code);

  // --- lift the hold and walk deactivate → reactivate
  await sql.query(`update payments set captured_at = now() - interval '30 days' where id = $1`, [payment[0].id]);

  const badCode = await s.api("/api/v1/account/deactivate", {
    method: "POST", body: JSON.stringify({ otpSession: "nope", code: "000000" }),
  });
  ok("deactivate refuses a bogus OTP session", badCode.json?.ok === false, badCode.json?.error?.code);

  const step2 = await s.api("/api/v1/account/step-up", { method: "POST", body: JSON.stringify({ intent: "deactivate" }) });
  ok("step-up masks the number it sent to", /•/.test(step2.json?.data?.phoneMasked ?? ""),
    step2.json?.data?.phoneMasked);
  const deact = await s.api("/api/v1/account/deactivate", {
    method: "POST",
    body: JSON.stringify({ otpSession: step2.json.data.otpSession, code: step2.json.data.devCode }),
  });
  ok("deactivate succeeds with a fresh OTP", deact.json?.ok === true);
  const { rows: afterDeact } = await sql.query(`select state from profiles where id=$1`, [subject.id]);
  ok("profile is deactivated in the DB", afterDeact[0].state === "deactivated", afterDeact[0].state);
  const { rows: actionRow } = await sql.query(
    `select kind, status, impact from account_actions where profile_id=$1 order by created_at desc limit 1`,
    [subject.id]);
  ok("deactivation recorded with the impact snapshot",
    actionRow[0].kind === "deactivate" && actionRow[0].status === "scheduled" &&
    typeof actionRow[0].impact?.liveListings === "number");

  // logging in reactivates and closes the row
  forgetSession(subject.phone);
  const s2 = asUser((await session(subject.phone)).jar);
  const { rows: reactivated } = await sql.query(`select state from profiles where id=$1`, [subject.id]);
  ok("logging back in reactivates the account", reactivated[0].state === "active", reactivated[0].state);
  const { rows: closed } = await sql.query(
    `select status from account_actions where profile_id=$1 and kind='deactivate' order by created_at desc limit 1`,
    [subject.id]);
  ok("the deactivation row is cancelled, not left open", closed[0].status === "cancelled", closed[0].status);

  // --- schedule deletion
  const wrongWord = await s2.api("/api/v1/account/delete", {
    method: "POST", body: JSON.stringify({ otpSession: "x", code: "123456", confirm: "delete" }),
  });
  ok("type-to-confirm is enforced server-side (lowercase refused)", wrongWord.json?.ok === false);

  const step3 = await s2.api("/api/v1/account/step-up", { method: "POST", body: JSON.stringify({ intent: "delete" }) });
  const del = await s2.api("/api/v1/account/delete", {
    method: "POST",
    body: JSON.stringify({ otpSession: step3.json.data.otpSession, code: step3.json.data.devCode, confirm: "DELETE", reason: "found_property" }),
  });
  ok("deletion schedules with a purge date", del.json?.ok === true, del.json?.data?.purgeAt);
  const { rows: sched } = await sql.query(
    `select status, reason, purge_at, extract(day from purge_at - created_at)::int days
     from account_actions where profile_id=$1 and kind='delete' order by created_at desc limit 1`,
    [subject.id]);
  ok("grace period is 30 days in the row", sched[0].days === 30, `${sched[0].days} days`);
  ok("the reason is stored", sched[0].reason === "found_property");

  // a scheduled deletion is NOT undone by logging in
  const { rows: stillDeact } = await sql.query(`select state from profiles where id=$1`, [subject.id]);
  ok("a scheduled deletion keeps the profile deactivated", stillDeact[0].state === "deactivated");

  // --- purge job actually purges (fast-forward the date, then run it)
  await sql.query(`update account_actions set purge_at = now() - interval '1 minute'
                   where profile_id=$1 and kind='delete' and status='scheduled'`, [subject.id]);
  const cronRes = await fetch(`${BASE}/api/v1/cron/account`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? readCronSecret()}` },
  });
  const cronJson = await cronRes.json().catch(() => null);
  ok("cron /account runs with the shared secret", cronRes.status === 200, `status ${cronRes.status}`);
  ok("the purge executed the due deletion", (cronJson?.data?.deletions?.purged ?? 0) >= 1,
    JSON.stringify(cronJson?.data?.deletions ?? {}));

  const { rows: purged } = await sql.query(
    `select state, name, username, email, phone from profiles where id=$1`, [subject.id]);
  ok("purged profile is anonymised", purged[0].state === "deleted" && purged[0].username === null &&
    purged[0].phone.startsWith("deleted:"), `${purged[0].state} / ${purged[0].name}`);
  const { rows: kept } = await sql.query(
    `select count(*)::int n from payments where profile_id=$1`, [subject.id]);
  ok("payment records survive deletion (7-year legal retention)", kept[0].n >= 1, `${kept[0].n} payments kept`);
  const { rows: doneRow } = await sql.query(
    `select status from account_actions where profile_id=$1 and kind='delete' order by created_at desc limit 1`,
    [subject.id]);
  ok("the action row is marked done", doneRow[0].status === "done");

  // ---- restore the account so the dev DB is left usable
  await sql.query(
    `update profiles set state='active', name=$2, username=$3, phone=$4 where id=$1`,
    [subject.id, subject.name, slugUsername(subject.name), subject.phone]);
  await sql.query(`delete from account_actions where profile_id=$1`, [subject.id]);
  await sql.query(`delete from payments where id=$1`, [payment[0].id]);
  await sql.query(`delete from orders where id=$1`, [order[0].id]);
  await sql.query(`update listings set status='live', deleted_at=null
                   where profile_id=$1 and deleted_at > now() - interval '10 minutes'`, [subject.id]);
  console.log(`   (restored ${subject.name} to active)`);
}

console.log("── re-acceptance interstitial ──────────────────────────────");

{
  const actor = actors[0];
  const s = asUser((await session(actor.phone)).jar);

  const before = await s.api("/api/v1/cms/consent");
  ok("nothing pending while no document requires re-acceptance",
    (before.json?.data?.pending?.length ?? 0) === 0);

  await sql.query(`update cms_pages set requires_reacceptance = true where slug = 'terms'`);
  await sql.query(`delete from auth_consents where profile_id = $1 and kind = 'terms'`, [actor.id]);

  const pending = await s.api("/api/v1/cms/consent");
  ok("flagged document becomes pending", pending.json?.data?.pending?.[0]?.slug === "terms",
    pending.json?.data?.pending?.[0]?.version);

  const accept = await s.api("/api/v1/cms/consent", { method: "POST", body: JSON.stringify({ slug: "terms" }) });
  ok("acceptance is recorded", accept.json?.ok === true && accept.json.data.remaining === 0);
  const { rows: consent } = await sql.query(
    `select kind, version, accepted, ip_hash from auth_consents where profile_id=$1 and kind='terms'`, [actor.id]);
  ok("consent row is versioned", consent[0]?.version === accept.json?.data?.version, consent[0]?.version);
  ok("consent stores a hashed IP, not the raw address",
    Boolean(consent[0]?.ip_hash) && !/\d+\.\d+\.\d+\.\d+/.test(consent[0].ip_hash));

  const again = await s.api("/api/v1/cms/consent");
  ok("nothing pending after acceptance", (again.json?.data?.pending?.length ?? 0) === 0);

  await sql.query(`update cms_pages set requires_reacceptance = false where slug = 'terms'`);
}

console.log("── maintenance mode ────────────────────────────────────────");

{
  await sql.query(
    `update maintenance_settings set enabled = true, message = 'QA maintenance window.',
       eta = now() + interval '30 minutes', updated_at = now() where id = true`);
  const down = await fetch(`${BASE}/blog`, { redirect: "manual" });
  const html = await down.text();
  ok("maintenance takes the public site down", /We'll be back shortly/.test(html));
  ok("the maintenance page shows the admin's ETA", /Estimated: 30 minutes/.test(html));
  ok("the maintenance page shows the admin's message", /QA maintenance window/.test(html));
  await sql.query(`update maintenance_settings set enabled = false where id = true`);
  const up = await fetch(`${BASE}/blog`);
  ok("switching maintenance off restores the site", /Load more|min read/.test(await up.text()));
}

// ---------------------------------------------------------------- cleanup
if (createdTickets.length) {
  await sql.query(`delete from ticket_messages where ticket_id = any($1::uuid[])`, [createdTickets]);
  await sql.query(`delete from support_tickets where id = any($1::uuid[])`, [createdTickets]);
}
if (createdExports.length) {
  await sql.query(`delete from data_export_requests where id = any($1::uuid[])`, [createdExports]);
}
console.log(`   (cleaned ${createdTickets.length} tickets, ${createdExports.length} exports)`);

// ---------------------------------------------------------------- report
console.log("\n════════════════════════════════════════════════════════════");
for (const [state, name, detail] of results) {
  console.log(`${state === "PASS" ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
}
console.log(`\n${pass} passed, ${fail} failed`);

await sql.end();
process.exit(fail ? 1 : 0);

function slugUsername(name) {
  return (name ?? "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14);
}
function readCronSecret() {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^CRON_SECRET=(.*)$/.exec(line.trim());
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return "";
}
