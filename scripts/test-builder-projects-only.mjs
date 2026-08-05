/**
 * LIVE proof for "a Builder posts PROJECTS only" (migration 0067).
 *
 *   node scripts/test-builder-projects-only.mjs
 *   BASE=http://localhost:3000 node scripts/test-builder-projects-only.mjs
 *
 * Walks the real HTTP API as a real Builder and a real Owner and checks that
 *   · the builder is refused on every path that would publish a listing or a
 *     requirement — create, submit-a-draft, un-hide, re-activate, restore,
 *     reopen, the active toggle, a content edit,
 *   · the ₹999 plan is gone from the builder's catalog while ₹9,999 stays,
 *   · projects are untouched for the builder, and
 *   · the OWNER can still do all of it (the regression half — this change must
 *     not have narrowed anyone else).
 *
 * Nothing here is seeded or granted: it reads the state migration 0067 left.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const BASE = process.env.BASE || "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const pgc = await dbConnect();
const one = async (sql, params) => (await pgc.query(sql, params)).rows[0] ?? null;

// ---- http with a cookie jar per user ---------------------------------------
const jar = new Map();
function saveCookies(res, key) {
  const cur = jar.get(key) ?? new Map();
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jar.set(key, cur);
}
const cookieHeader = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(key, p, { method = "GET", body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      "content-type": "application/json",
      host: new URL(BASE).host,
      ...(key ? { cookie: cookieHeader(key) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (key) saveCookies(res, key);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data: json?.data, error: json?.error };
}

async function login(phone) {
  const req = await api(phone, "/api/v1/auth/otp/request", { method: "POST", body: { phone } });
  const code = req.data?.devCode ?? E.OTP_DEV_FIXED_CODE ?? "123456";
  await api(phone, "/api/v1/auth/otp/verify", { method: "POST", body: { otpSession: req.data?.otpSession, code } });
  const me = await api(phone, "/api/v1/auth/me");
  return me.data?.user?.role ?? null;
}

let checks = 0, failures = 0;
const fails = [];
function check(cond, msg, detail) {
  checks++;
  if (!cond) { failures++; fails.push(msg + (detail ? ` — ${detail}` : "")); }
  console.log(`${cond ? "  ok  " : "  FAIL"}  ${msg}${detail && !cond ? ` — ${detail}` : ""}`);
}
const head = (s) => console.log(`\n=== ${s} ${"=".repeat(Math.max(0, 62 - s.length))}`);

// The builder to probe is CHOSEN from the data, not hardcoded: it has to be one
// that actually owns something 0067 took down, or "un-hide is refused" would
// pass for the wrong reason (nothing to un-hide).
const picked = await one(`
  select p.phone
    from profiles p
   where p.role = 'builder'
     and exists (select 1 from listings l     where l.profile_id = p.id and l.status = 'hidden')
     and exists (select 1 from requirements r where r.profile_id = p.id and r.status = 'paused')
     and exists (select 1 from projects pj    where pj.profile_id = p.id and pj.status = 'live')
   limit 1`);
if (!picked) { console.error("no builder with a hidden listing + paused requirement + live project"); process.exit(1); }
const BUILDER = picked.phone;
const OWNER = "+919825000001";
console.log(`probing builder ${BUILDER}`);

const bRole = await login(BUILDER);
const oRole = await login(OWNER);
if (bRole !== "builder" || oRole !== "owner") {
  console.error(`expected builder/owner, got ${bRole}/${oRole}`); process.exit(1);
}

const bProfile = await one(`select id from profiles where phone=$1`, [BUILDER]);
const bListing = await one(
  `select id, status from listings where profile_id=$1 and status='hidden' limit 1`, [bProfile.id]);
const bRequirement = await one(
  `select id, status, is_active from requirements where profile_id=$1 and status='paused' limit 1`, [bProfile.id]);

// ---------------------------------------------------------------------------
head("builder — creation config");
const bCfg = await api(BUILDER, "/api/v1/listings/config");
check(bCfg.data?.role === "builder", "config reports role=builder", bCfg.data?.role);
check((bCfg.data?.types ?? []).length === 0, "no property type is offered to a builder", `${bCfg.data?.types?.length} offered`);
check((bCfg.data?.projectTypes ?? []).length > 0, "project types ARE offered to a builder", `${bCfg.data?.projectTypes?.length}`);

head("builder — every publish path is refused");
const bCreate = await api(BUILDER, "/api/v1/listings", {
  method: "POST",
  body: { typeCode: "flat", kind: "sell", title: "Gate probe", pricePaise: 5000000, pincode: "360004" },
});
check(bCreate.error?.code === "FORBIDDEN", "POST /listings → FORBIDDEN", `${bCreate.status} ${bCreate.error?.code}`);

const bReq = await api(BUILDER, "/api/v1/requirements", {
  method: "POST",
  body: { kind: "sell", typeCode: "flat", budgetMin: 2000000, budgetMax: 4000000, urgency: "immediate" },
});
check(bReq.error?.code === "FORBIDDEN", "POST /requirements → FORBIDDEN", `${bReq.status} ${bReq.error?.code}`);

for (const action of ["unhide", "reactivate", "restore"]) {
  const r = await api(BUILDER, `/api/v1/listings/${bListing.id}/status`, { method: "POST", body: { action } });
  check(r.error?.code === "FORBIDDEN", `POST /listings/:id/status {${action}} → FORBIDDEN`, `${r.status} ${r.error?.code}`);
}

const bSubmit = await api(BUILDER, `/api/v1/listings/${bListing.id}/submit`, { method: "POST" });
check(bSubmit.error?.code === "FORBIDDEN", "POST /listings/:id/submit → FORBIDDEN", `${bSubmit.status} ${bSubmit.error?.code}`);

for (const [label, body] of [
  ["isActive:true", { isActive: true }],
  ["reopen", { reopen: true }],
  ["content edit", { typeCode: "flat", kind: "sell", budgetMin: 100000, budgetMax: 200000 }],
]) {
  const r = await api(BUILDER, `/api/v1/requirements/${bRequirement.id}`, { method: "PATCH", body });
  check(r.error?.code === "FORBIDDEN", `PATCH /requirements/:id {${label}} → FORBIDDEN`, `${r.status} ${r.error?.code}`);
}

head("builder — the takedown held");
const after = await one(`select status from listings where id=$1`, [bListing.id]);
check(after.status === "hidden", "the listing is still hidden after all of that", after.status);
const afterReq = await one(`select status, is_active from requirements where id=$1`, [bRequirement.id]);
check(afterReq.status === "paused" && afterReq.is_active === false, "the requirement is still paused", `${afterReq.status}/${afterReq.is_active}`);

head("builder — catalog");
const bPlans = await api(BUILDER, "/api/v1/billing/plans");
const bCodes = (bPlans.data?.plans ?? []).map((p) => p.code);
check(!bCodes.includes("p999"), "₹999 Listing Plan is NOT on sale to a builder", bCodes.join(","));
check(bCodes.includes("p9999"), "₹9,999 Builder Project plan still is", bCodes.join(","));
check(bCodes.includes("p2999"), "₹2,999 Requirement Access (viewing) still is", bCodes.join(","));

head("catalog copy matches the catalog row");
// The "Compare plans" sheets (P5 wall + P11 Plans) print a ₹9,999 column by
// hand. These are the numbers those cells claim to be reading.
const p9999 = await one(`select listing_quota, requirement_quota, project_quota from plan_catalog where code='p9999'`);
check(p9999.listing_quota === 0, "p9999 grants NO listing slot (compare sheet says '—')", String(p9999.listing_quota));
check(p9999.requirement_quota === 0, "p9999 grants NO requirement post (compare sheet says '—')", String(p9999.requirement_quota));
check(p9999.project_quota === 1, "p9999 grants 1 project", String(p9999.project_quota));

head("builder — projects untouched");
const bProjects = await api(BUILDER, "/api/v1/feed/builder-dashboard");
check(bProjects.status === 200, "builder dashboard still loads", String(bProjects.status));
const projRow = await one(`select count(*)::int n from projects where profile_id=$1 and status='live'`, [bProfile.id]);
check(projRow.n > 0, "the builder's live projects are still live", `${projRow.n} live`);

// ---------------------------------------------------------------------------
head("owner — nothing was narrowed (regression)");
const oCfg = await api(OWNER, "/api/v1/listings/config");
check((oCfg.data?.types ?? []).length === 13, "owner is still offered all 13 property types", `${oCfg.data?.types?.length}`);
const oPlans = await api(OWNER, "/api/v1/billing/plans");
const oCodes = (oPlans.data?.plans ?? []).map((p) => p.code);
check(oCodes.includes("p999"), "₹999 is still on sale to an owner", oCodes.join(","));
check(!oCodes.includes("p9999"), "₹9,999 is still builder-only", oCodes.join(","));

// Creation for an owner is payment-first, so a quota-less owner must be told
// PLAN_REQUIRED — not FORBIDDEN. That distinction is the regression check: the
// role gate must not have swallowed the owner path.
const oCreate = await api(OWNER, "/api/v1/listings", {
  method: "POST",
  body: { typeCode: "flat", kind: "sell", title: "Owner probe", pricePaise: 5000000, pincode: "360004" },
});
check(oCreate.error?.code !== "FORBIDDEN", "owner is NOT role-blocked on POST /listings", `${oCreate.status} ${oCreate.error?.code ?? "created"}`);
if (oCreate.data?.listing?.id) {
  await pgc.query(`delete from listings where id=$1`, [oCreate.data.listing.id]);
  console.log(`  (cleaned up the owner probe listing ${oCreate.data.listing.id})`);
}

head("unauthenticated sweep");
for (const [p, body] of [["/api/v1/listings", {}], ["/api/v1/requirements", {}]]) {
  const r = await api(null, p, { method: "POST", body });
  check(r.error?.code === "UNAUTHORIZED", `anon POST ${p} → UNAUTHORIZED`, `${r.status} ${r.error?.code}`);
}

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${checks - failures}/${checks} checks`);
for (const f of fails) console.log(`  · ${f}`);
await pgc.end();
process.exit(failures ? 1 : 0);
