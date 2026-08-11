/**
 * Role matrix for the inquiry → lead system: owner · broker · builder · guest.
 *
 *   node scripts/check-leads-roles.mjs [http://seller.lvh.me:3000]
 *
 * The rule being enforced (Doc2 role rules): an OWNER and a BROKER may connect
 * on anything; a BUILDER reaches the market only through REQUIREMENTS — never
 * by inquiring on somebody else's property or project, and never by landing in
 * another builder's pipeline through the project Call button; a GUEST may do
 * none of it.
 *
 * Every rule is checked twice on purpose — at the API, and in a real hydrated
 * browser — because a wall the server keeps but the screen doesn't show is a
 * dead button, and a wall the screen shows but the server doesn't keep is not a
 * wall at all.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { launch, newPage } from "./lib/cdp.mjs";

const BASE = (process.argv[2] ?? "http://seller.lvh.me:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "docs", "_shots", "roles");

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
const section = (t) => console.log(`\n── ${t} ─────────────────────────────────────`);

function actor(label) {
  const jar = new Map();
  return {
    label,
    id: null,
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
      if (!r1.json?.ok) throw new Error(`${label}: otp request failed ${JSON.stringify(r1.json?.error)}`);
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", { otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456" });
      if (!r2.json?.ok) throw new Error(`${label}: otp verify failed ${JSON.stringify(r2.json?.error)}`);
      this.id = r2.json.data.user?.id ?? null;
      return r2.json.data.user;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures — one usable person per role, and one target of each kind that is
// NOT theirs. Picked from real rows so the walk exercises real state.
// ---------------------------------------------------------------------------
const pick = async (role) => {
  const { rows } = await db.query(
    `select id, name, phone, role from profiles
      where role = $1 and state = 'active' and name is not null and city_id is not null and phone is not null
      order by created_at desc limit 1`, [role]);
  return rows[0] ?? null;
};
const [owner, broker, builder] = await Promise.all([pick("owner"), pick("broker"), pick("builder")]);
for (const [r, p] of [["owner", owner], ["broker", broker], ["builder", builder]]) {
  if (!p) throw new Error(`no usable ${r} profile in dev data`);
}

const { rows: [listing] } = await db.query(
  `select l.id, l.profile_id owner_id from listings l
    where l.status='live' and l.profile_id not in ($1,$2,$3) order by l.created_at desc limit 1`,
  [owner.id, broker.id, builder.id]);
const { rows: [project] } = await db.query(
  `select p.id, p.profile_id owner_id from projects p
    where p.status='live' and p.profile_id not in ($1,$2,$3) order by p.created_at desc limit 1`,
  [owner.id, broker.id, builder.id]);
const { rows: [requirement] } = await db.query(
  `select r.id, r.profile_id owner_id from requirements r
    where r.status='live' and r.is_active and r.profile_id not in ($1,$2,$3) order by r.created_at desc limit 1`,
  [owner.id, broker.id, builder.id]);

if (!listing || !requirement) throw new Error("need a live listing and a live requirement not owned by the actors");
console.log(`\nowner=${owner.name} · broker=${broker.name} · builder=${builder.name}`);
console.log(`listing=${listing.id} project=${project?.id ?? "—"} requirement=${requirement.id}\n`);

// Clean slate so a repeat run measures the same thing.
for (const p of [owner, broker, builder]) {
  await db.query(`delete from leads where lead_profile_id=$1 and (listing_id=$2 or project_id=$3 or requirement_id=$4)`,
    [p.id, listing.id, project?.id ?? null, requirement.id]);
  await db.query(`delete from inquiries where profile_id=$1 and (listing_id=$2 or project_id=$3)`,
    [p.id, listing.id, project?.id ?? null]);
}

// ---------------------------------------------------------------------------
section("GUEST — allowed nothing");
// ---------------------------------------------------------------------------
const guest = actor("guest");
for (const [p, m, b] of [
  ["/api/v1/leads", "GET"],
  ["/api/v1/leads/sent", "GET"],
  ["/api/v1/leads/subject/listing/" + listing.id, "GET"],
  ["/api/v1/contact-numbers", "GET"],
  ["/api/v1/inquiries?kind=listing", "GET"],
  ["/api/v1/inquiries", "POST", { listingId: listing.id, wants: ["price"], contactPref: "call", whenToken: "anytime", consent: true }],
  [`/api/v1/projects/${project?.id ?? listing.id}/contact`, "POST", { channel: "call" }],
  [`/api/v1/requirements/${requirement.id}/proposals`, "POST", { mode: "help", offers: ["other"], consent: true }],
]) {
  const r = await guest.req(p, m, b);
  check(`guest ${m} ${p.split("?")[0].replace(/[0-9a-f-]{36}/, ":id")} → 401`, r.status === 401, `got ${r.status}`);
}
const { rows: [{ count: guestWrote }] } = await db.query(
  `select count(*)::int from inquiries where listing_id=$1 and profile_id is null`, [listing.id]);
check("guest wrote nothing", guestWrote === 0, `${guestWrote} rows`);

// ---------------------------------------------------------------------------
// Signed-in roles
// ---------------------------------------------------------------------------
const sessions = {};
for (const person of [owner, broker, builder]) {
  const a = actor(person.role);
  await a.login(person.phone);
  sessions[person.role] = a;
}

for (const role of ["owner", "broker", "builder"]) {
  section(`${role.toUpperCase()} — the walls`);
  const a = sessions[role];
  const mayConnect = role !== "builder";

  // Their own Leads screens always work — every role has a pipeline.
  const groups = await a.req("/api/v1/leads");
  const sent = await a.req("/api/v1/leads/sent");
  check(`${role}: Leads + Sent load`, groups.json?.ok === true && sent.json?.ok === true,
    `${groups.status}/${sent.status}`);

  // What the SHEET is told to draw, per subject.
  for (const kind of ["listing", "project", "requirement"]) {
    const o = await a.req(`/api/v1/inquiries?kind=${kind}`);
    const expected = kind === "requirement" ? true : mayConnect;
    check(`${role}: sheet allowed on ${kind} = ${expected}`, o.json?.data?.allowed === expected,
      String(o.json?.data?.allowed));
  }

  // The wall behind the button.
  const onListing = await a.req("/api/v1/inquiries", "POST", {
    listingId: listing.id, wants: ["price"], contactPref: "call", whenToken: "anytime", consent: true,
  });
  if (mayConnect) {
    check(`${role}: can inquire on a property`, onListing.json?.ok === true,
      JSON.stringify(onListing.json?.error ?? onListing.status));
    const { rows: [row] } = await db.query(
      `select stage from leads where listing_id=$1 and lead_profile_id=$2`, [listing.id, a.id]);
    check(`${role}: …and it created the seller's lead`, row?.stage === "new", row?.stage ?? "no row");
  } else {
    check(`${role}: property inquiry → 403`, onListing.status === 403, `got ${onListing.status}`);
    const { rows: [{ count: n }] } = await db.query(
      `select count(*)::int from leads where listing_id=$1 and lead_profile_id=$2`, [listing.id, a.id]);
    check(`${role}: …and nothing was written`, n === 0, `${n} leads`);
  }

  if (project) {
    const onProject = await a.req("/api/v1/inquiries", "POST", {
      projectId: project.id, wants: ["price"], contactPref: "call", whenToken: "anytime", consent: true,
    });
    check(`${role}: project inquiry ${mayConnect ? "allowed" : "→ 403"}`,
      mayConnect ? onProject.json?.ok === true : onProject.status === 403,
      JSON.stringify(onProject.json?.error ?? onProject.status));

    // Call/WhatsApp on a project WRITES a lead, so the same rule must hold.
    await db.query(`delete from leads where project_id=$1 and lead_profile_id=$2 and source='project'`, [project.id, a.id]);
    await a.req(`/api/v1/projects/${project.id}/contact`, "POST", { channel: "call" });
    const { rows: [{ count: tapped }] } = await db.query(
      `select count(*)::int from leads where project_id=$1 and lead_profile_id=$2`, [project.id, a.id]);
    check(`${role}: tapping Call on a project ${mayConnect ? "records a lead" : "records NOTHING"}`,
      mayConnect ? tapped > 0 : tapped === 0, `${tapped} leads`);
  }

  // Requirements are open to everyone — that is a builder's only door.
  const onReq = await a.req(`/api/v1/requirements/${requirement.id}/proposals`, "POST", {
    mode: "help", offers: ["matching_soon"], contactPref: "call", whenToken: "anytime", consent: true,
  });
  const code = onReq.json?.error?.code ?? null;
  // NEED_TOPUP / PROJECT_REQUIRED are the quota and the builder's live-project
  // rule doing their jobs — both mean "the role wall let you through".
  const gotThrough = onReq.json?.ok === true || code === "NEED_TOPUP" || code === "PROJECT_REQUIRED" || code === "DUPLICATE_PROPOSAL";
  check(`${role}: may answer a requirement`, gotThrough, code ?? "sent");
  check(`${role}: …and was never refused on ROLE`, code !== "FORBIDDEN", code ?? "—");
}

// ---------------------------------------------------------------------------
section("RLS — the browser key sees none of it");
// ---------------------------------------------------------------------------
const anonKey = E.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supaUrl = E.NEXT_PUBLIC_SUPABASE_URL;
if (anonKey && supaUrl) {
  for (const t of ["leads", "inquiries", "verified_contact_numbers", "user_blocks", "lead_contact_events", "inquiry_options"]) {
    const r = await fetch(`${supaUrl}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
    });
    const body = await r.text();
    let rows = null;
    try { const j = JSON.parse(body); rows = Array.isArray(j) ? j.length : null; } catch { /* an error object, not rows */ }
    const leaked = r.ok && rows !== null && rows > 0;
    check(`anon key cannot read ${t}`, !leaked,
      leaked ? `LEAK: ${rows} row(s)` : rows === 0 ? "HTTP 200, 0 rows (RLS)" : `HTTP ${r.status}`);
  }
} else {
  check("RLS sweep (skipped — no anon key in .env.local)", true, "");
}

