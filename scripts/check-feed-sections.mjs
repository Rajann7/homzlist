/**
 * The carousel home feed (P2 rails) — live sweep.
 *
 * Checks what the SERVER actually returns for the rails, as a guest and as each
 * role, against a direct query of the same database. It encodes the rules the
 * 8 Aug 2026 reorder promised:
 *
 *   1. order        — HomzList top picks → Newly-added properties → Featured
 *                     Developers → Featured Brokers → Featured properties →
 *                     Have a property to sell? → News and Articles, and NO
 *                     per-type rails.
 *   2. auto-hide    — a rail with nothing live in scope produces NO section, and
 *                     a Buy/Rent chip removes the projects rail entirely. The
 *                     sell CTA is the one block that is always present.
 *   3. no limit     — every rail hands back a cursor and the next page differs.
 *   4. real numbers — every subtitle count equals a real count.
 *   5. purity       — Newly-added holds only listings, top picks only projects,
 *                     Featured only boosted rows.
 *
 * Plus: "View all" targets resolve to the SAME set the rail was showing, an
 * unknown section key is refused, the retired `type:` keys still answer for a
 * cached PWA, and own listings never appear in own feed.
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

// ---- 1. the order Rajan specified ----------------------------------------
const SPEC = ["projects", "newly_added", "builders", "brokers", "featured", "sell_cta", "news"];
const keys = guest.map((s) => s.key);
check(
  JSON.stringify(keys) === JSON.stringify(SPEC.filter((k) => keys.includes(k))),
  "rails come back in the specified order (absent ones simply skipped)",
  keys.join(" → "),
);
check(keys.every((k) => SPEC.includes(k)), "no rail outside the seven — the per-type rails are gone",
  keys.filter((k) => !SPEC.includes(k)).join(",") || "none");
check(keys.includes("sell_cta"), "the sell CTA is always present");

const titleOf = (k) => guest.find((s) => s.key === k)?.title;
check(!titleOf("projects") || titleOf("projects") === "HomzList top picks", "top picks title", titleOf("projects"));
check(!titleOf("newly_added") || titleOf("newly_added") === "Newly-added properties", "newly-added title", titleOf("newly_added"));
check(!titleOf("builders") || titleOf("builders") === "Featured Developers", "developers title", titleOf("builders"));
check(!titleOf("brokers") || titleOf("brokers") === "Featured Brokers", "brokers title", titleOf("brokers"));
check(!titleOf("featured") || titleOf("featured") === "Featured properties", "featured title", titleOf("featured"));

// ---- 2 + 4. auto-hide and counts, against the database ---------------------
console.log("\n== Auto-hide and counts (vs the database) ==");
const { count: liveProjects } = await db.from("projects").select("id", { count: "exact", head: true }).eq("status", "live");
const { count: liveListings } = await db.from("listings").select("id", { count: "exact", head: true })
  .eq("status", "live").eq("availability", "available");

const picks = guest.find((s) => s.key === "projects");
check(liveProjects ? picks?.total === liveProjects : !picks, "top picks count == live projects in the DB", `${picks?.total} vs ${liveProjects}`);

const newly = guest.find((s) => s.key === "newly_added");
check(liveListings ? newly?.total === liveListings : !newly, "Newly-added count == live available listings in the DB", `${newly?.total} vs ${liveListings}`);

const { count: livePosts } = await db.from("blog_posts").select("slug", { count: "exact", head: true })
  .eq("status", "published").lte("published_at", new Date().toISOString());
const news = guest.find((s) => s.key === "news");
check(livePosts ? news?.total === livePosts : !news, "News count == published, un-embargoed posts", `${news?.total} vs ${livePosts}`);

// Featured = the boosted set the rail actually hands out.
const featured = guest.find((s) => s.key === "featured");
if (featured) {
  const featuredPage = await railOf(null, "featured");
  check(featuredPage.items.length > 0, "Featured rail returns cards", `${featuredPage.items.length}`);
  check(featuredPage.items.every((i) => i.promoted), "…and EVERY one of them is promoted",
    `${featuredPage.items.filter((i) => !i.promoted).length} organic leaked`);
} else {
  const { count: nBoosts } = await db.from("boost_placements").select("id", { count: "exact", head: true }).eq("status", "active");
  check(true, "no Featured rail (auto-hidden)", `${nBoosts ?? 0} active boost rows in DB`);
}

// ---- 3 + 5. the rails themselves ------------------------------------------
console.log("\n== Rails: purity, exhaustiveness, no limit ==");
if (picks) {
  const p = await railOf(null, "projects");
  check(p.items.length > 0 && p.items.every((i) => i.kind === "project"), "top picks holds only project cards", `${p.items.length} cards`);
  check(p.people.length === 0 && p.posts.length === 0, "…and no people or posts on it");
}
if (newly) {
  const n = await railOf(null, "newly_added");
  check(n.items.length > 0 && n.items.every((i) => i.kind === "property"), "Newly-added holds only property cards", `${n.items.length} cards`);
  // Boosted still ride on top — that rule did not change with the reorder.
  const shape = n.items.map((i) => (i.promoted ? "B" : "l")).join("");
  check(/^B*l*$/.test(shape), "…boosted first, then recency", shape);
}

/** Walk a rail to the end. Returns everything it handed out, in order. */
async function walk(key, pick = (d) => d.items ?? []) {
  const all = []; let cursor = null; let pages = 0;
  do {
    const d = await railOf(null, key, cursor);
    all.push(...pick(d));
    cursor = d.nextCursor; pages++;
  } while (cursor && pages < 25);
  return { all, pages };
}

