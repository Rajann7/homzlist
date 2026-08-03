/**
 * MODULE 12 live check — Help · Support · Legal/CMS · Blog · Data rights ·
 * System pages.
 *
 *   node scripts/check-module12-live.mjs            # seller host + public host
 *
 * Every assertion goes through a real HTTP endpoint and is then proved against
 * the row the database actually holds, in the roles the module touches
 * (guest · owner · broker · builder). Nothing here trusts a 200.
 *
 * Repeat-run note (same as the other check:* scripts): OTP is rate-limited per
 * number and per IP per day. In dev the counters live in the server process
 * (KV_DRIVER=memory), so restart `npm run dev` if a rerun starts getting
 * RATE_LIMITED — that is the limiter working, not the module failing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const SELLER = (process.argv[2] ?? "http://seller.localhost:3000").replace(/\/$/, "");
const PUBLIC = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
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
const check = (n, p, d = "") => { results.push({ n, p: !!p }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };
const section = (t) => console.log(`\n\x1b[1m── ${t}\x1b[0m`);

function actor(label, base = SELLER) {
  const jar = new Map();
  return {
    label,
    profileId: null,
    async req(u, m = "GET", b) {
      const r = await fetch(`${base}${u}`, {
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
      return { status: r.status, json, text, headers: r.headers };
    },
    async login(phone) {
      const r1 = await this.req("/api/v1/auth/otp/request", "POST", { phone });
      if (!r1.json?.ok) throw new Error(`${label}: otp request failed ${JSON.stringify(r1.json)}`);
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", { otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456" });
      if (!r2.json?.ok) throw new Error(`${label}: otp verify failed ${JSON.stringify(r2.json)}`);
      this.profileId = r2.json.data.user?.id ?? null;
      return r2.json.data.user;
    },
  };
}

/* ═════════════════════════════════════ 1 · guest / unauthenticated sweep ═══ */
section("1 · Guest sweep — public reads open, private endpoints 401");

const guest = actor("guest", PUBLIC);

for (const p of ["/api/v1/help", "/api/v1/help/search?q=refund", "/api/v1/cms/pages",
                 "/api/v1/cms/pages/terms", "/api/v1/blog", "/api/v1/system/maintenance"]) {
  const r = await guest.req(p);
  check(`guest GET ${p.split("?")[0]} → 200`, r.status === 200 && r.json?.ok, `got ${r.status}`);
}

for (const [p, m, b] of [
  ["/api/v1/support/tickets", "GET"],
  ["/api/v1/support/tickets", "POST", { category: "bug", subject: "x", description: "y" }],
  ["/api/v1/account/data", "GET"],
  ["/api/v1/account/data", "POST", { format: "json" }],
  ["/api/v1/account/lifecycle", "GET"],
  ["/api/v1/account/verify/start", "POST", { action: "delete" }],
  ["/api/v1/account/cancel-deletion", "POST", {}],
  ["/api/v1/cms/consent", "GET"],
  ["/api/v1/cms/consent", "POST", { slug: "terms" }],
]) {
  const r = await actor("g", SELLER).req(p, m, b);
  check(`guest ${m} ${p} → 401`, r.status === 401, `got ${r.status}`);
}

{
  const r = await guest.req("/api/v1/cron/accounts", "POST", {});
  check("unauthenticated POST /cron/accounts → 401", r.status === 401, `got ${r.status}`);
}

/* ═══════════════════════════════════════════════ 2 · Help centre ═══ */
section("2 · Help centre — counts, search, article, feedback");

