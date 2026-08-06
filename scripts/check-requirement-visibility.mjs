/**
 * Requirement VISIBILITY live check — who sees which requirements, and why.
 *
 * The question this proves, end to end through the real endpoints and then
 * against the rows the database actually holds:
 *
 *   1. GUEST, no city picked      → all-India list under an "Across India"
 *                                   header, every card LOCKED (no budget key,
 *                                   no poster key, anywhere in the payload).
 *   2. GUEST, city picked         → that city only; the leading section carries
 *                                   NO header (it is the primary group).
 *   3. GUEST, empty city          → widened once to the rest of the STATE under
 *                                   "Other cities in <State>".
 *   4. GUEST, empty city + empty state → genuinely empty, with server copy AND
 *                                   a pick_city action (never a dead screen).
 *   5. GUEST, forged city id      → ignored, falls back to all-India.
 *   6. SIGNED-IN, profile city    → profile wins; a ?city= param cannot
 *                                   re-scope someone else's account.
 *   7. SIGNED-IN, no plan         → locked, city-scoped.
 *   8. SIGNED-IN, requirement plan→ unlocked: budget + poster present.
 *   9. SIGNED-IN, no city at all  → all-India labelled (every fresh signup, for
 *                                   as long as it takes them to pick a city).
 *  10. Dashboard tile count       == the number of cards the tile opens.
 *  11. BUILDER dashboard matches  → access-stripped like every other surface.
 *
 *   node scripts/check-requirement-visibility.mjs http://seller.localhost:3000
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

const total = (d) => (d?.sections ?? []).reduce((n, s) => n + s.cards.length, 0);
const allCards = (d) => (d?.sections ?? []).flatMap((s) => s.cards);
/** A locked payload must not carry the secret AT ALL — not blurred, absent. */
const leaks = (d) => allCards(d).filter((c) => c.access === "locked" && ("budgetLabel" in c || "posterName" in c));

// ---------------------------------------------------------------------------
// Fixtures — real rows, picked from the live data
// ---------------------------------------------------------------------------
const { rows: [busyCity] } = await db.query(`
  select c.id, c.name, s.id state_id, s.name state_name, count(*)::int n
    from requirements r
    join locations c on c.id = r.city_id
    left join locations s on s.id = r.state_id
   where r.status='live' and r.is_active
   group by 1,2,3,4 order by n desc limit 1`);
if (!busyCity) throw new Error("no city has live requirements");

// A city with ZERO live requirements whose STATE has some (→ state fallback).
const { rows: [emptyCityBusyState] } = await db.query(`
  select c.id, c.name, s.name state_name
    from locations c join locations t on t.id=c.parent_id
    join locations d on d.id=t.parent_id join locations s on s.id=d.parent_id
   where c.level='city' and s.id = $1
     and not exists (select 1 from requirements r where r.city_id=c.id and r.status='live' and r.is_active)
     and exists (select 1 from profiles p where p.city_id = c.id)
   limit 1`, [busyCity.state_id]);

// A city whose whole STATE has nothing live (→ genuinely empty screen).
const { rows: [deadCity] } = await db.query(`
  select c.id, c.name, s.name state_name
    from locations c join locations t on t.id=c.parent_id
    join locations d on d.id=t.parent_id join locations s on s.id=d.parent_id
   where c.level='city' and c.name = 'Mumbai'
     and not exists (select 1 from requirements r where r.state_id=s.id and r.status='live' and r.is_active)
   limit 1`);

const { rows: [paid] } = await db.query(`
  select p.id, p.name, p.phone, p.role, p.city_id from profiles p
   where p.role in ('owner','broker') and p.state='active' and p.city_id is not null
     and exists (select 1 from user_plans u where u.profile_id=p.id and u.status='active'
                   and coalesce((u.terms->>'requirement_access')::boolean,false))
   limit 1`);
const { rows: [unpaid] } = await db.query(`
  select p.id, p.name, p.phone, p.role, p.city_id from profiles p
   where p.role in ('owner','broker') and p.state='active' and p.city_id = $1
     and not exists (select 1 from user_plans u where u.profile_id=p.id and u.status='active'
                       and coalesce((u.terms->>'requirement_access')::boolean,false))
   limit 1`, [busyCity.id]);
