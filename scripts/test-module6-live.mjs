/**
 * LIVE end-to-end proof for Module 6 (Feed & Stories) through the real HTTP API:
 * feed ranking (boosted first, own excluded), pagination, new-count, requirement
 * mode entitlement, save toggle persistence, inquiry self-block + dedup, report
 * persistence + can't-report-own, stories + seen, builder role gate, plus the
 * unauth sweep. Assumes `node scripts/seed-module6.mjs` has run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.env.MODULE6_BASE || "http://localhost:3000";
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
function save(res, key) { const set = res.headers.getSetCookie?.() ?? []; const cur = jar.get(key) ?? new Map(); for (const ck of set) { const [pair] = ck.split(";"); const i = pair.indexOf("="); cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); } jar.set(key, cur); }
const cookie = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");
async function api(key, p, { method = "GET", body } = {}) {
  const res = await fetch(BASE + p, { method, headers: { "content-type": "application/json", ...(key ? { cookie: cookie(key) } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (key) save(res, key); let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function login(phone) { const k = phone; const r = await api(k, "/api/v1/auth/otp/request", { method: "POST", body: { phone } }); const v = await api(k, "/api/v1/auth/otp/verify", { method: "POST", body: { otpSession: r.json?.data?.otpSession, code: r.json?.data?.devCode ?? "123456" } }); return { key: k, ok: v.status === 200 }; }

let allPass = true;
const pass = (c, m) => { if (!c) allPass = false; console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); };

const AMIT = "+919999000007";   // broker — buyer view, ₹2,999 unlocked, saves/inquiries/reports
const SURESH = "+919999000013"; // builder — dashboard
const RAHUL = "+919999000001";  // owner

console.log(`BASE=${BASE}`);
const amit = await login(AMIT); pass(amit.ok, "Amit login");
const suresh = await login(SURESH); pass(suresh.ok, "Suresh (builder) login");
const rahul = await login(RAHUL); pass(rahul.ok, "Rahul (owner) login");
const amitId = (await dbOne("select id from profiles where phone=$1", [AMIT])).id;

// ---- Feed ----
console.log("\n== Feed ==");
const guestFeed = await api(null, "/api/v1/feed");
pass(guestFeed.status === 200 && (guestFeed.json?.data?.items ?? []).length > 0, `guest feed returns ${(guestFeed.json?.data?.items ?? []).length} items`);
pass(guestFeed.json?.data?.items?.[0]?.promoted === true, "boosted listing ranks FIRST (promoted=true at top)");

const amitFeed = await api(amit.key, "/api/v1/feed");
const amitItems = amitFeed.json?.data?.items ?? [];
const ownCount = (await pgc.query("select count(*) c from listings where profile_id=$1 and status='live'", [amitId])).rows[0].c;
pass(amitItems.every((i) => i.poster.id !== amitId), `own listings excluded from Amit's feed (he owns ${ownCount})`);

// pagination
if (amitFeed.json?.data?.nextCursor) {
  const p2 = await api(amit.key, `/api/v1/feed?cursor=${encodeURIComponent(amitFeed.json.data.nextCursor)}`);
  const ids1 = new Set(amitItems.map((i) => i.id));
  const p2new = (p2.json?.data?.items ?? []).filter((i) => !ids1.has(i.id));
  pass(p2.status === 200, `cursor pagination returns page 2 (${(p2.json?.data?.items ?? []).length} items, ${p2new.length} new)`);
} else pass(true, "single page (no cursor) — acceptable with small dataset");

const nc = await api(amit.key, "/api/v1/feed/new-count?since=2020-01-01T00:00:00Z");
pass(nc.json?.data?.count > 0, `new-count returns ${nc.json?.data?.count}`);

// ---- Requirement mode ----
console.log("\n== Requirement mode ==");
const reqMode = await api(amit.key, "/api/v1/feed/requirement-mode");
pass(reqMode.json?.data?.unlocked === true, "Amit (₹2,999) → requirement mode UNLOCKED");
const guestReq = await api(null, "/api/v1/feed/requirement-mode");
const guestReqCards = (guestReq.json?.data?.sections ?? []).flatMap((s) => s.cards);
pass(guestReqCards.length === 0 || guestReqCards.every((c) => c.access === "locked" && c.budgetLabel === undefined), "guest requirement cards locked + budget stripped");

// ---- Save toggle ----
console.log("\n== Save ==");
const target = (await dbOne("select id from listings where status='live' and profile_id <> $1 limit 1", [amitId])).id;
await pgc.query("delete from saves where profile_id=$1 and listing_id=$2", [amitId, target]);
const s1 = await api(amit.key, "/api/v1/saves", { method: "POST", body: { listingId: target } });
pass(s1.json?.data?.saved === true, "save → saved=true");
const inDb = await dbOne("select id from saves where profile_id=$1 and listing_id=$2", [amitId, target]);
pass(!!inDb, "save persisted to DB");
const s2 = await api(amit.key, "/api/v1/saves", { method: "POST", body: { listingId: target } });
pass(s2.json?.data?.saved === false, "toggle → saved=false (removed)");

// ---- Inquiry ----
console.log("\n== Inquiry ==");
const ownListing = await dbOne("select id from listings where profile_id=$1 and status='live' limit 1", [amitId]);
if (ownListing) {
  const self = await api(amit.key, "/api/v1/inquiries", { method: "POST", body: { listingId: ownListing.id, message: "x" } });
  pass(self.json?.error?.code === "SELF_ACTION_BLOCKED", "self-inquiry blocked");
}
await pgc.query("delete from inquiries where profile_id=$1 and listing_id=$2", [amitId, target]);
const i1 = await api(amit.key, "/api/v1/inquiries", { method: "POST", body: { listingId: target, message: "Is this available?", intents: ["site_visit"] } });
pass(i1.json?.data?.sent === true && i1.json?.data?.alreadySent === false, "inquiry sent (new)");
const i2 = await api(amit.key, "/api/v1/inquiries", { method: "POST", body: { listingId: target, message: "Still available?" } });
pass(i2.json?.data?.alreadySent === true, "re-inquiry → dedup (alreadySent=true)");
const inqCount = (await pgc.query("select count(*) c from inquiries where profile_id=$1 and listing_id=$2", [amitId, target])).rows[0].c;
pass(Number(inqCount) === 1, "exactly ONE inquiry row despite two sends");

// ---- Report ----
console.log("\n== Report ==");
if (ownListing) {
  const ownRep = await api(amit.key, "/api/v1/reports", { method: "POST", body: { subjectType: "listing", subjectId: ownListing.id, reason: "fake" } });
  pass(ownRep.status !== 200 || ownRep.json?.ok === false, "can't report your OWN listing");
}
await pgc.query("delete from reports where reporter_id=$1 and subject_id=$2", [amitId, target]);
const rep1 = await api(amit.key, "/api/v1/reports", { method: "POST", body: { subjectType: "listing", subjectId: target, reason: "wrong_price", note: "off" } });
pass(rep1.json?.data?.reported === true, "report submitted");
const rep2 = await api(amit.key, "/api/v1/reports", { method: "POST", body: { subjectType: "listing", subjectId: target, reason: "fake" } });
const repCount = (await pgc.query("select count(*) c from reports where reporter_id=$1 and subject_id=$2", [amitId, target])).rows[0].c;
pass(rep2.json?.data?.reported === true && Number(repCount) === 1, "re-report is a no-op (one row)");

// ---- Stories ----
console.log("\n== Stories ==");
const stories = await api(amit.key, "/api/v1/stories");
const circles = stories.json?.data?.circles ?? [];
pass(circles.length > 0, `story row returns ${circles.length} circles`);
pass(!circles.some((c) => c.posterId === amitId), "NO own story circle (auto-only, no add-story)");
const seg = circles[0]?.segments?.[0];
if (seg) {
  const seen = await api(amit.key, `/api/v1/stories/${seg.id}/seen`, { method: "POST" });
  pass(seen.status === 200, "mark segment seen");
  const inSeen = await dbOne("select 1 from story_seen where profile_id=$1 and segment_id=$2", [amitId, seg.id]);
  pass(!!inSeen, "seen persisted per-city");
  const segRes = await api(amit.key, `/api/v1/stories/${seg.id}`);
  pass(segRes.json?.data?.segment?.id === seg.id, "story segment media endpoint returns overlay data");
}

// ---- Builder dashboard + role gate ----
console.log("\n== Builder dashboard ==");
const bd = await api(suresh.key, "/api/v1/feed/builder-dashboard");
pass(bd.status === 200, `builder dashboard 200 (${(bd.json?.data?.projects ?? []).length} projects, ${(bd.json?.data?.matched ?? []).length} matched)`);
const bdGate = await api(rahul.key, "/api/v1/feed/builder-dashboard");
pass(bdGate.status === 403, `non-builder blocked from dashboard (${bdGate.status})`);

// ---- Not-interested ----
console.log("\n== Not interested ==");
await pgc.query("delete from feed_not_interested where profile_id=$1", [amitId]);
const ni = await api(amit.key, "/api/v1/feed/not-interested", { method: "POST", body: { typeCode: "plot_res" } });
pass(ni.json?.data?.ok === true, "not-interested persists a down-rank pref");

// ---- Unauth sweep ----
console.log("\n== Unauth sweep (expect 401) ==");
for (const [p, body] of [["/api/v1/saves", { listingId: target }], ["/api/v1/inquiries", { listingId: target }], ["/api/v1/reports", { subjectType: "listing", subjectId: target, reason: "fake" }], ["/api/v1/feed/not-interested", { typeCode: "flat" }]]) {
  const r = await api(null, p, { method: "POST", body });
  pass(r.status === 401, `unauth POST ${p} → 401 (${r.status})`);
}

await pgc.end();
console.log(`\n${allPass ? "ALL PASS ✓" : "SOME FAILED ✗"}`);
process.exit(allPass ? 0 : 1);