{
  const r = await guest.req("/api/v1/help");
  const d = r.json?.data;
  check("help index returns 8 categories", d?.categories?.length === 8, `${d?.categories?.length}`);
  check("help index returns 6 chips", d?.chips?.length === 6, `${d?.chips?.length}`);
  check("help index returns 6 popular articles", d?.popular?.length === 6, `${d?.popular?.length}`);

  // Every tile count must equal the live row count — not a stored number.
  const { rows } = await db.query(
    `select c.slug, count(f.id)::int n from help_categories c
       left join faqs f on f.category_id = c.id and f.is_active
      group by c.slug`,
  );
  const dbCounts = new Map(rows.map((r) => [r.slug, r.n]));
  const allMatch = d.categories.every((c) => dbCounts.get(c.slug) === c.articleCount);
  check("every tile count equals its live DB count", allMatch,
    d.categories.map((c) => `${c.slug}:${c.articleCount}/${dbCounts.get(c.slug)}`).join(" "));

  const design = { "getting-started": 6, "plans-pricing": 8, "posting-listings": 10, requirements: 6,
                   "chat-inquiries": 7, "payments-invoices": 5, verification: 4, "account-privacy": 6 };
  check("counts match the P12 design (6/8/10/6/7/5/4/6)",
    d.categories.every((c) => design[c.slug] === c.articleCount));
}

{
  const r = await guest.req("/api/v1/help/search?q=refund");
  check("help search finds articles by keyword", (r.json?.data?.results?.length ?? 0) > 0,
    `${r.json?.data?.results?.length} hits`);
  const empty = await guest.req("/api/v1/help/search?q=zzzznotathing");
  check("help search returns an empty set for nonsense", empty.json?.data?.results?.length === 0);
  // `search_terms` is what makes a word that is in NO title findable.
  const hidden = await guest.req("/api/v1/help/search?q=kyc");
  check("help search matches the hidden keyword blob (kyc → verification)",
    (hidden.json?.data?.results ?? []).some((a) => a.slug === "how-do-i-get-a-verified-badge"));
}

{
  const before = (await db.query(`select view_count from faqs where slug='how-does-the-999-plan-work'`)).rows[0].view_count;
  const r = await guest.req("/api/v1/help/articles/how-does-the-999-plan-work");
  const after = (await db.query(`select view_count from faqs where slug='how-does-the-999-plan-work'`)).rows[0].view_count;
  check("article reader returns a body", (r.json?.data?.bodyMd?.length ?? 0) > 200, `${r.json?.data?.bodyMd?.length} chars`);
  check("article reader returns related articles", (r.json?.data?.related?.length ?? 0) > 0);
  check("opening an article increments faqs.view_count", after === before + 1, `${before} → ${after}`);
  const miss = await guest.req("/api/v1/help/articles/not-a-real-article");
  check("unknown article slug → 404", miss.status === 404, `got ${miss.status}`);
}

/* ═════════════════════════════════════════════ 3 · Legal / CMS ═══ */
section("3 · Legal — Doc10 content, versions, consent gate");

{
  const { rows } = await db.query(`select slug, version, length(body_md) len from cms_pages order by sort_order`);
  check("all 8 legal/CMS pages published", rows.length === 8, `${rows.length}`);
  check("no page still carries the P6 placeholder body",
    rows.every((r) => r.len > 900), rows.map((r) => `${r.slug}:${r.len}`).join(" "));

  const terms = await guest.req("/api/v1/cms/pages/terms");
  const body = terms.json?.data?.page?.bodyMd ?? "";
  check("Terms names Section 79 of the IT Act", body.includes("Section 79"));
  check("Terms names Rajkot exclusive jurisdiction", /exclusive jurisdiction/i.test(body) && body.includes("Rajkot"));
  const privacy = await guest.req("/api/v1/cms/pages/privacy");
  check("Privacy names the DPDP Act, 2023", (privacy.json?.data?.page?.bodyMd ?? "").includes("Digital Personal Data Protection Act, 2023"));
  const griev = await guest.req("/api/v1/cms/pages/grievance");
  check("Grievance reader returns the officer card", Boolean(griev.json?.data?.officer?.email));
  check("Grievance names the 24h / 15-day timeline",
    /24 hours/.test(griev.json?.data?.page?.bodyMd ?? "") && /15 days/.test(griev.json?.data?.page?.bodyMd ?? ""));

  const vers = await guest.req("/api/v1/cms/pages/terms/versions");
  check("version history is readable", (vers.json?.data?.versions?.length ?? 0) >= 1,
    `${vers.json?.data?.versions?.length} versions`);
  const missing = await guest.req("/api/v1/cms/pages/not-a-page");
  check("unknown legal slug → 404", missing.status === 404, `got ${missing.status}`);
}