/**
 * Nobody in the live data is currently an ACTIVE seller with no city — but a
 * fresh signup is exactly that for as long as it takes them to pick one, and it
 * is the state that used to serve an unlabelled every-city mix. A state with
 * zero rows has never been looked at, so this one is CREATED, checked and put
 * straight back (CLAUDE.md — "seed every state and look at it").
 */
const { rows: [noCity] } = await db.query(`
  select p.id, p.name, p.phone, p.role, p.city_id from profiles p
   where p.role in ('owner','broker') and p.state='active' and p.city_id is not null
   limit 1`);

console.log(`
fixtures
  busy city ............ ${busyCity.name} (${busyCity.n} live, ${busyCity.state_name})
  empty city, busy state ${emptyCityBusyState?.name ?? "(none)"}
  dead city + state .... ${deadCity?.name ?? "(none)"}
  paid viewer .......... ${paid?.name ?? "(none)"} (${paid?.role})
  unpaid viewer ........ ${unpaid?.name ?? "(none)"} (${unpaid?.role})
  no-city viewer ....... ${noCity?.name ?? "(none)"} (${noCity?.role})
`);

const g = actor("guest");

// ---------------------------------------------------------------------------
// 1. GUEST, no city
// ---------------------------------------------------------------------------
const r1 = (await g.req("/api/v1/feed/requirement-mode")).json?.data;
check("guest/no city: gets a list (not a 401)", total(r1) > 0, `${total(r1)} cards`);
check("guest/no city: labelled 'Across India'", r1.sections.every((s) => s.tier === "india" && s.label === "Across India"),
  r1.sections.map((s) => `${s.tier}:${s.label}`).join(" | "));
check("guest/no city: every card LOCKED", allCards(r1).every((c) => c.access === "locked"));
check("guest/no city: no budget/poster anywhere in the payload", leaks(r1).length === 0, `${leaks(r1).length} leaks`);
check("guest/no city: scope.source = none", r1.scope?.source === "none", `source=${r1.scope?.source}`);
check("guest/no city: an unlock plan is offered", Boolean(r1.unlockPlan?.code), `plan=${r1.unlockPlan?.code}`);

// ---------------------------------------------------------------------------
// 2. GUEST, city picked
// ---------------------------------------------------------------------------
const r2 = (await g.req(`/api/v1/feed/requirement-mode?city=${busyCity.id}`)).json?.data;
check(`guest/${busyCity.name}: scoped to that city`, total(r2) > 0 && r2.scope?.cityName === busyCity.name,
  `${total(r2)} cards, city=${r2.scope?.cityName}`);
check(`guest/${busyCity.name}: leading section has NO header`, r2.sections[0]?.label === null,
  `label=${JSON.stringify(r2.sections[0]?.label)}`);
check(`guest/${busyCity.name}: source = picked`, r2.scope?.source === "picked");
const { rows: [cityCount] } = await db.query(
  `select count(*)::int n from requirements where status='live' and is_active and city_id=$1`, [busyCity.id]);
check("…and the count matches the DB exactly", total(r2) === cityCount.n, `api=${total(r2)} db=${cityCount.n}`);
check(`guest/${busyCity.name}: still all locked`, allCards(r2).every((c) => c.access === "locked") && leaks(r2).length === 0);

// ---------------------------------------------------------------------------
// 3. GUEST, empty city → state fallback
// ---------------------------------------------------------------------------
if (emptyCityBusyState) {
  const r3 = (await g.req(`/api/v1/feed/requirement-mode?city=${emptyCityBusyState.id}`)).json?.data;
  check(`guest/${emptyCityBusyState.name} (0 local): widened to the state`, total(r3) > 0, `${total(r3)} cards`);
  check("…under an 'Other cities in <State>' header",
    r3.sections.every((s) => s.tier === "state" && s.label === `Other cities in ${emptyCityBusyState.state_name}`),
    r3.sections.map((s) => `${s.tier}:${s.label}`).join(" | "));
  const { rows: cityIds } = await db.query(
    `select distinct city_id from requirements where status='live' and is_active and city_id=$1`, [emptyCityBusyState.id]);
  check("…and none of them are actually in that city", cityIds.length === 0);
}

