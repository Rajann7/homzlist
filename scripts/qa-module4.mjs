/**
 * Module 4 A-to-Z live verification.
 *
 * Drives the REAL HTTP API as each role and then reads the database back, so a
 * green result means the row actually exists — not that a handler returned 200.
 *
 *   node scripts/qa-module4.mjs
 *
 * Covers: every property type × every role, all listing fields round-tripping,
 * drafts, edit + re-review, the full status machine, requirements, projects,
 * and a security sweep (auth, IDOR, role gates, payload stripping).
 */
import fs from "node:fs";
import pg from "pg";
import { ensureQuota } from "./lib/billing.mjs";
import { connect as dbConnect } from "./lib/dbx.mjs";

// Override when the default dev server is busy (or its in-memory rate-limit
// counters are hot): QA_PORT=38942 npm run qa:module4
const PORT = process.env.QA_PORT ?? "3000";
const BASE = `http://localhost:${PORT}`;
const HOST = `seller.localhost:${PORT}`;

const E = {};
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const sql = await dbConnect();

// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
const failures = [];
const check = (cond, msg) => {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${msg}`);
};
const section = (t) => console.log(`\n${"=".repeat(4)} ${t} ${"=".repeat(4)}`);

async function call(jar, path, opt = {}) {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE + path, {
    ...opt, redirect: "manual",
    headers: { "content-type": "application/json", cookie, ...(opt.headers || {}) },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const p = c.split(";")[0]; const i = p.indexOf("=");
    jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function login(phone) {
  const jar = new Map();
  const r = await call(jar, "/api/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) });
  if (!r.json?.ok) throw new Error(`login blocked for ${phone}: ${JSON.stringify(r.json?.error)}`);
  await call(jar, "/api/v1/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ otpSession: r.json.data.otpSession, code: r.json.data.devCode }),
  });
  const me = await call(jar, "/api/v1/auth/me");
  return {
    jar, phone,
    id: me.json?.data?.user?.id,
    role: me.json?.data?.user?.role,
    cityId: me.json?.data?.user?.cityId,
  };
}

/** Plausible value for any field the config names, so nothing is left blank. */
function valueFor(key, def) {
  if (def?.control === "chips" || def?.control === "select") return def.options?.[0]?.value ?? "yes";
  if (def?.control === "toggle") return true;
  if (def?.control === "area") return 1200;
  if (def?.control === "number") return 3;
  if (/area|sqft|size/.test(key)) return 1200;
  if (/bhk|bath|washroom|balcon|floor|count|units|height/.test(key)) return 3;
  return "Yes";
}

const ACTORS = [
  { phone: "+919999000004", label: "owner" },
  { phone: "+919999000007", label: "broker" },
  { phone: "+919999000014", label: "builder" },
];

const AREA_RAJKOT = "d403feb9-6f66-4b23-846c-669f8ebf6022"; // Mavdi

// ---------------------------------------------------------------------------
section("LOGIN — all three roles");
const actors = {};
for (const a of ACTORS) {
  const s = await login(a.phone);
  actors[a.label] = s;
  check(s.role === a.label, `${a.label} logged in via real OTP (role=${s.role})`);
}

// ---------------------------------------------------------------------------
/**
 * This sweep is re-run constantly, and every run spends quota that never comes
 * back (a requirement consumes on create; submit consumes a listing slot). Left
 * alone, the second run onward fails everything with PLAN_REQUIRED — the plan
 * wall working correctly against an exhausted account, which looks exactly like
 * a broken module. So top the pool up FIRST, by paying through the real
 * checkout + signed-webhook path rather than writing entitlement rows directly.
 *
 * Creating a listing only CHECKS quota (service.ts) — the slot is drawn at
 * submit — so 2 covers the whole per-role sweep plus its one submit.
 */
section("ENTITLEMENTS — top the pool up through the real purchase flow");
for (const [label, s] of Object.entries(actors)) {
  const post = (path, opt) => call(s.jar, path, opt);
  const wantReq = label === "owner" ? 2 : 1; // owner also posts the plot requirement
  const listingLeft = await ensureQuota(BASE, sql, post, s.id, "listing", 2, "qa");
  const reqLeft = await ensureQuota(BASE, sql, post, s.id, "requirement", wantReq, "qa");
  check(listingLeft >= 2, `${label}: ${listingLeft} listing quota available`);
  check(reqLeft >= wantReq, `${label}: ${reqLeft} requirement quota available`);
}

// ---------------------------------------------------------------------------
section("CONFIG — role-filtered property types come from the DB");
const cfgByRole = {};
for (const [label, s] of Object.entries(actors)) {
  const cfg = await call(s.jar, "/api/v1/listings/config");
  const types = cfg.json?.data?.types ?? [];
  cfgByRole[label] = cfg.json?.data;
  check(types.length > 0, `${label} receives ${types.length} property types`);
  const hasPg = types.some((t) => t.code === "pg");
  if (label === "builder") check(!hasPg, "builder is NOT offered PG/Hostel (Doc2 §5.1)");
  else check(hasPg, `${label} IS offered PG/Hostel`);
}

// ---------------------------------------------------------------------------
section("LISTINGS — every property type, every role, all fields round-trip");
const created = []; // { role, code, id }

for (const [label, s] of Object.entries(actors)) {
  const data = cfgByRole[label];
  const defs = data.fieldDefs ?? {};
  for (const t of data.types) {
    const kind = t.kinds.includes("sell") ? "sell" : "rent";
    const attributes = {};
    for (const f of t.fields) attributes[f] = valueFor(f, defs[f]);

    const body = {
      typeCode: t.code, kind,
      title: `${t.label} QA ${label}`,
      description: "Auto-verified listing covering every configured field.",
      pricePaise: kind === "rent" ? 2500000 : 8500000000,
      areaId: AREA_RAJKOT,
      cityId: s.cityId,
      attributes,
      amenities: (data.amenities ?? []).slice(0, 3).map((a) => a.label),
      contactPublic: false,
    };
    const res = await call(s.jar, "/api/v1/listings", { method: "POST", body: JSON.stringify(body) });
    const id = res.json?.data?.listing?.id;
    if (!id) { check(false, `${label} · ${t.code}: create failed (${res.status} ${JSON.stringify(res.json?.error)})`); continue; }
    created.push({ role: label, code: t.code, id, fields: t.fields });

    // DB round-trip: every configured field must actually be stored.
    const { rows: [row] } = await sql.query(`select attributes, kind, type_code, area_label from listings where id=$1`, [id]);
    const missing = t.fields.filter((f) => row.attributes[f] === undefined || row.attributes[f] === null);
    check(missing.length === 0,
      `${label} · ${t.code}: all ${t.fields.length} configured fields stored${missing.length ? ` (missing ${missing.join(",")})` : ""}`);
  }
}

// ---------------------------------------------------------------------------
section("LISTING DETAIL — every stored field is returned to the owner");
for (const c of created.slice(0, 6)) {
  const s = actors[c.role];
  const det = await call(s.jar, `/api/v1/listings/${c.id}`);
  const L = det.json?.data?.listing;
  const shown = Object.keys(L?.attributes ?? {});
  const gap = c.fields.filter((f) => !shown.includes(f));
  check(gap.length === 0, `${c.role} · ${c.code}: detail returns all fields${gap.length ? ` (missing ${gap.join(",")})` : ""}`);
  check(L?.areaLabel != null, `${c.role} · ${c.code}: area label derived server-side (${L?.areaLabel})`);
}

// ---------------------------------------------------------------------------
section("NUMBER RULE — a withheld number is ABSENT, not blanked");
{
  const s = actors.owner;
  const priv = created.find((c) => c.role === "owner");
  const det = await call(s.jar, `/api/v1/listings/${priv.id}`);
  const L = det.json.data.listing;
  check(L.contactPublic === false, "listing created with a private number");
  check(!("contact" in L), "`contact` key is absent from the payload entirely (Doc9 §17)");

  // Another user must not see the owner extras either.
  const other = await call(actors.broker.jar, `/api/v1/listings/${priv.id}`);
  check(other.status === 404 || !other.json?.data?.listing?.owner,
    "another user gets no owner-only block on someone else's draft");
}

// ---------------------------------------------------------------------------
section("DRAFTS — save, list, 3-cap, delete");
{
  const s = actors.owner;
  // Start from a known state so the 3-draft cap is exercised, not inherited.
  await sql.query(`delete from listing_drafts where profile_id=(select id from profiles where phone=$1)`, [s.phone]);
  const ids = [];
  for (let i = 1; i <= 3; i++) {
    const r = await call(s.jar, "/api/v1/listings/drafts", {
      method: "POST", body: JSON.stringify({ payload: { step: i }, title: `QA draft ${i}` }),
    });
    if (r.json?.ok) ids.push(r.json.data.id);
  }
  const list = await call(s.jar, "/api/v1/listings/drafts");
  check((list.json?.data?.items?.length ?? 0) >= 3, `drafts listed (${list.json?.data?.items?.length})`);

  const over = await call(s.jar, "/api/v1/listings/drafts", {
    method: "POST", body: JSON.stringify({ payload: { step: 4 }, title: "QA draft 4" }),
  });
  check(!over.json?.ok, `4th draft refused — 3-draft cap enforced server-side (${over.status})`);

  const del = await call(s.jar, `/api/v1/listings/draft/${ids[0]}`, { method: "DELETE" });
  check(del.json?.ok === true, "draft deleted");

  const idor = await call(actors.broker.jar, `/api/v1/listings/draft/${ids[1]}`, { method: "DELETE" });
  const { rows: [still] } = await sql.query(`select id from listing_drafts where id=$1`, [ids[1]]);
  check(Boolean(still) && idor.status === 404,
    `another user cannot delete someone else's draft — row intact AND 404 (${idor.status})`);
}