/* ══════════════════════════════════════════════════ 4 · Blog ═══ */
section("4 · Blog — list, filter, post, view counting, scheduling");

{
  const list = await guest.req("/api/v1/blog");
  const d = list.json?.data;
  check("blog list returns a featured hero", Boolean(d?.featured), d?.featured?.slug);
  check("blog list returns categories", (d?.categories?.length ?? 0) >= 5, `${d?.categories?.length}`);
  check("hero is excluded from the row list", !d.posts.some((p) => p.slug === d.featured.slug));

  const filtered = await guest.req("/api/v1/blog?category=legal");
  check("category filter narrows the list server-side",
    filtered.json?.data?.posts?.every((p) => p.category === "legal"),
    `${filtered.json?.data?.posts?.length} posts`);
  check("a filtered page carries no hero", filtered.json?.data?.featured === null);

  // A previous run of this script already counts as a read from this machine —
  // clear the dedup rows so the counter test measures the counter, not history.
  await db.query(
    `delete from blog_post_reads where post_id = (select id from blog_posts where slug = 'rera-explained-for-first-time-buyers')`,
  );
  const before = (await db.query(`select view_count from blog_posts where slug='rera-explained-for-first-time-buyers'`)).rows[0].view_count;
  await guest.req("/api/v1/blog/rera-explained-for-first-time-buyers");
  const mid = (await db.query(`select view_count from blog_posts where slug='rera-explained-for-first-time-buyers'`)).rows[0].view_count;
  await guest.req("/api/v1/blog/rera-explained-for-first-time-buyers");
  const after = (await db.query(`select view_count from blog_posts where slug='rera-explained-for-first-time-buyers'`)).rows[0].view_count;
  check("a blog read is counted once", mid === before + 1, `${before} → ${mid}`);
  check("a SECOND read by the same reader is NOT counted again", after === mid, `${mid} → ${after}`);

  // An embargoed post must be unreachable even by direct slug.
  await db.query(
    `insert into blog_posts (slug, title, body_md, category, status, published_at, read_minutes)
     values ('m12-embargo-probe','Embargo probe','body','buying','published', now() + interval '30 days', 3)
     on conflict (slug) do update set status='published', published_at = now() + interval '30 days'`,
  );
  const future = await guest.req("/api/v1/blog/m12-embargo-probe");
  check("a post scheduled in the future is NOT readable by slug", future.status === 404, `got ${future.status}`);
  const futureList = await guest.req("/api/v1/blog");
  check("a future-dated post is absent from the list",
    !(futureList.json?.data?.posts ?? []).some((p) => p.slug === "m12-embargo-probe"));
  await db.query(`delete from blog_posts where slug='m12-embargo-probe'`);

  const missing = await guest.req("/api/v1/blog/not-a-post");
  check("unknown post slug → 404", missing.status === 404, `got ${missing.status}`);
}

/* ═════════════════════════════════ 5 · Support tickets, per role ═══ */
section("5 · Support tickets — owner / broker / builder");

const { rows: people } = await db.query(`
  select distinct on (role) id, name, phone, role from profiles
   where state='active' and is_registered and role in ('owner','broker','builder')
     and name is not null
   order by role, last_active_at desc nulls last`);
check("found an owner, a broker and a builder to test with", people.length === 3,
  people.map((p) => `${p.role}:${p.name}`).join(" · "));