for (const s of guest.filter((x) => x.key === "projects" || x.key === "newly_added")) {
  const { all } = await walk(s.key);
  const ids = new Set(all.map((i) => i.id));
  check(ids.size === all.length, `${s.key}: no card appears twice across all its pages`, `${all.length - ids.size} dupes`);
  check(ids.size === s.total, `${s.key}: hands out exactly the number it advertises`, `${ids.size} vs ${s.total}`);
}

if (news) {
  const { all } = await walk("news", (d) => d.posts ?? []);
  const slugs = new Set(all.map((p) => p.slug));
  check(slugs.size === all.length, "News: no post appears twice across pages");
  check(slugs.size === news.total, "News: hands out exactly the number it advertises", `${slugs.size} vs ${news.total}`);
  const first = await railOf(null, "news");
  check(first.posts.every((p) => p.title && p.categoryLabel && p.readMinutes >= 0), "…every post carries title, category label and read time");
}

const buildersSection = guest.find((s) => s.key === "builders");
if (buildersSection) {
  const peopleRail = await railOf(null, "builders");
  check(peopleRail.people.length > 0 && peopleRail.items.length === 0, "Featured Developers returns people, not cards", `${peopleRail.people.length}`);
  check(peopleRail.people.every((p) => p.role === "builder"), "…and only builders", [...new Set(peopleRail.people.map((p) => p.role))].join(","));
  check(peopleRail.people.every((p) => p.listingCount > 0), "…every one of them has live inventory (no zero rows)");
  const ranked = [...peopleRail.people].sort((a, b) => b.listingCount - a.listingCount);
  check(JSON.stringify(ranked.map((p) => p.id)) === JSON.stringify(peopleRail.people.map((p) => p.id)), "…ranked by live inventory");
}
const brokersSection = guest.find((s) => s.key === "brokers");
if (brokersSection) {
  const brokersRail = await railOf(null, "brokers");
  check(brokersRail.people.every((p) => p.role === "broker"), "Featured Brokers holds only brokers");
}

// The CTA is answered, not refused — a client that asks gets a clean empty page.
const ctaPage = await railOf(null, "sell_cta");
check(ctaPage && ctaPage.items.length === 0 && ctaPage.posts.length === 0 && ctaPage.nextCursor === null,
  "sell_cta answers with an empty page rather than an error");

// ---- the Buy/Rent chip -----------------------------------------------------
console.log("\n== Buy / Rent chip ==");
const buy = await sections(null, "buy");
check(!buy.some((s) => s.kind === "projects"), "a Buy chip removes the projects rail", buy.map((s) => s.key).join(","));
const buyNewly = buy.find((s) => s.key === "newly_added");
const { count: sellCount } = await db.from("listings").select("id", { count: "exact", head: true })
  .eq("status", "live").eq("availability", "available").eq("kind", "sell");