// ---------------------------------------------------------------------------
section("EDIT — patch + re-review classification");
{
  const s = actors.broker;
  const c = created.find((x) => x.role === "broker");
  const patch = await call(s.jar, `/api/v1/listings/${c.id}`, {
    method: "PATCH", body: JSON.stringify({ title: "QA edited title", pricePaise: 7500000000 }),
  });
  check(patch.json?.ok === true, `owner can edit their listing (${patch.status})`);
  const { rows: [row] } = await sql.query(`select title, price_paise from listings where id=$1`, [c.id]);
  check(row.title === "QA edited title", `edit persisted to the DB (${row.title})`);
  check(String(row.price_paise) === "7500000000", "price change persisted");

  const idor = await call(actors.owner.jar, `/api/v1/listings/${c.id}`, {
    method: "PATCH", body: JSON.stringify({ title: "hijacked" }),
  });
  const { rows: [after] } = await sql.query(`select title from listings where id=$1`, [c.id]);
  check(after.title !== "hijacked", `another user cannot edit it (${idor.status})`);
}

// ---------------------------------------------------------------------------
section("SUBMIT + STATUS MACHINE — sold / rented / reactivate / still-available");
{
  const s = actors.owner;
  const c = created.find((x) => x.role === "owner" && x.code === "flat");

  // Needs a photo to submit (Doc2 §5.2) — assert the gate, then bypass it in
  // the DB so the rest of the machine can be exercised.
  const early = await call(s.jar, `/api/v1/listings/${c.id}/submit`, { method: "POST" });
  check(!early.json?.ok, `submit blocked with no photos (${early.status})`);

  await sql.query(`update listings set photo_count=1, status='live', live_at=now() where id=$1`, [c.id]);

  const sold = await call(s.jar, `/api/v1/listings/${c.id}/status`, { method: "POST", body: JSON.stringify({ action: "sold" }) });
  check(sold.json?.ok === true, `mark sold accepted (${sold.status})`);
  let { rows: [r1] } = await sql.query(`select status, availability from listings where id=$1`, [c.id]);
  check(r1.availability === "sold", `DB says availability=sold (status=${r1.status})`);

  // `restore` is TRASH-only by design (Doc2 §5.4 · service.ts `case "restore"`):
  // it returns a soft-deleted listing to draft inside the 30-day window. It is
  // NOT the inverse of `sold` — that is `reactivate`, exercised just below. So
  // restore has to be reached the way a real user reaches it: delete, then undo.
  const notFromSold = await call(s.jar, `/api/v1/listings/${c.id}/status`, { method: "POST", body: JSON.stringify({ action: "restore" }) });
  check(!notFromSold.json?.ok, `restore refused on a sold listing — trash-only (${notFromSold.status})`);

  const trashed = await call(s.jar, `/api/v1/listings/${c.id}`, { method: "DELETE" });
  check(trashed.json?.ok === true, `listing moved to trash (${trashed.status})`);
  let { rows: [del] } = await sql.query(`select status, deleted_at from listings where id=$1`, [c.id]);
  check(del.status === "deleted" && del.deleted_at != null, `DB says status=deleted with deleted_at set`);

  const restore = await call(s.jar, `/api/v1/listings/${c.id}/status`, { method: "POST", body: JSON.stringify({ action: "restore" }) });
  check(restore.json?.ok === true, `restore from trash accepted (${restore.status})`);
  ({ rows: [del] } = await sql.query(`select status, deleted_at from listings where id=$1`, [c.id]));
  check(del.status === "draft" && del.deleted_at === null, `DB says restored to draft, deleted_at cleared`);

  await sql.query(`update listings set status='live', availability='rented' where id=$1`, [c.id]);
  const react = await call(s.jar, `/api/v1/listings/${c.id}/status`, { method: "POST", body: JSON.stringify({ action: "reactivate" }) });
  check(react.json?.ok === true, `re-activate a rented listing accepted (${react.status})`);
  ({ rows: [r1] } = await sql.query(`select availability from listings where id=$1`, [c.id]));
  check(r1.availability === "available", `DB says availability=available again`);

  await sql.query(`update listings set status='live' where id=$1`, [c.id]);
  const sa = await call(s.jar, `/api/v1/listings/${c.id}/still-available`, { method: "POST", body: JSON.stringify({ stillAvailable: true }) });
  check(sa.json?.ok === true, `still-available answered (${sa.status})`);

  const idor = await call(actors.builder.jar, `/api/v1/listings/${c.id}/status`, { method: "POST", body: JSON.stringify({ action: "sold" }) });
  check(idor.status === 404, `another user cannot change its status (${idor.status})`);
}