const created = [];
for (const p of people) {
  const a = actor(p.role);
  await a.login(p.phone);

  const cats = await a.req("/api/v1/support/categories");
  check(`${p.role}: category sheet returns 7 pickable rows`, cats.json?.data?.categories?.length === 7,
    `${cats.json?.data?.categories?.length}`);
  check(`${p.role}: grievance is NOT in the picker`,
    !(cats.json?.data?.categories ?? []).some((c) => c.slug === "grievance"));

  // A category that needs a conditional field must REFUSE without it.
  const bad = await a.req("/api/v1/support/tickets", "POST",
    { category: "payment_refund", subject: "Refund please", description: "money gone" });
  check(`${p.role}: payment ticket without a payment ID → 422`, bad.status === 422, `got ${bad.status}`);
  check(`${p.role}: …and names the offending field`, bad.json?.error?.field === "paymentRef", bad.json?.error?.field);

  const bad2 = await a.req("/api/v1/support/tickets", "POST",
    { category: "report", subject: "Fake listing", description: "copied my photos" });
  check(`${p.role}: report ticket without a link → 422`, bad2.status === 422, `got ${bad2.status}`);

  const ok = await a.req("/api/v1/support/tickets", "POST", {
    category: "payment_refund",
    subject: `M12 probe — ${p.role}`,
    description: "Automated module-12 check. Safe to close.",
    paymentRef: "pay_M12PROBE0001",
  });
  check(`${p.role}: valid ticket created`, ok.status === 200 && ok.json?.data?.number, ok.json?.data?.number);
  if (ok.json?.data?.id) created.push({ role: p.role, actor: a, id: ok.json.data.id, profileId: p.id });

  const list = await a.req("/api/v1/support/tickets");
  check(`${p.role}: the new ticket appears in their list`,
    (list.json?.data?.tickets ?? []).some((t) => t.id === ok.json?.data?.id));
  check(`${p.role}: tab counts are present`, typeof list.json?.data?.counts?.open === "number");
}

if (created.length >= 1) {
  const { role, actor: a, id } = created[0];
  const row = (await db.query(`select number, status, acked_at, sla_due_at, payment_ref from support_tickets where id=$1`, [id])).rows[0];
  check("ticket is acknowledged at creation (acked_at set)", Boolean(row.acked_at));
  check("ticket carries a 24h SLA", Math.abs((new Date(row.sla_due_at) - new Date(row.acked_at)) / 3600_000 - 24) < 0.1,
    `${((new Date(row.sla_due_at) - new Date(row.acked_at)) / 3600_000).toFixed(1)}h`);
  check("the pasted payment reference is stored", row.payment_ref === "pay_M12PROBE0001", row.payment_ref);

  const msgs = (await db.query(`select author_kind, body from ticket_messages where ticket_id=$1 order by created_at`, [id])).rows;
  check("thread opens with the user message + an auto-acknowledgement",
    msgs.length === 2 && msgs[0].author_kind === "user" && msgs[1].author_kind === "staff",
    msgs.map((m) => m.author_kind).join(","));

  const reply = await a.req(`/api/v1/support/tickets/${id}/messages`, "POST", { body: "Adding one more detail." });
  check("reply accepted", reply.status === 200, `got ${reply.status}`);
  const n = (await db.query(`select count(*)::int c from ticket_messages where ticket_id=$1`, [id])).rows[0].c;
  check("reply is a real row", n === 3, `${n} messages`);

  // Closed → composer refused server-side, reopen restarts the clock.
  await db.query(`update support_tickets set status='closed', closed_at=now() where id=$1`, [id]);
  const refused = await a.req(`/api/v1/support/tickets/${id}/messages`, "POST", { body: "should be refused" });
  check("replying to a CLOSED ticket is refused (403)", refused.status === 403, `got ${refused.status}`);
  const reop = await a.req(`/api/v1/support/tickets/${id}/reopen`, "POST", {});
  const after = (await db.query(`select status, closed_at, sla_due_at from support_tickets where id=$1`, [id])).rows[0];
  check("reopen sets status back to open", reop.status === 200 && after.status === "open", after.status);
  check("reopen clears closed_at and restarts the SLA",
    after.closed_at === null && new Date(after.sla_due_at) > new Date());

  // IDOR: another logged-in user must not read this ticket.
  if (created.length >= 2) {
    const other = created[1].actor;
    const probe = await other.req(`/api/v1/support/tickets/${id}`);
    check("IDOR: another user's ticket id → 404 (not 403)", probe.status === 404, `got ${probe.status}`);
    const probeReply = await other.req(`/api/v1/support/tickets/${id}/messages`, "POST", { body: "hijack" });
    check("IDOR: cannot post into another user's ticket", probeReply.status === 404, `got ${probeReply.status}`);
  }
}

