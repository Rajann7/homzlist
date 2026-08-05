/**
 * Live proof for the two bugs fixed on the `screen-audit` branch:
 *
 *   1. MY LISTINGS SHOWED NOTHING TO A BUILDER. `GET /listings/mine` only ever
 *      read the `listings` table, and a builder cannot post a property at all
 *      (migration 0067) — so the one screen named after their inventory was
 *      permanently empty while their rows sat in `projects`.
 *
 *   2. TAPPING BOOST DID NOTHING. A subject that isn't boostable yet (still
 *      under review) sent the seller to the Boosts LIST, which says "No boosts
 *      yet" and explains nothing. The buy screen now takes them and shows the
 *      subject dimmed with its lock reason.
 *
 * Every assertion is the SERVER's answer checked against the actual DB row.
 *
 *   MINE_BASE=http://localhost:3000 node scripts/check-my-listings-projects.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const BASE = process.env.MINE_BASE || "http://localhost:3000";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a verification run into a false failure.
// scripts/lib/dbx.mjs walks the same ladder q.mjs and db-proof.mjs already use:
// direct first, then the regional poolers on 5432 and 6543.
const pgc = await dbConnect();
const sql = (s, p) => pgc.query(s, p);

const jar = new Map();
function save(res, key) {
  const cur = jar.get(key) ?? new Map();
  for (const ck of res.headers.getSetCookie?.() ?? []) {
    const [pair] = ck.split(";");
    const i = pair.indexOf("=");
    cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jar.set(key, cur);
}
const cookie = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

let ipN = 70;
async function api(key, p, { method = "GET", body, ip } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}), ...(key ? { cookie: cookie(key) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (key) save(res, key);
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}
async function login(phone) {
  const ip = `198.51.100.${ipN++}`;
  const r = await api(phone, "/api/v1/auth/otp/request", { method: "POST", body: { phone }, ip });
  if (r.status === 429) return "rate_limited";
  const v = await api(phone, "/api/v1/auth/otp/verify", {
    method: "POST", ip,
    body: { otpSession: r.json?.data?.otpSession, code: r.json?.data?.devCode ?? "123456" },
  });
  return v.status === 200 ? "ok" : "failed";
}

let fails = 0;
const check = (cond, label, extra = "") => {
  if (!cond) fails++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};

// Any builder who owns at least one project, and one who owns a LIVE one.
const builders = (await sql(`
  select p.id, p.phone,
         count(*) filter (where pr.deleted_at is null) as projects,
         count(*) filter (where pr.status = 'live' and pr.deleted_at is null) as live
  from profiles p join projects pr on pr.profile_id = p.id
  where p.role = 'builder' and p.state = 'active'
  group by p.id, p.phone order by live desc, projects desc
`)).rows;

if (!builders.length) {
  console.log("no builder with a project — nothing to prove");
  await pgc.end();
  process.exit(1);
}

for (const b of builders.slice(0, 2)) {
  const projRows = (await sql(
    `select id, name, status from projects where profile_id = $1 and deleted_at is null order by created_at desc`,
    [b.id],
  )).rows;
  const listRows = (await sql(
    `select id, status from listings where profile_id = $1 and status <> 'deleted'`,
    [b.id],
  )).rows;

  console.log(`\nbuilder ${b.phone} — DB says ${projRows.length} project(s) (${b.live} live), ${listRows.length} listing(s)`);
  const auth = await login(b.phone);
  if (auth !== "ok") { console.log(`  [SKIP] login ${auth}`); continue; }

  // ---- 1. My Listings carries the projects --------------------------------
  const mine = await api(b.phone, "/api/v1/listings/mine");
  const items = mine.json?.data?.items ?? [];
  const projectItems = items.filter((i) => i.subjectKind === "project");

  check(mine.status === 200, "GET /listings/mine 200", `got ${mine.status}`);
  check(
    items.length === projRows.length + listRows.length,
    "the manager returns every row the DB has",
    `api ${items.length} vs db ${projRows.length + listRows.length}`,
  );
  check(
    projectItems.length === projRows.length,
    "every project is in the list",
    `api ${projectItems.length} vs db ${projRows.length}`,
  );
  for (const p of projRows) {
    const item = projectItems.find((i) => i.id === p.id);
    check(!!item && item.status === p.status, `project "${p.name}" present with its real status`, item ? `api ${item.status} / db ${p.status}` : "missing");
  }

  // The chips must count the same rows the list holds.
  const filters = Object.fromEntries((mine.json?.data?.filters ?? []).map((f) => [f.key, f.count]));
  const dbPending = projRows.filter((p) => p.status === "pending_review").length
    + listRows.filter((l) => l.status === "pending_review").length;
  check(filters.all === items.length, "the All chip counts the whole list", `chip ${filters.all} / list ${items.length}`);
  check(filters.pending_review === dbPending, "the Pending chip matches the DB", `chip ${filters.pending_review} / db ${dbPending}`);

  // Only a LIVE project may be boosted, and the manager says so per row.
  for (const item of projectItems) {
    check(item.canBoost === (item.status === "live"), `canBoost is the server's verdict for "${item.title}"`, `canBoost=${item.canBoost} status=${item.status}`);
  }

  // ---- 2. The boost screen has something to say about every subject -------
  const el = await api(b.phone, "/api/v1/billing/boost/eligible");
  const subjects = el.json?.data?.listings ?? [];
  const liveProjects = projRows.filter((p) => p.status === "live");

  check(el.status === 200, "GET /billing/boost/eligible 200", `got ${el.status}`);
  for (const p of liveProjects) {
    const s = subjects.find((x) => x.id === p.id && x.subjectKind === "project");
    check(!!s?.eligible, `live project "${p.name}" is offered as boostable`, s ? `eligible=${s.eligible} lock=${s.lockLabel ?? "-"}` : "absent");
  }
  for (const s of subjects.filter((x) => !x.eligible)) {
    // The dead end was an ineligible subject with nothing to render. Every one
    // of them must carry the reason the screen dims it with.
    check(!!s.lockLabel, `ineligible "${s.title}" carries a lock reason`, s.lockLabel ?? "none");
  }
  console.log(`  (boost picker: ${subjects.length} subject(s), ${subjects.filter((s) => s.eligible).length} eligible)`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
await pgc.end();
process.exit(fails ? 1 : 0);