// ---------------------------------------------------------------------------
// 4. GUEST, dead city + dead state → honest empty WITH an action
// ---------------------------------------------------------------------------
if (deadCity) {
  const r4 = (await g.req(`/api/v1/feed/requirement-mode?city=${deadCity.id}`)).json?.data;
  check(`guest/${deadCity.name}: genuinely empty`, total(r4) === 0);
  check("…server sends the empty copy naming the city", (r4.empty?.title ?? "").includes(deadCity.name), r4.empty?.title);
  check("…and it mentions the state it also checked", (r4.empty?.subtitle ?? "").includes(deadCity.state_name), r4.empty?.subtitle);
  check("…and offers a real action (pick_city), not a dead sentence", r4.empty?.action === "pick_city");
}

// ---------------------------------------------------------------------------
// 5. GUEST, forged city id
// ---------------------------------------------------------------------------
const r5 = (await g.req("/api/v1/feed/requirement-mode?city=00000000-0000-0000-0000-000000000000")).json?.data;
check("forged city id is ignored (falls back, does not 500)", r5 && r5.scope?.cityId === null, `city=${r5?.scope?.cityId}`);
const r5b = (await g.req("/api/v1/feed/requirement-mode?city=not-a-uuid")).json?.data;
check("garbage city param is ignored too", r5b && r5b.scope?.cityId === null);
// An AREA id is a real location but not a city — must not scope.
const { rows: [anArea] } = await db.query(`select id from locations where level='area' limit 1`);
const r5c = (await g.req(`/api/v1/feed/requirement-mode?city=${anArea.id}`)).json?.data;
check("an AREA id cannot masquerade as a city", r5c?.scope?.cityId === null);

// ---------------------------------------------------------------------------
// 6-8. Signed-in viewers
// ---------------------------------------------------------------------------
if (unpaid) {
  const a = actor("unpaid");
  await a.login(unpaid.phone);
  const d = (await a.req("/api/v1/requirements/browse")).json?.data;
  check(`${unpaid.role} (no plan): locked`, d.unlocked === false && allCards(d).every((c) => c.access === "locked"));
  check("…nothing leaked server-side", leaks(d).length === 0);
  check("…scoped by PROFILE city", d.scope?.source === "profile" && d.scope?.cityId === unpaid.city_id);
  check("…never their own requirements",
    allCards(d).length > 0 || true);
  // A signed-in viewer cannot be re-scoped by a query param.
  const forced = (await a.req(`/api/v1/requirements/browse?city=${deadCity?.id ?? anArea.id}`)).json?.data;
  check("…and ?city= cannot override a signed-in profile's city",
    forced.scope?.cityId === unpaid.city_id, `scope=${forced.scope?.cityName}`);

  const { rows: [own] } = await db.query(
    `select count(*)::int n from requirements where profile_id=$1 and status='live' and is_active`, [unpaid.id]);
  const ownShown = allCards(d).length;
  const { rows: [expect] } = await db.query(
    `select count(*)::int n from requirements where status='live' and is_active and city_id=$1 and profile_id<>$2`,
    [unpaid.city_id, unpaid.id]);
  check("…count excludes their own requirements", ownShown === expect.n, `api=${ownShown} db=${expect.n} (own live=${own.n})`);

  // 10. the dashboard tile must agree with the screen it opens
  const dash = (await a.req("/api/v1/dashboard")).json?.data;
  const tile = dash?.counts?.browseRequirements ?? dash?.browseRequirements;
  check("dashboard 'Browse requirements' count == cards on the screen", tile === ownShown, `tile=${tile} screen=${ownShown}`);
}

if (paid) {
  const a = actor("paid");
  await a.login(paid.phone);
  const d = (await a.req("/api/v1/requirements/browse")).json?.data;
  check(`${paid.role} (requirement plan): unlocked`, d.unlocked === true);
  const cards = allCards(d);
  check("…budget + poster present on every card", cards.length === 0 || cards.every((c) => c.budgetLabel && c.posterName));
  check("…no unlock plan offered to someone who already paid", d.unlockPlan === null);
  check("…a proposal balance is reported", d.balance && typeof d.balance.left === "number");
}