/* ═══════════════════════════════ 6 · Grievance route + SLA ═══ */
section("6 · Grievance — 15-day SLA, and it is reachable");

if (created.length) {
  const a = created[0].actor;
  const g = await a.req("/api/v1/support/tickets", "POST", {
    category: "grievance",
    subject: "M12 probe — grievance SLA",
    description: "Automated module-12 check.",
    reportLink: "https://homzlist.com/property/probe",
  });
  check("a grievance can be raised even though it is not in the picker", g.status === 200, `got ${g.status}`);
  if (g.json?.data?.id) {
    const row = (await db.query(`select is_grievance, acked_at, sla_due_at from support_tickets where id=$1`, [g.json.data.id])).rows[0];
    check("grievance flagged on the row", row.is_grievance === true);
    const days = (new Date(row.sla_due_at) - new Date(row.acked_at)) / 86_400_000;
    check("grievance carries the 15-day resolution SLA", Math.abs(days - 15) < 0.1, `${days.toFixed(1)} days`);
    await db.query(`delete from support_tickets where id=$1`, [g.json.data.id]);
  }
}

/* ═════════════════════════════════════ 7 · DPDP data download ═══ */
section("7 · Data download — own data only, real file, real expiry");

if (created.length) {
  const { actor: a, profileId } = created[0];
  const req = await a.req("/api/v1/account/data", "POST", { format: "json" });
  check("export request accepted", req.status === 200, `got ${req.status}`);
  check("export reaches `ready`", req.json?.data?.status === "ready", req.json?.data?.status);

  const row = (await db.query(
    `select status, file_key, size_bytes, expires_at from data_export_requests where id=$1`, [req.json?.data?.id])).rows[0];
  check("export row written with a file key", Boolean(row?.file_key), row?.file_key);
  check("export has a non-zero size", (row?.size_bytes ?? 0) > 0, `${row?.size_bytes} bytes`);
  const ttl = (new Date(row.expires_at) - Date.now()) / 3600_000;
  check("export link expires in ~48 hours", Math.abs(ttl - 48) < 1, `${ttl.toFixed(1)}h`);

  const dl = await a.req(`/api/v1/account/data/${req.json.data.id}/download`);
  check("download returns the file", dl.status === 200 && dl.text.length > 50, `${dl.status}, ${dl.text.length} bytes`);
  const bundle = JSON.parse(dl.text);
  check("export contains the caller's own profile", bundle.profile?.id === profileId);
  check("export contains only messages the caller SENT",
    Array.isArray(bundle.messages_you_sent) && !("messages_received" in bundle));
  const foreign = await db.query(
    `select count(*)::int c from chat_messages where sender_id <> $1 and id = any($2::uuid[])`,
    [profileId, (bundle.messages_you_sent ?? []).map((m) => m.id)]);
  check("no message in the export was sent by anyone else", foreign.rows[0].c === 0, `${foreign.rows[0].c} foreign rows`);

  // Abuse floor: a second press must hand back the live file, not rebuild it.
  const again = await a.req("/api/v1/account/data", "POST", { format: "json" });
  check("re-requesting returns the SAME ready export rather than rebuilding",
    again.json?.data?.id === req.json?.data?.id, `${again.json?.data?.id === req.json?.data?.id}`);
  const built = (await db.query(
    `select count(*)::int c from data_export_requests where profile_id=$1 and requested_at > now() - interval '2 minutes'`,
    [profileId])).rows[0].c;
  check("…and no extra export row is created", built === 1, `${built} rows in the last 2 minutes`);

  // IDOR on the download.
  if (created.length >= 2) {
    const other = created[1].actor;
    const probe = await other.req(`/api/v1/account/data/${req.json.data.id}/download`);
    check("IDOR: another user cannot download this export", probe.status === 404, `got ${probe.status}`);
  }

  // The sweep must expire it AND delete the object.
  await db.query(`update data_export_requests set expires_at = now() - interval '1 hour' where id=$1`, [req.json.data.id]);
  const swept = await fetch(`${SELLER}/api/v1/cron/accounts`, {
    method: "POST", headers: { authorization: `Bearer ${E.CRON_SECRET ?? ""}` },
  });
  const sweepJson = await swept.json().catch(() => ({}));
  check("cron/accounts runs with the shared secret", swept.status === 200, `got ${swept.status}`);
  const post = (await db.query(`select status, file_key from data_export_requests where id=$1`, [req.json.data.id])).rows[0];
  check("the sweep expires a stale export", post?.status === "expired", post?.status);
  check("…and drops the file key with it", post?.file_key === null,
    `expired ${sweepJson.expiredExports}, objects ${sweepJson.deletedExportObjects}`);
  const gone = await a.req(`/api/v1/account/data/${req.json.data.id}/download`);
  check("an expired link no longer downloads", gone.status === 404, `got ${gone.status}`);
}