// ---------------------------------------------------------------------------
section("REQUIREMENTS — all three roles");
const reqIds = {};
for (const [label, s] of Object.entries(actors)) {
  const res = await call(s.jar, "/api/v1/requirements", {
    method: "POST",
    body: JSON.stringify({
      kind: label === "builder" ? "sell" : "rent",
      typeCode: "flat", bhk: 3,
      budgetMin: "4000000", budgetMax: "6000000",
      areaIds: [AREA_RAJKOT], urgency: "immediate",
      notes: `QA requirement for ${label}`,
    }),
  });
  const id = res.json?.data?.requirement?.id;
  check(Boolean(id), `${label} can post a requirement (${res.status})`);
  if (id) {
    reqIds[label] = id;
    const { rows: [row] } = await sql.query(
      `select budget_min_paise, budget_max_paise, array_length(area_ids,1) areas, status, expires_at from requirements where id=$1`, [id]);
    check(String(row.budget_min_paise) === "400000000", `${label}: budget stored in paise`);
    check(row.areas === 1, `${label}: preferred areas stored`);
    check(row.expires_at != null, `${label}: 30-day expiry set`);
  }
}

// BHK must be dropped for a plot type even if posted.
{
  const s = actors.owner;
  const res = await call(s.jar, "/api/v1/requirements", {
    method: "POST",
    body: JSON.stringify({ kind: "sell", typeCode: "plot_res", bhk: 4, budgetMax: "9000000", areaIds: [AREA_RAJKOT] }),
  });
  const id = res.json?.data?.requirement?.id;
  if (id) {
    const { rows: [row] } = await sql.query(`select bhk from requirements where id=$1`, [id]);
    check(row.bhk === null, "BHK dropped server-side for a plot requirement");
  } else check(false, `plot requirement create failed (${res.status})`);
}

