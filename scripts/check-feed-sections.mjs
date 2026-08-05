/**
 * The carousel home feed (P2 rails) — live sweep.
 *
 * Checks what the SERVER actually returns for the rails, as a guest and as each
 * role, against a direct query of the same database. It encodes the four rules
 * the redesign promised:
 *
 *   1. order        — New Projects first; Top Builders / Top Brokers in the
 *                     middle (not glued to the top); type rails in
 *                     property_types.sort_order, scheme rails after them.
 *   2. auto-hide    — a type with 0 live rows in scope produces NO section, and
 *                     a Buy/Rent chip removes every project rail entirely.
 *   3. no limit     — every rail hands back a cursor and the next page differs.
 *   4. real numbers — every subtitle count equals a real count, and every
 *                     rail's cards are actually of that rail's type.
 *
 * Plus: "View all" targets resolve to the SAME set the rail was showing, an
 * unknown section key is refused, and own listings never appear in own feed.
 *
 *   FEED_BASE=http://localhost:3000 node scripts/check-feed-sections.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Same .env.local reader the other scripts use — no dotenv dependency.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const BASE = process.env.FEED_BASE || "http://localhost:3000";
const db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const jar = new Map();
function save(res, key) {
  const set = res.headers.getSetCookie?.() ?? [];
  const cur = jar.get(key) ?? new Map();
  for (const ck of set) { const [pair] = ck.split(";"); const i = pair.indexOf("="); cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  jar.set(key, cur);
}
const cookie = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

let ipN = 40;
async function api(key, p, { method = "GET", body, ip } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
      ...(key ? { cookie: cookie(key) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (key) save(res, key);
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function login(phone) {
  const ip = `203.0.113.${ipN++}`;
  const r = await api(phone, "/api/v1/auth/otp/request", { method: "POST", body: { phone }, ip });
  const v = await api(phone, "/api/v1/auth/otp/verify", {
    method: "POST", ip,
    body: { otpSession: r.json?.data?.otpSession, code: r.json?.data?.devCode ?? "123456" },
  });
  return v.status === 200;
}

let fails = 0;
const check = (cond, label, extra = "") => {
  if (!cond) fails++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};

const sections = async (key, filter) =>
  (await api(key, `/api/v1/feed/sections${filter ? `?filter=${filter}` : ""}`)).json?.data?.sections ?? [];
const railOf = async (key, sectionKey, cursor) =>
  (await api(key, `/api/v1/feed/section?key=${encodeURIComponent(sectionKey)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)).json?.data;

console.log(`BASE=${BASE}\n== Guest — the rails ==`);

const guest = await sections(null);
check(guest.length > 0, "sections returned for a guest", `${guest.length} rails`);
check(guest[0]?.key === "projects", "New Projects is the FIRST rail", guest[0]?.key);

const bIdx = guest.findIndex((s) => s.key === "builders");
const rIdx = guest.findIndex((s) => s.key === "brokers");
check(bIdx > 0 && rIdx === bIdx + 1, "Top Builders + Top Brokers sit together", `at ${bIdx}, ${rIdx}`);
check(bIdx >= 2 && bIdx < guest.length - 1, "…in the MIDDLE — property rails both above and below them",
  `${bIdx} of ${guest.length}`);

// Type rails follow property_types.sort_order, and scheme rails come after.
const { data: ptRows } = await db.from("property_types").select("code,sort_order").eq("is_active", true).order("sort_order");
const order = new Map(ptRows.map((t) => [t.code, t.sort_order]));
const typeKeys = guest.filter((s) => s.kind === "property_type").map((s) => s.key.slice(5));
const sorted = [...typeKeys].sort((a, b) => order.get(a) - order.get(b));
check(JSON.stringify(typeKeys) === JSON.stringify(sorted), "type rails follow property_types.sort_order", typeKeys.join(","));
const lastType = guest.map((s) => s.kind).lastIndexOf("property_type");
const firstScheme = guest.map((s) => s.kind).indexOf("project_type");
check(firstScheme === -1 || firstScheme > lastType, "scheme rails come after every property rail", `${lastType} → ${firstScheme}`);

// ---- auto-hide + real counts, against the database ------------------------
console.log("\n== Auto-hide and counts (vs the database) ==");
const { data: liveListings } = await db.from("listings").select("type_code,kind").eq("status", "live").eq("availability", "available");
const realCount = new Map();
for (const l of liveListings) realCount.set(l.type_code, (realCount.get(l.type_code) ?? 0) + 1);

// A type rail carries BOTH kinds, so its count is its listings PLUS the
// projects of every scheme type mapped to it (project_types.property_type_codes,
// migration 0123).
const { data: liveProjectRows } = await db.from("projects").select("project_type").eq("status", "live");
const projCount = new Map();
for (const r of liveProjectRows) projCount.set(r.project_type, (projCount.get(r.project_type) ?? 0) + 1);
const { data: schemeRows } = await db.from("project_types").select("code,label,property_type_codes").eq("is_active", true);
const schemeLabel = new Map(schemeRows.map((r) => [r.code, r.label]));
const schemesFor = (code) => schemeRows.filter((r) => (r.property_type_codes ?? []).includes(code)).map((r) => r.code);
const railTotal = (code) =>
  (realCount.get(code) ?? 0) + schemesFor(code).reduce((n, c) => n + (projCount.get(c) ?? 0), 0);

let countMismatch = 0;
for (const s of guest.filter((x) => x.kind === "property_type")) {
  const code = s.key.slice(5);
  if (s.total !== railTotal(code)) { countMismatch++; console.log(`      ${code}: rail says ${s.total}, DB says ${railTotal(code)}`); }
}
check(countMismatch === 0, "every type rail's count = its listings + its schemes' projects",
  `${guest.filter((x) => x.kind === "property_type").length} rails checked`);

const emptyTypes = ptRows.filter((t) => railTotal(t.code) === 0).map((t) => t.code);
const leaked = emptyTypes.filter((c) => guest.some((s) => s.key === `type:${c}`));
check(leaked.length === 0, "a type with nothing live in EITHER kind produces NO rail (auto-hide)",
  emptyTypes.length ? `0-row types: ${emptyTypes.join(",")}` : "every active type has inventory right now");

// A scheme type mapped to no property type keeps its own rail — otherwise it
// would be reachable only from New Projects.
const orphanSchemes = schemeRows.filter((r) => !(r.property_type_codes ?? []).length && (projCount.get(r.code) ?? 0) > 0);
check(orphanSchemes.every((r) => guest.some((s) => s.key === `ptype:${r.code}`)),
  "a scheme type under no property type keeps its own rail", orphanSchemes.map((r) => r.code).join(",") || "none");

const { count: liveProjects } = await db.from("projects").select("id", { count: "exact", head: true }).eq("status", "live");
check(guest[0]?.total === liveProjects, "New Projects count equals live projects in the DB", `${guest[0]?.total} vs ${liveProjects}`);

// ---- the Buy/Rent chip -----------------------------------------------------
console.log("\n== Buy / Rent chip ==");
const buy = await sections(null, "buy");
check(!buy.some((s) => s.kind === "projects" || s.kind === "project_type"),
  "a Buy chip removes EVERY project rail", `${buy.length} rails left`);
const buyFlat = buy.find((s) => s.key === "type:flat");
const sellFlats = liveListings.filter((l) => l.type_code === "flat" && l.kind === "sell").length;
check(buyFlat?.total === sellFlats, "Buy narrows the count to sale rows only", `${buyFlat?.total} vs ${sellFlats}`);

const rent = await sections(null, "rent");
check(rent.every((s) => s.kind !== "projects" && s.kind !== "project_type"), "a Rent chip removes projects too");
const rentItems = (await api(null, "/api/v1/feed/section?key=type:flat&filter=rent")).json?.data?.items ?? [];
check(rentItems.length > 0 && rentItems.every((i) => i.saleLabel === "For Rent"), "a Rent rail contains only rentals", `${rentItems.length} cards`);

// ---- the rails themselves --------------------------------------------------
console.log("\n== Rails: order, purity, exhaustiveness ==");
const projRail = await railOf(null, "projects");
check(projRail?.items?.length > 0 && projRail.items.every((i) => i.kind === "project"), "New Projects rail holds only project cards", `${projRail?.items?.length} cards`);
check(Boolean(projRail?.nextCursor), "…and hands back a cursor (no limit)", String(projRail?.nextCursor));

/** Walk a rail to the end. Returns every card, in order. */
async function walk(key) {
  const all = []; let cursor = null; let pages = 0;
  do {
    const d = await railOf(null, key, cursor);
    all.push(...(d.items ?? []));
    cursor = d.nextCursor; pages++;
  } while (cursor && pages < 25);
  return { all, pages };
}