/* ═══════════════════════════ 8 · Deactivate / delete lifecycle ═══ */
section("8 · Account lifecycle — payment hold, OTP binding, grace, cancel");

if (created.length) {
  const { actor: a, profileId } = created[0];

  const life = await a.req("/api/v1/account/lifecycle");
  check("lifecycle returns the at-risk counts", typeof life.json?.data?.atRisk?.activePlans === "number",
    JSON.stringify(life.json?.data?.atRisk));

  // Force the payment hold on, and prove it blocks at the OTP-SEND step. An
  // existing payment is moved INTO the window rather than a new one invented:
  // `payments.order_id` is NOT NULL, and a fabricated row would not survive the
  // schema this is meant to be tested against.
  const { rows: [pay] } = await db.query(
    `select id, created_at, captured_at from payments
      where profile_id = $1 and status = 'success'
      order by created_at desc limit 1`, [profileId]);
  if (!pay) throw new Error("no successful payment on the test account to move into the hold window");
  await db.query(`update payments set created_at = now(), captured_at = now() where id = $1`, [pay.id]);
  const held = await a.req("/api/v1/account/verify/start", "POST", { action: "delete" });
  check("payment hold refuses to even SEND a delete code", held.status === 403, `got ${held.status}`);
  check("…and returns the date it becomes available", Boolean(held.json?.error?.availableFrom));
  const lifeHeld = await a.req("/api/v1/account/lifecycle");
  check("lifecycle reports the hold as active", lifeHeld.json?.data?.paymentHold?.active === true);

  // Deactivate is NOT blocked by the hold — only deletion is.
  const deactStart = await a.req("/api/v1/account/verify/start", "POST", { action: "deactivate" });
  check("deactivate is still available during a payment hold", deactStart.status === 200, `got ${deactStart.status}`);
  check("the OTP screen gets a MASKED number, never the full one",
    /•/.test(deactStart.json?.data?.maskedPhone ?? ""), deactStart.json?.data?.maskedPhone);

  // The confirm step must not accept a wrong code…
  const wrong = await a.req("/api/v1/account/verify/confirm", "POST",
    { otpSession: deactStart.json.data.otpSession, code: "000000" });
  check("a wrong code is rejected", wrong.status !== 200, `got ${wrong.status}`);

  // …and the intent is the one stored at SEND time, not one the client picks.
  const start2 = await a.req("/api/v1/account/verify/start", "POST", { action: "deactivate" });
  const confirmed = await a.req("/api/v1/account/verify/confirm", "POST",
    { otpSession: start2.json.data.otpSession, code: start2.json.data.devCode });
  check("confirming a DEACTIVATE code deactivates", confirmed.json?.data?.action === "deactivate", confirmed.json?.data?.action);
  const st = (await db.query(`select state, deactivated_at, deletion_scheduled_at from profiles where id=$1`, [profileId])).rows[0];
  check("profile row is deactivated with a timestamp", st.state === "deactivated" && Boolean(st.deactivated_at));
  check("deactivation does NOT schedule a deletion", st.deletion_scheduled_at === null);
  const ev = (await db.query(`select kind from account_events where profile_id=$1 order by created_at desc limit 1`, [profileId])).rows[0];
  check("an account_event is written", ev?.kind === "deactivate", ev?.kind);

  // Clear the hold and run the delete path end to end.
  await db.query(`update payments set created_at = $2, captured_at = $3 where id = $1`,
    [pay.id, pay.created_at, pay.captured_at]);
  const delStart = await a.req("/api/v1/account/verify/start", "POST", { action: "delete", reason: "Found a property" });
  check("with the hold cleared, a delete code IS sent", delStart.status === 200, `got ${delStart.status}`);
  const delDone = await a.req("/api/v1/account/verify/confirm", "POST",
    { otpSession: delStart.json.data.otpSession, code: delStart.json.data.devCode });
  check("confirming a DELETE code schedules deletion", delDone.json?.data?.action === "delete", delDone.json?.data?.action);

  const sched = (await db.query(
    `select state, deletion_scheduled_at, deletion_reason from profiles where id=$1`, [profileId])).rows[0];
  const graceDays = (new Date(sched.deletion_scheduled_at) - Date.now()) / 86_400_000;
  check("deletion is scheduled 30 days out", Math.abs(graceDays - 30) < 0.1, `${graceDays.toFixed(1)} days`);
  check("the reason the user gave is stored", sched.deletion_reason === "Found a property", sched.deletion_reason);

  const cancel = await a.req("/api/v1/account/cancel-deletion", "POST", {});
  const back = (await db.query(`select state, deletion_scheduled_at from profiles where id=$1`, [profileId])).rows[0];
  check("cancel deletion restores the account", cancel.status === 200 && back.state === "active", back.state);
  check("…and clears the schedule", back.deletion_scheduled_at === null);
}