// ---------------------------------------------------------------------------
section("REQUIREMENT ACCESS — locked payload really is stripped");
{
  const id = reqIds.owner;
  await sql.query(`update requirements set status='live' where id=$1`, [id]);
  const guest = await call(new Map(), `/api/v1/requirements/${id}`);
  const g = guest.json?.data?.requirement;
  check(g?.access === "locked", `guest → access=locked (${g?.access})`);
  check(g?.budgetLabel === undefined, "budget key absent for a locked viewer");
  check(g?.notes === undefined, "notes key absent for a locked viewer");

  const own = await call(actors.owner.jar, `/api/v1/requirements/${id}`);
  check(own.json?.data?.requirement?.access === "own", "poster → access=own");
  check(typeof own.json?.data?.requirement?.budgetLabel === "string", "poster sees the budget");
}

// ---------------------------------------------------------------------------
section("PROJECTS — builder only");
{
  const b = actors.builder;
  const res = await call(b.jar, "/api/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "QA Sweep Towers", reraNumber: "PR/GJ/RAJKOT/2026/QA1",
      buildStatus: "under_construction", possessionDate: "2027-06-01",
      towers: 2, floors: 11, totalUnits: 96, availableUnits: 30,
      bankApprovals: ["SBI"], amenities: ["Gym"],
      cityId: b.cityId, areaId: AREA_RAJKOT, pincode: "360004",
      units: [{ unitType: "2 BHK", areaSqft: 1050, carpetSqft: 880, priceFromPaise: 420000000, unitsAvailable: 9 }],
    }),
  });
  const pid = res.json?.data?.project?.id;
  check(Boolean(pid), `builder can create a project (${res.status})`);

  for (const label of ["owner", "broker"]) {
    const r = await call(actors[label].jar, "/api/v1/projects", {
      method: "POST", body: JSON.stringify({ name: "Nope", reraNumber: "X", cityId: actors[label].cityId }),
    });
    check(r.status === 403, `${label} blocked from projects (${r.status})`);
  }

  if (pid) {
    const { rows: [row] } = await sql.query(
      `select p.pincode, p.slot_id is not null slot, count(u.id)::int units
       from projects p left join project_units u on u.project_id=p.id where p.id=$1 group by p.pincode,p.slot_id`, [pid]);
    check(row.pincode === "360004" && row.slot && row.units === 1, "project row + unit + slot all written");
  }
}