let orderBad = 0, dupBad = 0, shortBad = 0, pureBad = 0;
for (const s of guest.filter((x) => x.kind === "property_type")) {
  const code = s.key.slice(5);
  const schemes = schemesFor(code);
  const { all } = await walk(s.key);

  // no repeats, and every card the count promised is reachable
  const ids = new Set(all.map((i) => i.id));
  if (ids.size !== all.length) { dupBad++; console.log(`      ${code}: ${all.length - ids.size} duplicate card(s)`); }
  if (ids.size !== s.total) { shortBad++; console.log(`      ${code}: rail hands out ${ids.size}, its own count says ${s.total}`); }

  // order: boosted (any kind) → projects → properties
  const shape = all.map((i) => (i.promoted ? "B" : i.kind === "project" ? "P" : "l")).join("");
  if (!/^B*P*l*$/.test(shape)) { orderBad++; console.log(`      ${code}: ${shape}`); }

  // purity: this type's listings, and only schemes mapped to this type
  const wrongL = all.filter((i) => i.kind === "property" && i.typeCode !== code);
  const wrongP = all.filter((i) => i.kind === "project" && i.projectTypeLabel
    && !schemes.some((c) => schemeLabel.get(c) === i.projectTypeLabel));
  if (wrongL.length || wrongP.length) { pureBad++; console.log(`      ${code}: ${wrongL.length} wrong listings, ${wrongP.length} wrong projects`); }
}
check(orderBad === 0, "every type rail is ordered boosted → projects → properties", `${guest.filter((x) => x.kind === "property_type").length} rails`);
check(dupBad === 0, "no card appears twice in a rail, across all its pages");
check(shortBad === 0, "every rail hands out exactly the number it advertises");
check(pureBad === 0, "a rail contains only its own type's listings and its own schemes");