/* ═════════════════════════════ 9 · Re-acceptance consent gate ═══ */
section("9 · Re-acceptance — the interstitial is a server decision");

if (created.length) {
  const { actor: a, profileId } = created[0];
  // Bump Terms to a version nobody has accepted.
  const prev = (await db.query(
    `select version, requires_reacceptance from cms_pages where slug='terms'`)).rows[0];
  await db.query(`update cms_pages set version='99.0-probe', requires_reacceptance=true where slug='terms'`);
  await db.query(`delete from auth_consents where profile_id=$1 and kind='terms' and version='99.0-probe'`, [profileId]);

  const pending = await a.req("/api/v1/cms/consent");
  check("a new material version becomes pending for the user",
    (pending.json?.data?.pending ?? []).some((p) => p.slug === "terms"),
    `${pending.json?.data?.count} pending`);
  check("the pending payload carries the scroll extract",
    (pending.json?.data?.pending?.[0]?.extract?.length ?? 0) > 500);

  // Accepting an OLD version must not clear the gate.
  const stale = await a.req("/api/v1/cms/consent", "POST", { slug: "terms", version: prev.version });
  check("accepting a STALE version is refused", stale.status !== 200, `got ${stale.status}`);
  const stillPending = await a.req("/api/v1/cms/consent");
  check("…and the gate is still up", (stillPending.json?.data?.count ?? 0) > 0);

  const accept = await a.req("/api/v1/cms/consent", "POST", { slug: "terms", version: "99.0-probe" });
  check("accepting the CURRENT version is recorded", accept.status === 200, `got ${accept.status}`);
  const consent = (await db.query(
    `select version, accepted, ip_hash from auth_consents where profile_id=$1 and kind='terms' order by accepted_at desc limit 1`,
    [profileId])).rows[0];
  check("consent row written at the current version", consent?.version === "99.0-probe" && consent.accepted === true);
  check("consent records a hashed IP, never a raw one",
    Boolean(consent?.ip_hash) && !/\./.test(consent.ip_hash ?? "."), consent?.ip_hash);
  // Any OTHER page an admin has flagged material is still legitimately pending —
  // the gate queues them. What must be true is that TERMS is no longer in it.
  const cleared = await a.req("/api/v1/cms/consent");
  check("the accepted page leaves the queue",
    !(cleared.json?.data?.pending ?? []).some((p) => p.slug === "terms"),
    `${cleared.json?.data?.count} other page(s) still pending`);

  // Restore BOTH the version and the flag. Restoring only the version left the
  // gate switched on across the whole dev app after a run — found by walking the
  // help screen and seeing the interstitial standing there.
  await db.query(`update cms_pages set version=$1, requires_reacceptance=$2 where slug='terms'`,
    [prev.version, prev.requires_reacceptance]);
  await db.query(`delete from auth_consents where profile_id=$1 and version='99.0-probe'`, [profileId]);
}