check(buyNewly?.total === sellCount, "Buy narrows Newly-added to sale rows only", `${buyNewly?.total} vs ${sellCount}`);
const buyItems = (await api(null, "/api/v1/feed/section?key=newly_added&filter=buy")).json?.data?.items ?? [];
check(buyItems.length > 0 && buyItems.every((i) => i.saleLabel === "For Sale"), "…and the cards are all sale rows", `${buyItems.length}`);

const rent = await sections(null, "rent");
check(!rent.some((s) => s.kind === "projects"), "a Rent chip removes the projects rail too");
const rentItems = (await api(null, "/api/v1/feed/section?key=newly_added&filter=rent")).json?.data?.items ?? [];
check(rentItems.length > 0 && rentItems.every((i) => i.saleLabel === "For Rent"), "a Rent rail contains only rentals", `${rentItems.length} cards`);
check(rent.some((s) => s.key === "sell_cta") && rent.some((s) => s.key === "news") === Boolean(livePosts),
  "the CTA and News survive the chip (they are not inventory)");

// ---- View all targets ------------------------------------------------------
console.log("\n== View all goes where the rail promised ==");
if (picks) {
  const vaProjects = await api(null, "/api/v1/search?tab=projects");
  check(vaProjects.json?.data?.total === picks.total, "top picks View all total == rail total", `${vaProjects.json?.data?.total} vs ${picks.total}`);
  check(Boolean(vaProjects.json?.data?.nextCursor), "…and that screen can page to all of them");
}
if (newly) {
  const qs = newly.viewAll.split("?")[1] ?? "";
  const vaProps = await api(null, `/api/v1/search${qs ? `?${qs}` : ""}`);
  check(vaProps.json?.data?.total === newly.total, "Newly-added View all total == rail total", `${vaProps.json?.data?.total} vs ${newly.total}`);
}
if (buildersSection) {
  const vaBuilders = await api(null, "/api/v1/search?tab=brokers&roles=builder");
  check(vaBuilders.json?.data?.total === buildersSection.total, "Featured Developers View all total == rail total",
    `${vaBuilders.json?.data?.total} vs ${buildersSection.total}`);
  check(vaBuilders.json?.data?.items?.length === vaBuilders.json?.data?.total, "…and the list shows all of them, not a slice");
}
check(guest.find((s) => s.key === "sell_cta")?.viewAll === "/create", "the CTA points at the create flow");
check(!news || news.viewAll === "/blog", "News points at the blog");
// "Boosted" is not a search filter, so the Featured rail ships no target rather
// than one that opens a different set from the one its heading counted.
check(!featured || featured.viewAll === "", "Featured ships no View all (nothing to point at that matches it)", featured?.viewAll);
check(guest.every((s) => s.key === "featured" || s.viewAll), "every other rail has a target");

// ---- the empty city widens to ALL INDIA ------------------------------------
// Doc4 §9, changed 9 Aug 2026: a city with nothing live used to fall back to the
// rest of its STATE, which still left a blank feed for a state we have not
// opened. It now falls back to the whole country, and the screen says so.
console.log("\n== A city with no inventory ==");
const { data: emptyRows } = await db.rpc("hz_feed_type_counts", { p_city: null, p_viewer: null, p_filter: "all", p_state: null });
void emptyRows;
const { data: cities } = await db.from("locations").select("id,name").eq("level", "city").limit(400);
let emptyCityRow = null;
for (const c of cities ?? []) {
  const [{ count: l }, { count: p }] = await Promise.all([
    db.from("listings").select("id", { count: "exact", head: true }).eq("status", "live").eq("availability", "available").eq("city_id", c.id),
    db.from("projects").select("id", { count: "exact", head: true }).eq("status", "live").eq("city_id", c.id),
  ]);
  if ((l ?? 0) === 0 && (p ?? 0) === 0) { emptyCityRow = c; break; }
}
if (emptyCityRow) {
  const r = await api(null, `/api/v1/feed/sections?city=${emptyCityRow.id}`);
  const view = r.json?.data;
  check(view?.emptyCity?.cityName === emptyCityRow.name,
    "an empty city reports itself so the screen can say so", `${JSON.stringify(view?.emptyCity)} vs ${emptyCityRow.name}`);
  const wNewly = view?.sections?.find((s) => s.key === "newly_added");
  check(wNewly?.total === liveListings,
    "…and its rails carry the ALL-INDIA count, not one state's", `${wNewly?.total} vs ${liveListings}`);
  check(!/ in /.test(wNewly?.subtitle ?? " in "),
    "…with no place name in the subtitle (the cards come from everywhere)", wNewly?.subtitle);
  const wPage = (await api(null, `/api/v1/feed/section?key=newly_added&city=${emptyCityRow.id}`)).json?.data;
  check((wPage?.items?.length ?? 0) > 0, "…and it hands out real cards rather than an empty feed", `${wPage?.items?.length}`);
  // The whole point: no blank screen. Every rail the empty city gets must be
  // one the un-scoped feed also has.
  const plainKeys = guest.map((s) => s.key).join(",");
  check(view?.sections?.map((s) => s.key).join(",") === plainKeys,
    "…and it gets the same rails an un-scoped visitor gets", view?.sections?.map((s) => s.key).join(","));
} else {
  check(true, "no empty city in this dataset to test the all-India fallback with");
}
const plain = await api(null, "/api/v1/feed/sections");
check(plain.json?.data?.emptyCity === null, "a normal (or city-less) visitor reports no empty city", JSON.stringify(plain.json?.data?.emptyCity));

