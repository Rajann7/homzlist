/**
 * Live sweep for the profile ⋯ menu modules (Settings, Saved, Activity, Archived).
 * Logs in as an owner, a broker and a builder through the real OTP flow, calls
 * every endpoint the new screens use, and prints what the SERVER returned.
 * Finishes with an IDOR probe: one user tries to touch another user's collection.
 *
 *   MENU_BASE=http://localhost:3000 node scripts/check-profile-menu-live.mjs
 */
const BASE = process.env.MENU_BASE || "http://localhost:3000";

const jar = new Map();
function save(res, key) {
  const set = res.headers.getSetCookie?.() ?? [];
  const cur = jar.get(key) ?? new Map();
  for (const ck of set) { const [pair] = ck.split(";"); const i = pair.indexOf("="); cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  jar.set(key, cur);
}
const cookie = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

let ipN = 80;
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

const ACTORS = [
  { role: "owner", phone: "+919824100011" },
  { role: "broker", phone: "+919824100032" },
  { role: "builder", phone: "+919999000014" },
];

console.log(`BASE=${BASE}\n== Guest (must be 401 everywhere) ==`);
for (const p of ["/api/v1/settings/overview", "/api/v1/settings/prefs", "/api/v1/saved", "/api/v1/activity", "/api/v1/listings/archived"]) {
  const r = await api(null, p);
  check(r.status === 401, `guest ${p}`, String(r.status));
}

const created = [];
for (const a of ACTORS) {
  console.log(`\n== ${a.role} (${a.phone}) ==`);
  const ok = await login(a.phone);
  check(ok, "logged in");
  if (!ok) continue;

  // --- Settings overview: every count must be a real number -----------------
  const ov = await api(a.phone, "/api/v1/settings/overview");
  const d = ov.json?.data;
  check(ov.status === 200 && !!d, "GET /settings/overview", String(ov.status));
  if (d) {
    const c = d.counts ?? {};
    check(
      [c.saved, c.drafts, c.devices, c.blocked].every((n) => Number.isInteger(n)),
      "counts are real integers",
      `saved=${c.saved} drafts=${c.drafts} devices=${c.devices} blocked=${c.blocked}`,
    );
    check(!!d.identity?.phone, "identity from DB", `${d.identity?.name ?? "?"} · ${d.identity?.role ?? "?"} · plan=${d.plan ?? "Free"}`);
    check(typeof d.accountStatus?.label === "string", "account status label", d.accountStatus?.label);
    check(c.devices >= 1, "login devices >= 1 (this session)", String(c.devices));
  }

  // --- Prefs round-trip (persisted, server echoes STORED value) -------------
  const p1 = await api(a.phone, "/api/v1/settings/prefs");
  check(p1.status === 200, "GET /settings/prefs", String(p1.status));
  const before = p1.json?.data?.showLastSeen;
  const p2 = await api(a.phone, "/api/v1/settings/prefs", { method: "PATCH", body: { showLastSeen: !before, locale: "gu" } });
  check(p2.status === 200 && p2.json?.data?.showLastSeen === !before && p2.json?.data?.locale === "gu",
    "PATCH prefs persists", `showLastSeen ${before} -> ${p2.json?.data?.showLastSeen}, locale=${p2.json?.data?.locale}`);
  const p3 = await api(a.phone, "/api/v1/settings/prefs");
  check(p3.json?.data?.showLastSeen === !before && p3.json?.data?.locale === "gu", "re-read matches what was stored");
  // Overview reflects the stored locale (not a hardcoded "English").
  const ov2 = await api(a.phone, "/api/v1/settings/overview");
  check(/Gujarati/.test(ov2.json?.data?.language ?? ""), "overview language reflects stored locale", ov2.json?.data?.language);
  // Restore
  await api(a.phone, "/api/v1/settings/prefs", { method: "PATCH", body: { showLastSeen: before, locale: "en" } });
  // Invalid value must be refused at the boundary.
  const bad = await api(a.phone, "/api/v1/settings/prefs", { method: "PATCH", body: { locale: "xx" } });
  check(bad.status === 422, "invalid locale refused", String(bad.status));

  // --- Saved ----------------------------------------------------------------
  const sv = await api(a.phone, "/api/v1/saved");
  check(sv.status === 200, "GET /saved", `${sv.json?.data?.tiles?.length ?? 0} tiles, ${sv.json?.data?.collections?.length ?? 0} chips`);
  check((sv.json?.data?.collections ?? [])[0]?.name === "All", "All chip present with real count", String((sv.json?.data?.collections ?? [])[0]?.count));
  const mk = await api(a.phone, "/api/v1/saved/collections", { method: "POST", body: { name: `Probe ${a.role}` } });
  check(mk.status === 200 && !!mk.json?.data?.id, "POST /saved/collections", String(mk.status));
  if (mk.json?.data?.id) created.push({ phone: a.phone, id: mk.json.data.id });
  const dup = await api(a.phone, "/api/v1/saved/collections", { method: "POST", body: { name: `Probe ${a.role}` } });
  check(dup.status === 422, "duplicate collection name refused", String(dup.status));

  // --- Activity -------------------------------------------------------------
  const ac = await api(a.phone, "/api/v1/activity");
  const ad = ac.json?.data;
  check(ac.status === 200 && !!ad, "GET /activity", String(ac.status));
  if (ad) check(
    [ad.counts?.saved, ad.counts?.proposals, ad.counts?.visits, ad.counts?.savedSearches].every((n) => Number.isInteger(n)),
    "activity counts are real",
    `saved=${ad.counts?.saved} proposals=${ad.counts?.proposals} visits=${ad.counts?.visits} searches=${ad.counts?.savedSearches} recent=${ad.recentlyViewed?.length ?? 0}`,
  );

  // --- Archived -------------------------------------------------------------
  const ar = await api(a.phone, "/api/v1/listings/archived");
  const items = ar.json?.data?.items ?? [];
  check(ar.status === 200, "GET /listings/archived", `${items.length} archived`);
  const sold = items.filter((i) => i.availability === "sold");
  check(sold.every((i) => i.canReactivate === false), "sold listings are terminal (no Restore)", `${sold.length} sold`);
  const rented = items.filter((i) => i.availability === "rented");
  check(rented.every((i) => i.canReactivate === true), "rented listings can be restored", `${rented.length} rented`);
}

// --- IDOR: user B must not touch user A's collection -------------------------
console.log("\n== IDOR probe ==");
if (created.length >= 2) {
  const [a, b] = created;
  const patch = await api(b.phone, `/api/v1/saved/collections/${a.id}`, { method: "PATCH", body: { name: "hacked" } });
  check(patch.status === 404, "PATCH another user's collection -> 404", String(patch.status));
  const del = await api(b.phone, `/api/v1/saved/collections/${a.id}`, { method: "DELETE" });
  check(del.status === 404, "DELETE another user's collection -> 404", String(del.status));
  const item = await api(b.phone, `/api/v1/saved/items/00000000-0000-0000-0000-000000000000`, { method: "PATCH", body: { collectionId: null } });
  check(item.status === 404, "PATCH a save that isn't yours -> 404", String(item.status));
} else {
  check(false, "IDOR probe needs two collections");
}

// cleanup
for (const c of created) await api(c.phone, `/api/v1/saved/collections/${c.id}`, { method: "DELETE" });

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);