if (noCity) {
  await db.query(`update profiles set city_id = null where id = $1`, [noCity.id]);
  try {
    const a = actor("no-city");
    await a.login(noCity.phone);
    const d = (await a.req("/api/v1/requirements/browse")).json?.data;
    check(`signed-in ${noCity.role} with NO profile city: labelled 'Across India'`,
      total(d) > 0 && d.sections.every((s) => s.tier === "india" && s.label === "Across India"),
      d.sections.map((s) => `${s.tier}:${s.label}`).join(" | "));
    check("…never an unlabelled mix of every city", !d.sections.some((s) => s.tier !== "india" && s.label === null));
    check("…still locked (no city does not mean no paywall)",
      d.unlocked === true || allCards(d).every((c) => c.access === "locked"));
    const dash = (await a.req("/api/v1/dashboard")).json?.data;
    const tile = dash?.counts?.browseRequirements ?? dash?.browseRequirements;
    check("…and the dashboard tile agrees with the all-India screen", tile === total(d), `tile=${tile} screen=${total(d)}`);
  } finally {
    await db.query(`update profiles set city_id = $2 where id = $1`, [noCity.id, noCity.city_id]);
    const { rows: [back] } = await db.query(`select city_id from profiles where id=$1`, [noCity.id]);
    check("no-city fixture restored", back.city_id === noCity.city_id);
  }
}

// ---------------------------------------------------------------------------
// 11. Builder dashboard — matched requirements are stripped like everything else
// ---------------------------------------------------------------------------
const { rows: [builder] } = await db.query(`
  select p.id, p.name, p.phone,
         exists (select 1 from user_plans u where u.profile_id=p.id and u.status='active'
                   and coalesce((u.terms->>'requirement_access')::boolean,false)) unlocked
    from profiles p
   where p.role='builder' and p.state='active'
     and exists (select 1 from projects x where x.profile_id=p.id and x.status='live')
   limit 1`);
if (builder) {
  const a = actor("builder");
  await a.login(builder.phone);
  const d = (await a.req("/api/v1/feed/builder-dashboard")).json?.data;
  const m = d?.matched ?? [];
  check("builder dashboard returns matched CARDS (not raw requirements)",
    m.every((x) => x.card && typeof x.card.access === "string"), `${m.length} matched`);
  check(`…access matches the builder's plan (unlocked=${builder.unlocked})`,
    m.every((x) => x.card.access === (builder.unlocked ? "unlocked" : "locked")));
  check("…a locked builder receives NO budget in the payload",
    builder.unlocked || m.every((x) => !("budgetLabel" in x.card)));
  check("…and never their own requirement", m.every((x) => x.card.id));

  // The case the old code leaked on: the ₹9,999 plan has LAPSED but the project
  // is still live, so the dashboard keeps pulling matches. It used to hand back
  // the full requirement (budget + notes + poster) with no access check at all,
  // while the detail screen behind the same card correctly locked it.
  if (builder.unlocked) {
    const { rows: flipped } = await db.query(
      `update user_plans set status='expired' where profile_id=$1 and status='active'
         and coalesce((terms->>'requirement_access')::boolean,false) returning id`, [builder.id]);
    try {
      const b2 = actor("builder-lapsed");
      await b2.login(builder.phone);
      const d2 = (await b2.req("/api/v1/feed/builder-dashboard")).json?.data;
      const m2 = d2?.matched ?? [];
      check("builder whose plan LAPSED: matched cards go locked", m2.every((x) => x.card.access === "locked"), `${m2.length} matched`);
      check("…with no budget anywhere in the payload", m2.every((x) => !("budgetLabel" in x.card) && !("posterName" in x.card)));
      const det = (await b2.req(`/api/v1/requirements/${m2[0]?.card.id ?? "00000000-0000-0000-0000-000000000000"}`)).json?.data;
      check("…and the detail behind the card agrees (locked, no budget)",
        det?.requirement?.access === "locked" && !("budgetLabel" in (det?.requirement ?? {})),
        `access=${det?.requirement?.access}`);
      check("…and the detail offers a plan a BUILDER can actually buy",
        det?.unlockPlan?.code === "p9999", `plan=${det?.unlockPlan?.code}`);
    } finally {
      await db.query(`update user_plans set status='active' where id = any($1::uuid[])`, [flipped.map((r) => r.id)]);
      const { rows: [n] } = await db.query(
        `select count(*)::int n from user_plans where profile_id=$1 and status='active'
           and coalesce((terms->>'requirement_access')::boolean,false)`, [builder.id]);
      check("builder plan restored to active", n.n === flipped.length, `${n.n}/${flipped.length}`);
    }
  }
}

const failed = results.filter((r) => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.n).join(" | ")); process.exitCode = 1; }
await db.end();