// ---------------------------------------------------------------------------
section("BROWSER — what each role actually sees");
// ---------------------------------------------------------------------------
const browser = await launch({ headless: true });
const page = await newPage(browser, "about:blank");
await page.setViewport(390, 844);
const signIn = async (phone) => {
  await page.goto(`${BASE}/login`, { waitMs: 900 });
  return page.eval(`(async () => {
    const post = async (u, b) => (await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), credentials: "same-origin" })).json();
    const r1 = await post("/api/v1/auth/otp/request", { phone: ${JSON.stringify(phone)} });
    if (!r1.ok) return false;
    const r2 = await post("/api/v1/auth/otp/verify", { otpSession: r1.data.otpSession, code: r1.data.devCode ?? "123456" });
    return !!r2.ok;
  })()`);
};
const signOut = () => page.eval(`(async () => { await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {}); return true; })()`);

try {
  // GUEST
  await signOut();
  await page.goto(`${BASE}/leads`, { waitMs: 1500 });
  const guestPath = await page.eval(`location.pathname + location.search`);
  check("guest opening /leads is sent to sign in", guestPath.startsWith("/login"), guestPath);
  check("…and is brought back to /leads afterwards", /next=%2Fleads|next=\/leads/.test(guestPath), guestPath);
  await page.screenshot(path.join(SHOTS, "guest-leads.png"));

  // BUILDER
  await signIn(builder.phone);
  await page.goto(`${BASE}/listings/${listing.id}`, { waitMs: 1800 });
  await page.waitFor(`(document.querySelector("main")?.innerText ?? "").length > 200`);
  const builderView = await page.eval(`(() => {
    const t = document.body.innerText;
    return {
      hasCta: [...document.querySelectorAll("button")].some(b => /send inquiry/i.test(b.innerText)),
      note: /builders answer requirements/i.test(t),
      navSearch: [...document.querySelectorAll('nav a')].some(a => (a.getAttribute("aria-label") || "") === "Search"),
    };
  })()`);
  check("builder: no Send Inquiry button on a property", builderView.hasCta === false, `cta=${builderView.hasCta}`);
  check("builder: told where they DO connect", builderView.note === true, `note=${builderView.note}`);
  check("builder: bottom nav has no Search (Doc2 role rule)", builderView.navSearch === false, `search=${builderView.navSearch}`);
  await page.screenshot(path.join(SHOTS, "builder-property.png"));

  await page.goto(`${BASE}/leads`, { waitMs: 1500 });
  const builderLeads = await page.eval(`(() => ({
    path: location.pathname,
    tabs: /Received/i.test(document.querySelector("main")?.innerText ?? ""),
  }))()`);
  check("builder: still has their own Leads screen", builderLeads.path === "/leads" && builderLeads.tabs, JSON.stringify(builderLeads));

  // OWNER and BROKER
  for (const person of [owner, broker]) {
    // The API walk above already connected them to this listing, so clear it —
    // otherwise the browser only ever sees the already-sent card and the three
    // steps go untested for these two roles.
    await db.query(`delete from leads where listing_id=$1 and lead_profile_id=$2`, [listing.id, person.id]);
    await db.query(`delete from inquiries where listing_id=$1 and profile_id=$2`, [listing.id, person.id]);
    await signIn(person.phone);
    await page.goto(`${BASE}/listings/${listing.id}`, { waitMs: 1800 });
    await page.waitFor(`[...document.querySelectorAll("button")].some(b => /send inquiry/i.test(b.innerText))`);
    const cta = await page.clickText("Send Inquiry");
    await page.waitFor(`/step 1 of 3|inquiry already sent|builders answer/i.test(document.body.innerText)`);
    const sheet = await page.eval(`(() => {
      const t = document.body.innerText;
      return { steps: /step 1 of 3/i.test(t), already: /inquiry already sent/i.test(t), blocked: /builders answer requirements/i.test(t) };
    })()`);
    check(`${person.role}: Send Inquiry opens the three-step sheet`,
      sheet.steps === true && !sheet.blocked,
      cta ? `steps=${sheet.steps} already=${sheet.already} blocked=${sheet.blocked}` : "no button");
    await page.screenshot(path.join(SHOTS, `${person.role}-inquiry.png`));
  }
} finally {
  try { page.close(); } catch { /* closing */ }
  await browser.close();
}

console.log(`\nscreenshots → ${SHOTS}`);
const failed = results.filter((r) => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:"); failed.forEach((f) => console.log(` ❌ ${f.n} — ${f.d}`)); }
await db.end();
process.exit(failed.length ? 1 : 0);