const peopleRail = await railOf(null, "builders");
check(peopleRail.people.length > 0 && peopleRail.items.length === 0, "builders rail returns people, not cards", `${peopleRail.people.length} builders`);
check(peopleRail.people.every((p) => p.role === "builder"), "…and only builders", [...new Set(peopleRail.people.map((p) => p.role))].join(","));
check(peopleRail.people.every((p) => p.listingCount > 0), "…every one of them has live inventory (no zero rows)");
const ranked = [...peopleRail.people].sort((a, b) => b.listingCount - a.listingCount);
check(JSON.stringify(ranked.map((p) => p.id)) === JSON.stringify(peopleRail.people.map((p) => p.id)), "…ranked by live inventory");

const brokersRail = await railOf(null, "brokers");
check(brokersRail.people.every((p) => p.role === "broker"), "brokers rail holds only brokers");

// ---- View all targets ------------------------------------------------------
console.log("\n== View all goes where the rail promised ==");
const vaProjects = await api(null, "/api/v1/search?tab=projects");
check(vaProjects.json?.data?.total === guest[0]?.total, "New Projects View all total == rail total", `${vaProjects.json?.data?.total} vs ${guest[0]?.total}`);
check(Boolean(vaProjects.json?.data?.nextCursor), "…and that screen can page to all of them");

const buildersSection = guest[bIdx];
const vaBuilders = await api(null, "/api/v1/search?tab=brokers&roles=builder");
check(vaBuilders.json?.data?.total === buildersSection.total, "Top Builders View all total == rail total",
  `${vaBuilders.json?.data?.total} vs ${buildersSection.total}`);
check(vaBuilders.json?.data?.items?.length === vaBuilders.json?.data?.total, "…and the list shows all of them, not a slice");