/* ══════════════════════════════ 10 · Maintenance mode, enforced ═══ */
section("10 · Maintenance — the switch reaches the surface");

{
  const before = await guest.req("/api/v1/system/maintenance");
  check("maintenance state is publicly readable", before.status === 200 && before.json?.ok);
  const wasOn = before.json?.data?.enabled;

  await db.query(
    `update maintenance_settings set enabled = true, message = 'M12 probe — back in a moment.',
            eta = now() + interval '25 minutes', updated_at = now()`);
  const on = await guest.req("/api/v1/system/maintenance");
  check("the endpoint reports maintenance on", on.json?.data?.enabled === true);
  check("the ETA is a computed label, not a stored phrase",
    /Estimated: 2[45] minutes/.test(on.json?.data?.etaLabel ?? ""), on.json?.data?.etaLabel);

  const page = await fetch(`${PUBLIC}/blog`);
  const html = await page.text();
  check("a guest page renders the maintenance screen while it is on",
    html.includes("We&#x27;ll be back shortly") || html.includes("We'll be back shortly"));
  check("…and the admin's message reaches it", html.includes("M12 probe — back in a moment."));

  await db.query(`update maintenance_settings set enabled = $1, message = 'HomzList is under maintenance. We''ll be right back.', eta = null, updated_at = now()`, [wasOn === true]);
  const off = await guest.req("/api/v1/system/maintenance");
  check("maintenance switched back off", off.json?.data?.enabled === Boolean(wasOn));
  const back = await fetch(`${PUBLIC}/blog`);
  check("the real page returns once maintenance is off", (await back.text()).includes("HomzList Blog") || back.status === 200);
}

/* ══════════════════════════════════ 11 · SEO surface ═══ */
section("11 · SEO — canonical, robots, sitemap, structured data");

{
  const post = await fetch(`${PUBLIC}/blog/buying-a-flat-in-rajkot-2025`);
  const html = await post.text();
  check("blog post carries a canonical", html.includes('rel="canonical"'));
  check("blog post carries BlogPosting structured data", html.includes('"@type":"BlogPosting"'));
  check("blog post carries an OG image", html.includes("og:image"));

  const archived = await fetch(`${PUBLIC}/legal/terms?version=1.0`);
  check("an archived legal version is reachable", archived.status === 200, `got ${archived.status}`);

  const sitemap = await fetch(`${PUBLIC}/sitemap-static.xml`);
  const xml = await sitemap.text();
  check("sitemap lists the blog index", xml.includes("/blog</loc>") || xml.includes("/blog<"));
  check("sitemap lists individual posts", xml.includes("/blog/buying-a-flat-in-rajkot-2025"));
  check("sitemap lists the legal pages", xml.includes("/legal/terms"));
}

/* ═════════════════════════════════════════════ cleanup + summary ═══ */
for (const c of created) await db.query(`delete from support_tickets where id=$1`, [c.id]);
await db.query(`delete from support_tickets where subject like 'M12 probe%'`);

const failed = results.filter((r) => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFAILED:");
  for (const f of failed) console.log(`  ✗ ${f.n}`);
}
await db.end();
process.exit(failed.length ? 1 : 0);