// ---------------------------------------------------------------------------
/**
 * Quota and the thing it bought must never separate (CLAUDE.md "what happens
 * when step 2 of 2 fails"). A consumption with no row behind it means a user
 * was charged for something that does not exist — which is exactly what the
 * dev DB held before migration 0024 added `release_quota` + the compensating
 * catch in createRequirement.
 */
section("QUOTA INTEGRITY — nothing charged for a thing that was never created");
{
  const { rows: stranded } = await sql.query(`
    select pc.id, pr.phone
      from plan_consumptions pc join profiles pr on pr.id = pc.profile_id
     where pc.reverted_at is null
       and pc.ref_type = 'requirement' and pc.ref_id is null
       and not exists (
         select 1 from requirements rq
          where rq.profile_id = pc.profile_id
            and rq.created_at between pc.created_at - interval '1 minute'
                                  and pc.created_at + interval '1 minute')`);
  check(stranded.length === 0,
    `no requirement quota charged without a requirement (${stranded.length} stranded)`);

  // The counters themselves must stay inside the plan's bounds.
  const { rows: overspent } = await sql.query(`
    select id from user_plans
     where (requirement_quota >= 0 and requirement_used > requirement_quota)
        or (listing_quota     >= 0 and listing_used     > listing_quota)`);
  check(overspent.length === 0, `no plan is overspent (${overspent.length})`);

  // release_quota must exist and be denied to the browser roles (Doc9).
  const { rows: [fn] } = await sql.query(`
    select has_function_privilege('anon', 'public.release_quota(uuid,uuid,consumption_kind,integer,text)', 'execute') as anon_can`);
  check(fn.anon_can === false, "release_quota is not executable by anon");
}

// ---------------------------------------------------------------------------
section("SECURITY — unauthenticated sweep");
{
  const anon = new Map();
  const guarded = [
    ["POST", "/api/v1/listings"],
    ["GET", "/api/v1/listings/mine"],
    ["GET", "/api/v1/listings/drafts"],
    ["POST", "/api/v1/requirements"],
    ["GET", "/api/v1/requirements/mine"],
    ["POST", "/api/v1/projects"],
    ["GET", "/api/v1/projects"],
  ];
  for (const [method, path] of guarded) {
    const r = await call(anon, path, method === "GET" ? {} : { method, body: "{}" });
    check(r.status === 401, `anon ${method} ${path} → 401 (${r.status})`);
  }
  // Public-by-design reads must still work without a session.
  const pub = await call(anon, "/api/v1/locations/children?level=state");
  check(pub.status === 200, "location master stays public (guests search before signing in)");
}

section("SECURITY — RLS on every Module 4 table");
{
  const { rows } = await sql.query(`
    select c.relname,
           c.relrowsecurity as rls,
           (select count(*)::int from pg_policies p where p.tablename=c.relname) as policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in
      ('listings','listing_photos','listing_drafts','requirements','projects','project_units','locations','property_types')
    order by c.relname`);
  for (const r of rows) check(r.rls === true, `RLS enabled on ${r.relname} (policies=${r.policies})`);
}

// ---------------------------------------------------------------------------
section("RESULT");
console.log(`\n${pass} passed · ${fail} failed`);
if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); }
await sql.end();
process.exit(fail ? 1 : 0);