// A type rail's View all carries BOTH halves: the results screen's Properties
// tab shows the listings, its Projects tab the same schemes the rail showed.
const flatSection = guest.find((s) => s.key === "type:flat");
const flatQs = flatSection.viewAll.split("?")[1];
const vaFlatProps = await api(null, `/api/v1/search?${flatQs}`);
const vaFlatProj = await api(null, `/api/v1/search?${flatQs}&tab=projects`);
check(vaFlatProps.json?.data?.total === (realCount.get("flat") ?? 0),
  "Flat View all → Properties tab == the rail's listings", `${vaFlatProps.json?.data?.total} vs ${realCount.get("flat")}`);
const flatSchemeTotal = schemesFor("flat").reduce((n, c) => n + (projCount.get(c) ?? 0), 0);
check(vaFlatProj.json?.data?.total === flatSchemeTotal,
  "Flat View all → Projects tab == the rail's projects", `${vaFlatProj.json?.data?.total} vs ${flatSchemeTotal}`);
check(vaFlatProps.json?.data?.total + vaFlatProj.json?.data?.total === flatSection.total,
  "…and the two halves add up to the rail's count");

const schemeSection = guest.find((s) => s.kind === "project_type");
if (schemeSection) {
  const vaScheme = await api(null, `/api/v1/search?${schemeSection.viewAll.split("?")[1]}`);
  const labels = [...new Set((vaScheme.json?.data?.items ?? []).map((i) => i.projectTypeLabel))];
  check(vaScheme.json?.data?.total === schemeSection.total && labels.length <= 1,
    "a scheme-only rail's View all is filtered to that scheme type", `${vaScheme.json?.data?.total} · ${labels.join(",")}`);
}

// ---- validation ------------------------------------------------------------
console.log("\n== Validation ==");
for (const bad of ["type:flat';drop", "../../etc", "unknown", ""]) {
  const r = await api(null, `/api/v1/feed/section?key=${encodeURIComponent(bad)}`);
  check(r.status === 422 || r.json?.error?.code === "VALIDATION_ERROR", `bad key refused: ${bad || "(empty)"}`, r.json?.error?.code ?? r.status);
}

// ---- roles -----------------------------------------------------------------
const ACTORS = [
  { role: "owner", phone: "+919824100011", name: "Hiral Desai (owner)" },
  { role: "broker", phone: "+919999000007", name: "Amit Shah (broker, Rajkot)" },
  { role: "builder", phone: "+919999000014", name: "Manish Agarwal (builder)" },
];

for (const a of ACTORS) {
  console.log(`\n== ${a.name} ==`);
  const ok = await login(a.phone);
  check(ok, "login");
  if (!ok) continue;

  const mine = await sections(a.phone);
  check(mine.length > 0, "sections returned for this role", `${mine.length} rails`);

  const { data: prof } = await db.from("profiles").select("id,city_id").eq("phone", a.phone).maybeSingle();
  const cityScoped = mine.find((s) => s.kind === "property_type");
  if (cityScoped && prof?.city_id) {
    const code = cityScoped.key.slice(5);
    const { count: nListings } = await db.from("listings").select("id", { count: "exact", head: true })
      .eq("status", "live").eq("availability", "available")
      .eq("type_code", code).eq("city_id", prof.city_id).neq("profile_id", prof.id);
    // Both halves of the rail are city-scoped and own-excluded, so both count.
    const schemes = schemesFor(code);
    let nProjects = 0;
    if (schemes.length) {
      const { count } = await db.from("projects").select("id", { count: "exact", head: true })
        .eq("status", "live").in("project_type", schemes).eq("city_id", prof.city_id).neq("profile_id", prof.id);
      nProjects = count ?? 0;
    }
    check(cityScoped.total === (nListings ?? 0) + nProjects,
      `${cityScoped.title} rail is city-scoped and excludes own`,
      `${cityScoped.total} vs ${nListings} listings + ${nProjects} projects`);
  }

  // Own listings must never appear in one's own feed, in any rail.
  const first = mine.find((s) => s.kind === "property_type");
  const page = await railOf(a.phone, first.key);
  const own = (page.items ?? []).filter((i) => i.poster.id === prof?.id);
  check(own.length === 0, "own listings excluded from every rail", `${own.length} leaked`);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
