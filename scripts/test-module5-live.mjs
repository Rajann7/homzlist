/**
 * LIVE end-to-end proof for Module 5 through the real HTTP API — proposals,
 * browse entitlement (DevTools-proof), the number rule, visits, leads, plus the
 * security sweep (unauth 401s, IDOR 404s, self/duplicate guards).
 *
 * Assumes `node scripts/seed-module5.mjs` has run. BASE defaults to the port the
 * preview server printed; override with MODULE5_BASE.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.env.MODULE5_BASE || "http://localhost:44277";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const pgc = new pg.Client({ host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres", password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await pgc.connect();
const dbOne = async (s, p) => (await pgc.query(s, p)).rows[0];

const jar = new Map();
function saveCookies(res, key) {
  const set = res.headers.getSetCookie?.() ?? [];
  const cur = jar.get(key) ?? new Map();
  for (const c of set) { const [pair] = c.split(";"); const i = pair.indexOf("="); cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  jar.set(key, cur);
}
const cookieHeader = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");
async function api(key, path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(key ? { cookie: cookieHeader(key) } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (key) saveCookies(res, key);
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function login(phone) {
  const key = phone;
  const req = await api(key, "/api/v1/auth/otp/request", { method: "POST", body: { phone } });
  const code = req.json?.data?.devCode ?? "123456";
  const ver = await api(key, "/api/v1/auth/otp/verify", { method: "POST", body: { otpSession: req.json?.data?.otpSession, code } });
  const me = await api(key, "/api/v1/auth/me");
  return { key, ok: ver.status === 200, role: me.json?.data?.role ?? me.json?.data?.profile?.role };
}

let allPass = true;
const pass = (c, m) => { if (!c) allPass = false; console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); };

// Actors
const AMIT = "+919999000007";   // broker — unlocked viewer + sender + visit buyer
const RAHUL = "+919999000001";  // owner — poster
const RK = "+919825012345";     // broker — leads owner

console.log(`BASE=${BASE}`);
const amit = await login(AMIT); pass(amit.ok, `Amit login (role=${amit.role})`);
const rahul = await login(RAHUL); pass(rahul.ok, `Rahul login (role=${rahul.role})`);
const rk = await login(RK); pass(rk.ok, `RK login (role=${rk.role})`);

const reqId = (await dbOne("select id from requirements where notes='SEED-M5' limit 1"))?.id;
console.log(`\nseed requirement = ${reqId}`);

// ---- 1. Browse entitlement (DevTools-proof) --------------------------------
console.log("\n== Browse entitlement ==");
const guestBrowse = await api(null, "/api/v1/requirements/browse");
const guestCards = (guestBrowse.json?.data?.sections ?? []).flatMap((s) => s.cards);
pass(guestBrowse.json?.data?.unlocked === false, "guest browse: unlocked=false");
pass(guestCards.length > 0 && guestCards.every((c) => c.access === "locked"), `guest cards all locked (${guestCards.length})`);
pass(guestCards.every((c) => c.budgetLabel === undefined && c.posterName === undefined), "guest cards carry NO budget/poster (server-stripped, DevTools-proof)");

const amitBrowse = await api(amit.key, "/api/v1/requirements/browse");
const amitCards = (amitBrowse.json?.data?.sections ?? []).flatMap((s) => s.cards);
pass(amitBrowse.json?.data?.unlocked === true, "Amit browse: unlocked=true (₹2,999 access)");
pass(amitCards.some((c) => c.budgetLabel && c.posterName), "Amit cards carry budget + poster");

// ---- 2. Send proposal: quota decrement + guards ----------------------------
console.log("\n== Send proposal ==");
const target = (await pgc.query("select id from requirements where status='live' and profile_id <> (select id from profiles where phone=$1) and id not in (select requirement_id from proposals where sender_id=(select id from profiles where phone=$1)) limit 1", [AMIT])).rows[0]?.id;
// Sum across ALL of Amit's active plans — consume_quota draws from the pooled
// balance (FIFO across plans), not necessarily the seeded row.
const usedSum = async () => Number((await dbOne("select coalesce(sum(proposal_used),0) u from user_plans where profile_id=(select id from profiles where phone=$1) and status='active' and proposal_quota >= 0", [AMIT]))?.u);
const before = await usedSum();
const send = await api(amit.key, `/api/v1/requirements/${target}/proposals`, { method: "POST", body: { mode: "chat", message: "Live test proposal" } });
pass(send.status === 200, `Amit sends proposal to ${target?.slice(0, 8)} (${send.status})`);
const after = await usedSum();
pass(after === before + 1, `pooled proposal_used incremented atomically (${before} → ${after})`);
const dbProp = await dbOne("select consumption_id from proposals where requirement_id=$1 and sender_id=(select id from profiles where phone=$2)", [target, AMIT]);
pass(!!dbProp?.consumption_id, "proposal row records its quota consumption_id (refund-traceable)");

const dup = await api(amit.key, `/api/v1/requirements/${target}/proposals`, { method: "POST", body: { mode: "chat" } });
pass(dup.status === 400 && dup.json?.error?.code === "DUPLICATE_PROPOSAL", `duplicate guard → DUPLICATE_PROPOSAL (${dup.status})`);

const self = await api(rahul.key, `/api/v1/requirements/${reqId}/proposals`, { method: "POST", body: { mode: "chat" } });
pass(self.json?.error?.code === "SELF_ACTION_BLOCKED", `self-proposal blocked → SELF_ACTION_BLOCKED`);

// ---- 3. Number rule + IDOR on received -------------------------------------
console.log("\n== Proposals received (number rule) ==");
const received = await api(rahul.key, `/api/v1/requirements/${reqId}/proposals?view=received`);
const rItems = received.json?.data?.items ?? [];
pass(rItems.length > 0, `Rahul sees ${rItems.length} received proposals`);
pass(rItems.every((p) => typeof p.sender?.phone === "string" && p.sender.phone.length > 0), "each received proposal auto-includes the SENDER's number (the rule)");
const idor = await api(amit.key, `/api/v1/requirements/${reqId}/proposals?view=received`);
pass(idor.status === 404, `IDOR: Amit can't read Rahul's received proposals (${idor.status})`);

// Accept a pending one
const pendingId = (await dbOne("select id from proposals where poster_id=(select id from profiles where phone=$1) and status='pending' limit 1", [RAHUL]))?.id;
const accept = await api(rahul.key, `/api/v1/proposals/${pendingId}`, { method: "PATCH", body: { action: "accept" } });
pass(accept.json?.data?.status === "accepted", "Rahul accepts a pending proposal → accepted");
const idorAct = await api(amit.key, `/api/v1/proposals/${pendingId}`, { method: "PATCH", body: { action: "decline" } });
pass(idorAct.status === 404, `IDOR: Amit can't act on Rahul's proposal (${idorAct.status})`);

// ---- 4. My proposals sent --------------------------------------------------
console.log("\n== My proposals sent ==");
const mine = await api(amit.key, "/api/v1/proposals/mine");
pass((mine.json?.data?.items ?? []).length > 0, `Amit sees ${(mine.json?.data?.items ?? []).length} sent proposals`);
pass((mine.json?.data?.items ?? []).some((p) => p.nonRefund), "at least one declined/expired shows the non-refund note");

// ---- 5. Leads: role variant + IDOR ----------------------------------------
console.log("\n== Leads ==");
const rkLeads = await api(rk.key, "/api/v1/leads");
pass(rkLeads.json?.data?.ownerVariant === false, "RK (broker) → full pipeline (ownerVariant=false)");
pass((rkLeads.json?.data?.leads ?? []).length > 0, `RK sees ${(rkLeads.json?.data?.leads ?? []).length} leads`);
pass(rkLeads.json?.data?.summary?.conversionPct !== null, "broker sees conversion stat");
const rahulLeads = await api(rahul.key, "/api/v1/leads");
pass(rahulLeads.json?.data?.ownerVariant === true, "Rahul (owner) → simplified list (ownerVariant=true)");
pass(rahulLeads.json?.data?.summary?.conversionPct === null, "owner does NOT see conversion stat");
// IDOR: Amit tries to move one of RK's leads
const rkLeadId = (await dbOne("select id from leads where owner_id=(select id from profiles where phone=$1) limit 1", [RK]))?.id;
const leadIdor = await api(amit.key, `/api/v1/leads/${rkLeadId}`, { method: "PATCH", body: { action: "stage", stage: "closed_won" } });
pass(leadIdor.status === 404, `IDOR: Amit can't move RK's lead (${leadIdor.status})`);
// CSV export
const csv = await fetch(BASE + "/api/v1/leads/export?fields=name,phone,stage", { headers: { cookie: cookieHeader(rk.key) } });
const csvText = await csv.text();
pass(csv.status === 200 && csvText.includes("Name,Phone,Stage"), "RK CSV export returns text/csv with header");

// ---- 6. Visits -------------------------------------------------------------
console.log("\n== Visits ==");
const visits = await api(amit.key, "/api/v1/visits/mine");
const vItems = visits.json?.data?.items ?? [];
pass(vItems.length > 0, `Amit sees ${vItems.length} visits`);
pass(new Set(vItems.map((v) => v.section)).size >= 3, `visits span multiple sections (${[...new Set(vItems.map((v) => v.section))].join(", ")})`);

// ---- 7. Unauth sweep -------------------------------------------------------
console.log("\n== Unauthenticated sweep (expect 401) ==");
for (const p of ["/api/v1/proposals/mine", "/api/v1/leads", "/api/v1/visits/mine", `/api/v1/requirements/${reqId}/proposals?view=received`]) {
  const r = await api(null, p);
  pass(r.status === 401, `unauth ${p} → 401 (${r.status})`);
}

await pgc.end();
console.log(`\n${allPass ? "ALL PASS ✓" : "SOME FAILED ✗"}`);
process.exit(allPass ? 0 : 1);