// ---- validation ------------------------------------------------------------
console.log("\n== Validation ==");
for (const bad of ["type:flat';drop", "../../etc", "unknown", ""]) {
  const r = await api(null, `/api/v1/feed/section?key=${encodeURIComponent(bad)}`);
  check(r.status === 422 || r.json?.error?.code === "VALIDATION_ERROR", `bad key refused: ${bad || "(empty)"}`, r.json?.error?.code ?? r.status);
}
// A PWA on the pre-reorder bundle still asks for these; they must not 422.
const legacy = await api(null, "/api/v1/feed/section?key=type:flat");
check(legacy.status === 200, "a retired type: key still answers (cached PWA compat)", String(legacy.status));

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
  check(mine.length > 0, "sections returned for this role", `${mine.map((s) => s.key).join(",")}`);
  check(mine.every((s) => SPEC.includes(s.key)), "…all within the seven");

  const { data: prof } = await db.from("profiles").select("id,city_id").eq("phone", a.phone).maybeSingle();
  const mineNewly = mine.find((s) => s.key === "newly_added");
  if (mineNewly && prof?.city_id) {
    /**
     * The count under the heading must equal the number of cards the rail hands
     * out — walked, not recomputed. Recomputing it here would mean copying three
     * server rules into the script (own-excluded, not-interested, and the
     * state/All-India boosts that reach in from OTHER cities), and a copy that
     * drifts stops testing anything.
     */
    let cursor = null; const all = []; let pages = 0;
    do {
      const d = await railOf(a.phone, "newly_added", cursor);
      all.push(...(d.items ?? []));
      cursor = d.nextCursor; pages++;
    } while (cursor && pages < 25);
    const ids = new Set(all.map((i) => i.id));
    check(ids.size === mineNewly.total, "Newly-added advertises exactly what it hands out",
      `${mineNewly.total} advertised, ${ids.size} handed out`);

    // Own listings must never appear in one's own feed, in any rail.
    check(all.every((i) => i.poster.id !== prof.id), "own listings excluded from every rail",
      `${all.filter((i) => i.poster.id === prof.id).length} leaked`);

    // "Not interested in this type" is honoured on the cards, not just the count.
    const { data: ni } = await db.from("feed_not_interested").select("type_code").eq("profile_id", prof.id);
    const hiddenTypes = new Set((ni ?? []).map((r) => r.type_code).filter(Boolean));
    if (hiddenTypes.size) {
      check(all.every((i) => !hiddenTypes.has(i.typeCode)), "not-interested types never appear on the rail",
        `hiding ${[...hiddenTypes].join(",")}`);
    }

    // Anything NOT promoted has to be from this viewer's own city — an organic
    // card from elsewhere would mean the scope leaked.
    const { data: cityRows } = await db.from("listings").select("id")
      .eq("city_id", prof.city_id).in("id", [...ids].slice(0, 200));
    const inCity = new Set((cityRows ?? []).map((r) => r.id));
    check(all.every((i) => i.promoted || inCity.has(i.id)), "every organic card is from the viewer's city",
      `${all.filter((i) => !i.promoted && !inCity.has(i.id)).length} out-of-city organic`);
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
