/**
 * Cross-role live sweep. Logs in as an owner, a broker and a builder through the
 * real OTP flow, then walks the screens each role actually sees and prints what
 * the SERVER returned — counts, not "it looked fine". Guest is checked first.
 *
 *   ROLES_BASE=http://localhost:3000 node scripts/check-roles-live.mjs
 *
 * Each actor gets its own forwarded IP so the per-IP OTP cap doesn't end the run
 * (the per-NUMBER cap still applies, exactly as in production).
 */
const BASE = process.env.ROLES_BASE || "http://localhost:3000";

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
const n = (x) => (Array.isArray(x) ? x.length : 0);

console.log(`BASE=${BASE}\n== Guest (public site) ==`);
{
  const feed = await api(null, "/api/v1/feed");
  const items = feed.json?.data?.items ?? [];
  const noPhoto = items.filter((i) => !(i.photos ?? []).length).length;
  check(feed.status === 200 && items.length > 0, "feed returns cards", `${items.length} cards`);
  check(noPhoto === 0, "every card has a real photo", `${noPhoto} without`);
  const proj = items.find((i) => i.kind === "project");
  const prop = items.find((i) => i.kind === "property");
  if (prop) {
    const d = await api(null, `/api/v1/listings/${prop.id}`);
    const l = d.json?.data?.listing;
    check(d.status === 200, "property detail opens for a guest");
    check(n(l?.attributeRows) >= 5, "detail has attribute rows", `${n(l?.attributeRows)} rows`);
    check((l?.amenities ?? []).every((a) => !/_/.test(a)), "amenities render as labels, not codes", (l?.amenities ?? []).slice(0, 3).join(", "));
    check(l?.contact == null, "guest payload carries NO contact number");
  }
  if (proj) {
    const d = await api(null, `/api/v1/projects/${proj.id}`);
    check(d.status === 200, "project detail opens for a guest", d.json?.data?.project?.name);
  }
  const stories = await api(null, "/api/v1/stories");
  check(stories.status === 200 && n(stories.json?.data?.circles) > 0, "story row has circles", `${n(stories.json?.data?.circles)} posters`);
  const req = await api(null, "/api/v1/feed/requirement-mode");
  const rItems = (req.json?.data?.sections ?? []).flatMap((x) => x.cards ?? []);
  check(req.status === 200 && rItems.length > 0, "requirement mode returns cards", `${rItems.length} cards`);
  check(rItems.every((i) => i.access === "locked" && i.budgetLabel === undefined), "guest sees every requirement LOCKED (no budget in payload)");
}

const ACTORS = [
  { role: "owner", phone: "+919824100011", name: "Hiral Desai (owner, Vadodara)" },
  { role: "broker", phone: "+919824100032", name: "Devang Joshi (broker, Ahmedabad)" },
  { role: "builder", phone: "+919999000014", name: "Manish Agarwal (builder, Vadodara)" },
];

for (const a of ACTORS) {
  console.log(`\n== ${a.name} ==`);
  const ok = await login(a.phone);
  check(ok, "login");
  if (!ok) continue;
  const k = a.phone;

  const me = await api(k, "/api/v1/profile/me");
  const p = me.json?.data?.profile;
  check(me.status === 200, "profile loads", `${p?.name} · ${p?.role}`);
  check(p?.stats && typeof p.stats.listings === "number" && typeof p.stats.leads === "number",
    "profile stats are real numbers", JSON.stringify(p?.stats));

  const mine = await api(k, "/api/v1/listings/mine");
  check(mine.status === 200, "my listings endpoint", `${n(mine.json?.data?.items)} listings`);

  const feed = await api(k, "/api/v1/feed");
  const items = feed.json?.data?.items ?? [];
  check(feed.status === 200 && items.length > 0, "home feed", `${items.length} cards`);
  check(!items.some((i) => i.kind === "property" && i.ownerIsMe), "own listings excluded from own feed");

  const rm = await api(k, "/api/v1/feed/requirement-mode");
  const rItems = (rm.json?.data?.sections ?? []).flatMap((x) => x.cards ?? []);
  const unlocked = rItems.filter((i) => i.access === "unlocked").length;
  check(rm.status === 200, "requirement mode", `${rItems.length} cards, ${unlocked} unlocked (plan-gated)`);

  const leads = await api(k, "/api/v1/leads");
  check(leads.status === 200, "leads pipeline", `${n(leads.json?.data?.leads)} leads`);
  const props = await api(k, "/api/v1/proposals/mine");
  check(props.status === 200, "my proposals", `${n(props.json?.data?.proposals)} sent`);
  const visits = await api(k, "/api/v1/visits/mine");
  check(visits.status === 200, "visits", `${n(visits.json?.data?.visits)} visits`);
  

  const dash = await api(k, "/api/v1/feed/builder-dashboard");
  if (a.role === "builder") {
    const d = dash.json?.data;
    check(dash.status === 200, "builder dashboard", `${n(d?.projects)} projects`);
    check(n(d?.projects) > 0, "builder has real projects on the dashboard");
  } else {
    check(dash.status === 403, "non-builder blocked from the builder dashboard", String(dash.status));
  }
}

console.log(fails ? `\n${fails} CHECK(S) FAILED ✗` : "\nALL ROLE CHECKS PASS ✓");
process.exit(fails ? 1 : 0);
