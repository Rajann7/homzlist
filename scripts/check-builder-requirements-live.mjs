/**
 * Builder ↔ requirements live check (migration 0087, 29 Jul 2026).
 *
 * The rule being proven, end to end through the real endpoints and then against
 * the row the database actually holds:
 *
 *   1. `requirement_access` is a real catalog fact — before 0087 the flag lived
 *      nowhere and `hasRequirementAccess()` was false for every paying user.
 *   2. A builder cannot BUY the requirement-only plan: it is absent from their
 *      catalog and both quote and checkout refuse the code.
 *   3. A builder's requirement access comes WITH the ₹9,999 project plan.
 *   4. A builder may send a proposal only while a project of theirs is LIVE.
 *      Take the project down → the same builder is refused, and no proposal
 *      unit is spent finding out.
 *   5. Owner and Broker are untouched by all of the above.
 *
 *   node scripts/check-builder-requirements-live.mjs http://seller.localhost:3000
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
const check = (n, p, d = "") => { results.push({ n, p: !!p }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };

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
      if (!r1.json?.ok) throw new Error(`${label}: otp request ${JSON.stringify(r1.json)}`);
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", { otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456" });
      if (!r2.json?.ok) throw new Error(`${label}: otp verify ${JSON.stringify(r2.json)}`);
      return r2.json.data.user;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. The catalog itself
// ---------------------------------------------------------------------------
const { rows: cat } = await db.query(`select code, roles, requirement_access from plan_catalog order by sort_order`);
console.log("\nplan_catalog:");
console.table(cat);
const p2999 = cat.find((c) => c.code === "p2999");
const p9999 = cat.find((c) => c.code === "p9999");
check("p2999 no longer offered to builders", !p2999.roles.includes("builder"), `roles=${p2999.roles}`);
check("p2999 grants requirement access", p2999.requirement_access === true);
check("p9999 grants requirement access", p9999.requirement_access === true);
check("p999 / top-ups / boosts do NOT", cat.filter((c) => ["p999", "topup10", "boost7", "boost30"].includes(c.code)).every((c) => c.requirement_access === false));

const { rows: snap } = await db.query(
  `select catalog_code, terms->>'requirement_access' ra, count(*)::int n from user_plans group by 1,2 order by 1`);
console.log("\nuser_plans snapshots (backfilled):");
console.table(snap);
check("every paid p2999/p9999 snapshot carries the flag",
  snap.filter((s) => ["p2999", "p9999"].includes(s.catalog_code)).every((s) => s.ra === "true"));

// ---------------------------------------------------------------------------
// 2. Actors
// ---------------------------------------------------------------------------
const { rows: [withProj] } = await db.query(`
  select p.id, p.name, p.phone from profiles p
   where p.role='builder' and p.state='active'
     and exists (select 1 from user_plans u where u.profile_id=p.id and u.status='active' and u.catalog_code='p9999')
     and exists (select 1 from projects x where x.profile_id=p.id and x.status='live')
   limit 1`);
if (!withProj) throw new Error("no builder with an active ₹9,999 plan AND a live project");

const { rows: [noProj] } = await db.query(`
  select p.id, p.name, p.phone from profiles p
   where p.role='builder' and p.state='active'
     and not exists (select 1 from projects x where x.profile_id=p.id and x.status='live')
   limit 1`);
if (!noProj) throw new Error("no builder without a live project");

const { rows: [agent] } = await db.query(`
  select p.id, p.name, p.phone, p.role from profiles p
   where p.role in ('owner','broker') and p.state='active'
     and exists (select 1 from user_plans u where u.profile_id = p.id and u.status='active' and u.catalog_code='p2999')
   limit 1`);

console.log(`\nbuilder WITH live project: ${withProj.name}\nbuilder WITHOUT: ${noProj.name}\nagent: ${agent?.name ?? "(none with p2999)"}\n`);

// A requirement neither of them owns.
const { rows: [reqRow] } = await db.query(`
  select id, profile_id from requirements
   where status='live' and is_active and profile_id not in ($1,$2) order by created_at desc limit 1`,
  [withProj.id, noProj.id]);
if (!reqRow) throw new Error("no live requirement to propose on");

// ---------------------------------------------------------------------------
// 3. Builder WITH a live project
// ---------------------------------------------------------------------------
const bOk = actor("builder-with-project");
await bOk.login(withProj.phone);

const cat1 = await bOk.req("/api/v1/billing/plans");
const codes1 = (cat1.json?.data?.plans ?? cat1.json?.data?.items ?? cat1.json?.data?.catalog ?? []).map((p) => p.code);
check("builder's plan catalog excludes p2999", !codes1.includes("p2999"), `codes=${codes1.join(",")}`);

const q = await bOk.req("/api/v1/billing/quote", "POST", { planId: "p2999" });
check("quote p2999 as builder → 403 FORBIDDEN", q.status === 403 && q.json?.error?.code === "FORBIDDEN", `status=${q.status} ${q.json?.error?.code ?? ""}`);
const co = await bOk.req("/api/v1/billing/checkout", "POST", { planId: "p2999" });
check("checkout p2999 as builder → 403 FORBIDDEN", co.status === 403 && co.json?.error?.code === "FORBIDDEN", `status=${co.status} ${co.json?.error?.code ?? ""}`);
// The ₹9,999 they ARE allowed to buy must still quote, so the 403 above is the
// role gate doing its job and not the endpoint being broken for builders.
const qOk = await bOk.req("/api/v1/billing/quote", "POST", { planId: "p9999" });
check("…while p9999 still quotes for the same builder", qOk.status === 200, `status=${qOk.status} ${qOk.json?.error?.code ?? ""}`);

const br1 = await bOk.req("/api/v1/requirements/browse");
check("builder with ₹9,999 sees UNLOCKED requirements", br1.json?.data?.unlocked === true, `unlocked=${br1.json?.data?.unlocked}`);
check("…and canPropose is true", br1.json?.data?.canPropose === true);

// Clean slate, then send for real.
await db.query(`delete from proposals where requirement_id=$1 and sender_id=$2`, [reqRow.id, withProj.id]);
const send1 = await bOk.req(`/api/v1/requirements/${reqRow.id}/proposals`, "POST", { mode: "chat", message: "0087 check — builder with a live project" });
check("builder WITH a live project can send a proposal", send1.json?.ok === true, `status=${send1.status} ${send1.json?.error?.code ?? ""}`);
const { rows: [prow] } = await db.query(`select id,status,sender_id,mode from proposals where requirement_id=$1 and sender_id=$2`, [reqRow.id, withProj.id]);
check("…and the proposals row exists in the DB", Boolean(prow), prow ? `${prow.id} status=${prow.status}` : "no row");

// ---------------------------------------------------------------------------
// 4. Same builder, project taken DOWN → refused, and no unit spent
// ---------------------------------------------------------------------------
const { rows: liveIds } = await db.query(`select id from projects where profile_id=$1 and status='live'`, [withProj.id]);
await db.query(`delete from proposals where requirement_id=$1 and sender_id=$2`, [reqRow.id, withProj.id]);
await db.query(`update projects set status='hidden' where profile_id=$1 and status='live'`, [withProj.id]);

const usedBefore = (await db.query(`select coalesce(sum(proposal_used),0)::int u from user_plans where profile_id=$1`, [withProj.id])).rows[0].u;
const send2 = await bOk.req(`/api/v1/requirements/${reqRow.id}/proposals`, "POST", { mode: "chat", message: "should be refused" });
check("builder with NO live project → PROJECT_REQUIRED", send2.json?.error?.code === "PROJECT_REQUIRED" && send2.status === 403, `status=${send2.status} code=${send2.json?.error?.code}`);
const usedAfter = (await db.query(`select coalesce(sum(proposal_used),0)::int u from user_plans where profile_id=$1`, [withProj.id])).rows[0].u;
check("…and NO proposal unit was spent", usedBefore === usedAfter, `used ${usedBefore} → ${usedAfter}`);
const { rows: none } = await db.query(`select id from proposals where requirement_id=$1 and sender_id=$2`, [reqRow.id, withProj.id]);
check("…and no proposals row was written", none.length === 0);

const sheet = await bOk.req(`/api/v1/requirements/${reqRow.id}/proposals`);
check("the sheet reports canPropose=false up front", sheet.json?.data?.canPropose === false, `canPropose=${sheet.json?.data?.canPropose}`);

// restore
await db.query(`update projects set status='live' where id = any($1::uuid[])`, [liveIds.map((r) => r.id)]);
const restored = (await db.query(`select count(*)::int n from projects where profile_id=$1 and status='live'`, [withProj.id])).rows[0].n;
check("projects restored to live after the test", restored === liveIds.length, `${restored}/${liveIds.length}`);

// ---------------------------------------------------------------------------
// 5. A builder who never had a project
// ---------------------------------------------------------------------------
const bNo = actor("builder-no-project");
await bNo.login(noProj.phone);
const sheet2 = await bNo.req(`/api/v1/requirements/${reqRow.id}/proposals`);
check("builder who never posted: canPropose=false", sheet2.json?.data?.canPropose === false);
const send3 = await bNo.req(`/api/v1/requirements/${reqRow.id}/proposals`, "POST", { mode: "chat", message: "x" });
check("…and the send is refused", send3.json?.error?.code === "PROJECT_REQUIRED", `code=${send3.json?.error?.code}`);

// ---------------------------------------------------------------------------
// 6. Owner / Broker untouched
// ---------------------------------------------------------------------------
if (agent) {
  const a = actor("agent");
  await a.login(agent.phone);
  const cat2 = await a.req("/api/v1/billing/plans");
  const codes2 = (cat2.json?.data?.plans ?? cat2.json?.data?.items ?? cat2.json?.data?.catalog ?? []).map((p) => p.code);
  check(`${agent.role} still offered p2999`, codes2.includes("p2999"), `codes=${codes2.join(",")}`);
  const br2 = await a.req("/api/v1/requirements/browse");
  check(`${agent.role} with p2999 sees UNLOCKED requirements`, br2.json?.data?.unlocked === true, `unlocked=${br2.json?.data?.unlocked}`);
  check(`${agent.role} canPropose stays true`, br2.json?.data?.canPropose === true);
}

const failed = results.filter((r) => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.n).join(" | ")); process.exitCode = 1; }
await db.end();
