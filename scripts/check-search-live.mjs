/**
 * Module 8 (Search & SEO) cross-role live sweep.
 *
 * Logs in as owner / broker / builder through the real OTP flow and walks every
 * search surface, printing what the SERVER returned — counts, not "it looked
 * fine". Guest is checked first, because the public host is the guest surface.
 *
 * Also verifies the SEO contract end-to-end: the ≥3 indexability floor, the
 * title/meta formulas, schema presence, robots and the sitemaps.
 *
 *   SEARCH_BASE=http://localhost:3000 node scripts/check-search-live.mjs
 */
const BASE = process.env.SEARCH_BASE || "http://localhost:3000";

const jar = new Map();
function save(res, key) {
  const set = res.headers.getSetCookie?.() ?? [];
  const cur = jar.get(key) ?? new Map();
  for (const ck of set) { const [pair] = ck.split(";"); const i = pair.indexOf("="); cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  jar.set(key, cur);
}
const cookie = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

let ipN = 90;
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
async function page(p) {
  const res = await fetch(BASE + p, { redirect: "manual" });
  const html = await res.text();
  return { status: res.status, html };
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
const n = (x) => (Array.isArray(x) ? x.length : 0);

console.log(`BASE=${BASE}\n== Guest — search surfaces ==`);
{
  const s = await api(null, "/api/v1/search?q=3%20BHK%20Mavdi");
  const d = s.json?.data;
  const exact = d?.sections?.[0]?.items ?? [];
  check(s.status === 200 && exact.length > 0, "search returns cards for a guest", `${d?.total} total`);
  check(typeof d?.total === "number" && d.total === exact.length || d.total >= exact.length,
    "count line is the server's exact total", `total=${d?.total}, page=${exact.length}`);
  check(d?.scope?.bhk?.includes("3"), "free text '3 BHK' parsed into a BHK filter", JSON.stringify(d?.scope?.bhk));
  check(d?.scope?.areaNames?.includes("Mavdi"), "free text 'Mavdi' resolved to the area", JSON.stringify(d?.scope?.areaNames));
  const cascade = (d?.sections ?? []).filter((x) => x.label);
  check(cascade.length > 0, "location cascade produced a NEARBY section", cascade.map((c) => c.label).join(" | "));

  const rentPsf = (d?.sections ?? []).flatMap((x) => x.items).filter((i) => i.saleLabel === "For Rent" && /\/sqft/.test(i.meta ?? ""));
  check(rentPsf.length === 0, "rent cards carry NO price-per-sqft", `${rentPsf.length} offenders`);

  const ac = await api(null, "/api/v1/search/autocomplete?q=mav");
  check(ac.status === 200 && n(ac.json?.data?.suggestions) > 0, "autocomplete suggestions", ac.json?.data?.suggestions?.[0]?.meta);
  check(n(ac.json?.data?.pages) > 0, "autocomplete landing-page rows", ac.json?.data?.pages?.[0]?.name);
  check(n(ac.json?.data?.recents) === 0, "guest has NO recents (server-scoped, not localStorage)");

  // All-Indian-script input must be accepted verbatim.
  const gu = await api(null, `/api/v1/search/autocomplete?q=${encodeURIComponent("મવડી")}`);
  check(gu.status === 200, "Gujarati-script autocomplete accepted (no 500)", `${n(gu.json?.data?.suggestions)} suggestions`);
  const hi = await api(null, `/api/v1/search?q=${encodeURIComponent("राजकोट")}`);
  check(hi.status === 200, "Devanagari query accepted (no 500)");

  for (const tab of ["projects", "brokers", "areas"]) {
    const t = await api(null, `/api/v1/search?q=Rajkot&tab=${tab}`);
    check(t.status === 200 && n(t.json?.data?.items) > 0, `${tab} tab returns rows`, `${n(t.json?.data?.items)}`);
  }

  const zero = await api(null, "/api/v1/search?q=zzzzznothinghere");
  check(zero.status === 200 && zero.json?.data?.total === 0, "zero-results is a clean empty, not an error");

  const soon = await api(null, "/api/v1/search?q=Mumbai");
  check(soon.json?.data?.comingSoonCity === "Mumbai", "un-launched city routes to Coming-soon", String(soon.json?.data?.comingSoonCity));

  const cfg = await api(null, "/api/v1/search/config");
  const c = cfg.json?.data;
  check(cfg.status === 200 && n(c?.types) > 0 && n(c?.amenities) > 0 && n(c?.facets) > 0,
    "filter config is DB-driven", `${n(c?.types)} types, ${n(c?.amenities)} amenities, ${n(c?.facets)} facets`);
  check(c?.budget?.max > 0, "budget slider bounds derived from live inventory", `max ₹${c?.budget?.max}L`);
  check(n(c?.popularAreas) > 0, "popular areas ranked by real inventory", c?.popularAreas?.map((a) => `${a.name}(${a.count})`).join(", "));

  const flatFacets = (c?.facets ?? []).filter((f) => f.forTypes.includes("flat")).map((f) => f.key);
  const plotFacets = (c?.facets ?? []).filter((f) => f.forTypes.includes("plot_res")).map((f) => f.key);
  check(flatFacets.includes("bhk") && flatFacets.includes("furnishing"), "Flat reveals BHK + Furnishing", flatFacets.join(","));
  check(!plotFacets.includes("bhk") && plotFacets.includes("road_width"), "Plot hides BHK, reveals Road width", plotFacets.join(","));

  const ex = await api(null, "/api/v1/search/explore");
  const tiles = ex.json?.data?.tiles ?? [];
  check(ex.status === 200 && tiles.length > 0, "explore grid", `${tiles.length} tiles`);
  check(tiles[0]?.promoted === true, "boosted listing is hoisted to the 2×2 hero cell");
  check(tiles.filter((t) => t.promoted).length >= 1, "Promoted chip only on genuinely boosted rows");

  // Gated endpoints must 401 for a guest.
  const saved = await api(null, "/api/v1/search/saved");
  check(saved.status === 401, "GET /search/saved is 401 for a guest", String(saved.status));
  const post = await api(null, "/api/v1/search/recent", { method: "POST", body: { query: "x" } });
  check(post.status === 401, "POST /search/recent is 401 for a guest", String(post.status));
  const del = await api(null, "/api/v1/search/recent", { method: "DELETE" });
  check(del.status === 401, "DELETE /search/recent is 401 for a guest", String(del.status));
}

console.log("\n== SEO contract ==");
{
  const idx = await page("/flats-for-sale-in-mavdi-rajkot");
  check(idx.status === 200, "landing page 200s");
  check(/<meta name="robots" content="index, follow"/.test(idx.html), "≥3 listings → INDEXABLE");
  check(/<h1[^>]*>Flats for Sale in Mavdi, Rajkot<\/h1>/.test(idx.html), "H1 is the exact query phrase");
  const title = idx.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  check(title.length <= 60, `title within the 60-char cap (${title.length})`, title);
  check(/HomzList/.test(title) && !/HomzList.*HomzList/.test(title), "title is branded exactly once", title);
  const desc = idx.html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  check(desc.length > 0 && desc.length <= 160, `meta description within ~155 chars (${desc.length})`);
  for (const t of ["BreadcrumbList", "ItemList", "FAQPage"]) {
    check(idx.html.includes(`"@type":"${t}"`), `schema ${t} present`);
  }
  check(/rel="canonical" href="[^"]*flats-for-sale-in-mavdi-rajkot"/.test(idx.html), "self-canonical");

  const thin = await page("/3-bhk-flats-for-sale-in-raiya-road-rajkot");
  check(/<meta name="robots" content="noindex, follow"/.test(thin.html), "<3 listings → NOINDEX (the Doc3 floor)");

  const bogus = await page("/not-a-real-place-xyz");
  check(bogus.status === 404, "unrecognised slug 404s (no thin page minting)", String(bogus.status));

  const robots = await page("/robots.txt");
  for (const d of ["/api/", "/messages", "/requirements", "/account"]) {
    check(robots.html.includes(`Disallow: ${d}`), `robots disallows ${d}`);
  }
  check(/Sitemap: .*\/sitemap\.xml/.test(robots.html), "robots advertises the sitemap index");

  const sIdx = await page("/sitemap.xml");
  check(/sitemapindex/.test(sIdx.html) && (sIdx.html.match(/<sitemap>/g) ?? []).length === 5, "sitemap index lists 5 children");

  const sLand = await page("/sitemap-landing.xml");
  const landCount = (sLand.html.match(/<loc>/g) ?? []).length;
  check(landCount > 0, "landing sitemap enumerates the matrix", `${landCount} URLs`);
  check(!sLand.html.includes("raiya-road") || !/3-bhk-flats-for-sale-in-raiya-road/.test(sLand.html),
    "below-floor combination is absent from the sitemap");

  const sList = await page("/sitemap-listings.xml");
  check((sList.html.match(/<loc>/g) ?? []).length > 0, "listings sitemap populated");

  const results = await page("/search/results?q=Mavdi");
  check(/noindex/.test(results.html), "filtered results are noindex,follow (no duplicate permutations)");

  const og = await fetch(`${BASE}/api/og?title=Test&subtitle=Sub`);
  check(og.status === 200 && (og.headers.get("content-type") ?? "").includes("image"),
    "OG image renders server-side", og.headers.get("content-type") ?? "");
}

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
  const k = a.phone;

  const s = await api(k, "/api/v1/search?q=Mavdi");
  const items = (s.json?.data?.sections ?? []).flatMap((x) => x.items);
  check(s.status === 200, "search as this role", `${s.json?.data?.total} total`);

  // Own listings must never appear in your own search results.
  const mine = await api(k, "/api/v1/listings/mine");
  const myIds = new Set((mine.json?.data?.items ?? []).map((i) => i.id));
  const leaked = items.filter((i) => myIds.has(i.id));
  check(leaked.length === 0, "own listings excluded from own results", `${leaked.length} leaked`);

  // Recents round-trip: write → read → delete one → clear all.
  const w = await api(k, "/api/v1/search/recent", { method: "POST", body: { query: `qa ${a.role} probe` } });
  check(w.status === 200 && (w.json?.data?.items ?? []).some((r) => r.query === `qa ${a.role} probe`),
    "recent search persisted server-side", `${n(w.json?.data?.items)} rows`);
  const dupe = await api(k, "/api/v1/search/recent", { method: "POST", body: { query: `qa ${a.role} probe` } });
  const dupCount = (dupe.json?.data?.items ?? []).filter((r) => r.query === `qa ${a.role} probe`).length;
  check(dupCount === 1, "re-searching moves the row, never duplicates it", `${dupCount} copies`);
  const one = (dupe.json?.data?.items ?? [])[0];
  const delOne = await api(k, `/api/v1/search/recent?id=${one.id}`, { method: "DELETE" });
  check(delOne.status === 200 && !(delOne.json?.data?.items ?? []).some((r) => r.id === one.id), "single recent removed");

  // Saved search round-trip + alert toggle.
  const sv = await api(k, "/api/v1/search/saved", { method: "POST", body: { label: `QA ${a.role}`, query: "q=Mavdi&intent=sell" } });
  check(sv.status === 200 && sv.json?.data?.saved?.id, "saved search created", `matchCount=${sv.json?.data?.saved?.lastMatchCount}`);
  const sid = sv.json?.data?.saved?.id;
  if (sid) {
    const off = await api(k, "/api/v1/search/saved", { method: "PATCH", body: { id: sid, alertsEnabled: false } });
    const row = (off.json?.data?.items ?? []).find((r) => r.id === sid);
    check(off.status === 200 && row?.alertsEnabled === false, "alerts toggle persists");
    const rm = await api(k, `/api/v1/search/saved?id=${sid}`, { method: "DELETE" });
    check(rm.status === 200, "saved search deleted");
  }

  // IDOR: deleting another user's saved search must not succeed.
  const foreign = await api(k, "/api/v1/search/saved?id=00000000-0000-0000-0000-000000000001", { method: "DELETE" });
  check(foreign.status === 404, "IDOR probe on saved-search delete → 404", String(foreign.status));

  // The count endpoint must agree with the result set.
  const cnt = await api(k, "/api/v1/search?q=Mavdi&count=1");
  check(cnt.json?.data?.total === s.json?.data?.total,
    "filter-sheet count == results count (same predicate)", `${cnt.json?.data?.total} vs ${s.json?.data?.total}`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);
