/**
 * ADMIN DATA SEED — every screen in designs/P13-14-15 backed by real rows.
 *
 * The admin panel is not built yet; this fills the database first so that when
 * it is built, no queue, table, tab or chip renders empty. Volumes are set
 * ABOVE what the design's wireframe shows (design shows 12 pending listings —
 * we seed far more), and every enum value the schema allows gets rows, so no
 * status chip or filter tab is a dead end.
 *
 * Interlinked, never orphaned: a payment belongs to a real order for a real
 * user; an invoice to that payment; a boost to that user's real listing; a
 * report to a real listing and a real reporter; a lead to a real chat thread.
 *
 * Repeatable: everything written here is recorded in `seed_ledger` (shared
 * tables) or lives in a table this seed owns outright (admin tables), so a
 * re-run removes exactly its own rows and never touches hand-made data.
 *
 *   npm run seed:admin            # reset + seed
 *   npm run seed:admin -- --keep  # add another batch without resetting
 */
import { connect } from "./lib/dbx.mjs";
import * as D from "./seed-admin/data.mjs";

const BATCH = "admin_v1";
const KEEP = process.argv.includes("--keep");

// Tables this seed owns entirely (admin-only surfaces) — reset clears them.
// Order matters: children before parents.
const OWNED = [
  "cron_runs", "cron_jobs", "health_checks", "queue_depths", "backups",
  "anomaly_events", "admin_notifications", "analytics_events", "platform_daily_stats",
  "city_daily_stats", "funnel_daily", "story_aggregates", "metric_definitions",
  "trash_items", "exports", "reconciliation_items", "reconciliation_runs",
  "ticket_messages", "support_tickets", "canned_responses", "disputes",
  // cms_pages / cms_page_versions / blog_posts belong to Module 12 and are not
  // seeded — they are still cleared so a leftover row from an earlier run goes.
  "cms_page_versions", "cms_pages", "blog_posts", "faqs", "broadcasts",
  "message_templates", "ui_strings", "feature_flags", "rate_limits", "velocity_rules",
  "retention_settings", "boost_rates", "city_caps", "branding_settings",
  "maintenance_settings", "blocklist_words", "number_patterns", "report_actions",
  "admin_notes", "admin_messages", "device_bans", "impersonation_sessions",
  "account_suspensions", "grants", "chargebacks", "review_locks", "reject_templates",
  "admin_saved_views", "admin_audit_log", "staff_sessions", "admin_login_attempts",
];

// Shared tables — pre-existing user data lives here, so deletes go through the
// ledger. Children first.
const SHARED_ORDER = [
  "listing_shares", "saves", "listing_views", "listing_price_history",
  "boost_reviews", "boost_credits", "boost_reminders", "boosts",
  "number_requests", "visits", "leads", "chat_messages", "thread_participants",
  "chat_threads", "inquiries", "proposals", "requirements",
  "moderation_appeals", "moderation_log", "reports", "notifications",
  "invoices", "plan_consumptions", "payments", "coupon_redemptions",
  "listing_slots", "user_plans", "orders", "coupons",
  "listing_photos", "project_photos", "project_units", "listings", "projects",
  "verifications", "area_requests", "feed_banners", "staff", "profiles",
];

const sql = await connect();
const q = (s, p) => sql.query(s, p);
const counts = {};

// ------------------------------------------------------------------- helpers
let _seed = 20260730;
const rnd = () => ((_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pickN = (a, n) => { const c = [...a]; const o = []; while (o.length < n && c.length) o.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return o; };
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p) => rnd() < p;
const NOW = new Date("2026-07-30T10:30:00+05:30");
const daysAgo = (d, h = 0) => new Date(NOW.getTime() - d * 864e5 - h * 36e5);
const hoursAgo = (h) => new Date(NOW.getTime() - h * 36e5);
const dateStr = (d) => d.toISOString().slice(0, 10);

// A jsonb column holding an array must be sent as JSON text, not as a Postgres
// array literal, so every insert consults the real column types once.
const jsonCols = new Map();
async function jsonbOf(table) {
  if (!jsonCols.has(table)) {
    const { rows } = await sql.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name=$1 and udt_name in ('json','jsonb')",
      [table]);
    jsonCols.set(table, new Set(rows.map((r) => r.column_name)));
  }
  return jsonCols.get(table);
}

/** Multi-row insert; returns ids. Records the ids for shared tables. */
async function bulk(table, cols, rows, { shared = false, ret = "id", conflict = "" } = {}) {
  if (!rows.length) return [];
  const jb = await jsonbOf(table);
  const out = [];
  const CH = 400;
  for (let s = 0; s < rows.length; s += CH) {
    const slice = rows.slice(s, s + CH);
    const vals = [];
    const params = [];
    let n = 0;
    for (const r of slice) {
      vals.push(`(${cols.map(() => `$${++n}`).join(",")})`);
      for (const c of cols) {
        const v = r[c];
        const isJson = jb.has(c) ? v !== null && v !== undefined
          : v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v);
        params.push(isJson ? JSON.stringify(v) : v);
      }
    }
    const suffix = ret ? ` returning ${ret}` : "";
    const res = await q(
      `insert into ${table} (${cols.map((c) => `"${c}"`).join(",")}) values ${vals.join(",")} ${conflict}${suffix}`,
      params,
    );
    for (const row of res.rows) out.push(row[ret]);
  }
  counts[table] = (counts[table] || 0) + rows.length;
  if (shared && out.length) {
    const led = [];
    for (const id of out) led.push({ batch: BATCH, table_name: table, row_id: String(id) });
    await bulkLedger(led);
  }
  return out;
}

async function bulkLedger(rows) {
  const CH = 800;
  for (let s = 0; s < rows.length; s += CH) {
    const slice = rows.slice(s, s + CH);
    const vals = [];
    const params = [];
    let n = 0;
    for (const r of slice) {
      vals.push(`($${++n},$${++n},$${++n})`);
      params.push(r.batch, r.table_name, r.row_id);
    }
    await q(`insert into seed_ledger (batch, table_name, row_id) values ${vals.join(",")} on conflict do nothing`, params);
  }
}

async function reset() {
  console.log("reset: clearing previous batch…");
  for (const t of OWNED) await q(`delete from ${t}`);
  // thread_participants has a composite key and is never ledgered — it hangs
  // off the threads this seed created, so it goes first, by parent id.
  await q(
    `delete from thread_participants where thread_id::text in
       (select row_id from seed_ledger where batch=$1 and table_name='chat_threads')`, [BATCH]);
  for (const t of SHARED_ORDER) {
    if (t === "thread_participants") continue;
    const pkCol = t === "staff" ? "profile_id" : "id";
    const r = await q(
      `delete from ${t} where ${pkCol}::text in (select row_id from seed_ledger where batch=$1 and table_name=$2)`,
      [BATCH, t],
    );
    if (r.rowCount) console.log(`  ${t}: -${r.rowCount}`);
  }
  await q("delete from seed_ledger where batch=$1", [BATCH]);
}

// ------------------------------------------------------------- reference data
console.log("loading reference data…");
const { rows: ptypes } = await q("select code,label,category,kinds,field_config from property_types where is_active order by sort_order");
const { rows: prtypes } = await q("select code,label,category,unit_types,field_config from project_types where is_active order by sort_order");
const { rows: fdefs } = await q('select key,label,control,options,units,"group" from field_definitions');
const FD = Object.fromEntries(fdefs.map((f) => [f.key, f]));
const { rows: plans } = await q("select * from plan_catalog order by sort_order");
const PLAN = Object.fromEntries(plans.map((p) => [p.code, p]));
const { rows: amen } = await q("select code from amenities where is_active");
const AMEN = amen.map((a) => a.code);
const { rows: photoRows } = await q(
  "select distinct storage_key, url from listing_photos where storage_key like 'demo/%' order by storage_key",
);
const PHOTOS = {};
for (const p of photoRows) {
  const cat = p.storage_key.replace("demo/", "").replace(/-\d+\.jpg$/, "");
  (PHOTOS[cat] ||= []).push(p);
}
const PHOTO_CATS = Object.keys(PHOTOS);
if (!PHOTO_CATS.length) throw new Error("no demo photos found — run npm run seed:demo first");

// Location chain for the cities we use.
// The imported location master nests city under taluka under district under
// state, and several city names repeat across India — so each candidate is
// resolved by walking its own chain and keeping the Gujarat one with areas.
const chainCache = new Map();
async function chainOf(cityId) {
  if (chainCache.has(cityId)) return chainCache.get(cityId);
  const { rows } = await q(
    `with recursive up as (
       select id, parent_id, level, name from locations where id=$1
       union all select l.id, l.parent_id, l.level, l.name from locations l join up on l.id=up.parent_id)
     select id, level, name from up`, [cityId]);
  const c = {};
  for (const r of rows) { c[r.level] = r.id; c[`${r.level}_name`] = r.name; }
  const { rows: areas } = await q("select id, name from locations where parent_id=$1 and level='area' order by name", [cityId]);
  c.areas = areas.length ? areas : [{ id: null, name: c.city_name ?? "City" }];
  chainCache.set(cityId, c);
  return c;
}

const { rows: cityRows } = await q(
  "select id, name from locations where level='city' and name = any($1) order by name", [D.CITY_NAMES]);
const CITY = {};
for (const c of cityRows) {
  const ch = await chainOf(c.id);
  if (ch.state_name !== "Gujarat") { chainCache.delete(c.id); continue; }
  const prev = CITY[c.name] ? chainCache.get(CITY[c.name]) : null;
  if (!prev || ch.areas.length > prev.areas.length) CITY[c.name] = c.id;
}
const CITY_LIST = Object.entries(CITY).map(([name, id]) => ({ name, id }));
if (!CITY.Rajkot) throw new Error("Rajkot city row not found");

// ------------------------------------------------------------------ run reset
if (!KEEP) await reset();

// ============================================================== 1. STAFF + USERS
console.log("seeding profiles + staff…");

const usedPhones = new Set(
  (await q("select phone from profiles")).rows.map((r) => r.phone),
);
let phoneSeq = 10000;
function newPhone() {
  for (;;) {
    const p = `+9198${String(250000 + phoneSeq++).slice(0, 6)}${String(int(10, 99))}`;
    if (!usedPhones.has(p)) { usedPhones.add(p); return p; }
  }
}
const usedNames = new Set();
function personName() {
  for (let i = 0; i < 200; i++) {
    const n = `${pick(D.FIRST)} ${pick(D.LAST)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  return `${pick(D.FIRST)} ${pick(D.LAST)} ${int(1, 99)}`;
}
const usedUser = new Set((await q("select username from profiles where username is not null")).rows.map((r) => r.username));
function handle(name) {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "user";
  let u = base, i = 1;
  while (usedUser.has(u)) u = `${base}${++i}`;
  usedUser.add(u);
  return u;
}

// --- staff (data only; no Google whitelist is created — that comes with the
// admin build, when the real admin emails are known).
const STAFF_DEF = [
  ["Priya Shah", "priya@homzlist.com", "super", 0, true],
  ["Rajan Kavathiya", "rajan@homzlist.com", "super", 0, false],
  ["Amit Joshi", "amit@homzlist.com", "admin", 205, false],
  ["Kavita Rao", "kavita@homzlist.com", "staff", 205, true],
  ["Rohit Mehta", "rohit@homzlist.com", "staff", 12, false],
  ["Nidhi Trivedi", "nidhi@homzlist.com", "staff", 3, false],
];
const staffProfileRows = STAFF_DEF.map(([name]) => ({
  phone: newPhone(), role: null, name, username: handle(name),
  email: `${name.split(" ")[0].toLowerCase()}@homzlist.com`,
  city_id: CITY.Rajkot, is_registered: true, state: "active",
  created_at: daysAgo(210), updated_at: NOW, last_active_at: hoursAgo(int(0, 40)),
}));
const staffIds = await bulk("profiles",
  ["phone", "role", "name", "username", "email", "city_id", "is_registered", "state", "created_at", "updated_at", "last_active_at"],
  staffProfileRows, { shared: true });

await bulk("staff",
  ["profile_id", "level", "is_active", "email", "display_name", "added_by", "invited_at", "last_login_at", "is_online", "state", "created_at"],
  STAFF_DEF.map(([name, email, level, ago, online], i) => ({
    profile_id: staffIds[i], level, is_active: name !== "Nidhi Trivedi",
    email, display_name: name,
    added_by: i < 2 ? null : staffIds[level === "admin" ? 0 : i === 4 ? 2 : 0],
    invited_at: daysAgo(ago || 1),
    last_login_at: name === "Nidhi Trivedi" ? null : online ? hoursAgo(0) : hoursAgo(int(2, 60)),
    is_online: !!online, state: name === "Nidhi Trivedi" ? "pending" : "active",
    created_at: daysAgo(ago || 1),
  })), { shared: true, ret: "profile_id" });
const S = Object.fromEntries(STAFF_DEF.map(([name], i) => [name, staffIds[i]]));
const staffByName = STAFF_DEF.map(([name, , level], i) => ({ id: staffIds[i], name, level }));
const actingStaff = staffByName.filter((s) => s.name !== "Nidhi Trivedi");

await bulk("staff_sessions", ["staff_id", "started_at", "last_seen_at", "ended_at", "ip", "device"],
  actingStaff.flatMap((s) => [0, 1, 2].map((k) => ({
    staff_id: s.id, started_at: hoursAgo(k * 26 + 3), last_seen_at: hoursAgo(k * 26 + 1),
    ended_at: k === 0 ? null : hoursAgo(k * 26 + 1), ip: pick(["103.21.44.12", "49.36.180.55", "27.109.12.9"]),
    device: pick(["Chrome/Mac", "Chrome/Windows", "Safari/iPhone", "Chrome/Android"]),
  }))));

await bulk("admin_login_attempts", ["email", "success", "reason", "ip", "device", "created_at"], [
  ...actingStaff.flatMap((s) => [0, 1].map((k) => ({
    email: `${s.name.split(" ")[0].toLowerCase()}@homzlist.com`, success: true, reason: null,
    ip: "103.21.44.12", device: "Chrome/Mac", created_at: hoursAgo(k * 20 + 2),
  }))),
  ...Array.from({ length: 7 }, (_, i) => ({
    email: pick(["unknown@gmail.com", "test.admin@gmail.com", "hacker99@yandex.com"]),
    success: false, reason: "email not whitelisted",
    ip: pick(["45.129.14.7", "185.220.101.4"]), device: "Chrome/Linux", created_at: hoursAgo(i + 1),
  })),
]);

// --- users
const USER_PLAN_N = 160;
const userRows = [];
const userMeta = [];
for (let i = 0; i < USER_PLAN_N; i++) {
  // Role and account state are drawn from independent cycles so that every
  // state exists for every role — otherwise "suspended" would only ever be a
  // builder and the Users filters would look broken.
  const r10 = i % 10;
  const role = r10 < 5 ? "owner" : r10 < 8 ? "broker" : "builder";
  const cityPick = i % 5 === 0 ? pick(CITY_LIST) : { name: "Rajkot", id: CITY.Rajkot };
  const name = role === "broker" && chance(0.75) ? pick(D.BROKER_FIRMS) + (chance(0.35) ? ` ${int(2, 9)}` : "")
    : role === "builder" ? pick(D.BUILDER_FIRMS) + (chance(0.4) ? ` ${["Group", "Infra", "Developers"][int(0, 2)]}` : "")
      : personName();
  // account states — every value the enum allows gets real rows, spread across
  // all three roles
  const s23 = i % 23;
  const state = s23 === 3 ? "suspended" : s23 === 8 ? "deactivated" : s23 === 14 ? "deleted"
    : s23 === 19 ? "archived" : "active";
  const isNew = i >= USER_PLAN_N - 18;
  const created = isNew ? hoursAgo(int(1, 140)) : daysAgo(int(8, 620));
  const deleted = state === "deleted";
  userRows.push({
    phone: newPhone(), role, name: deleted ? "Deleted user" : name,
    username: handle(name), email: chance(0.45) ? `${handle(name)}@gmail.com` : null,
    city_id: cityPick.id, is_registered: true, state,
    bio: deleted ? null : role === "owner"
      ? pick(["Owner — direct deal, no brokerage.", "Family property, genuine buyers only.", "Selling my own flat.", null])
      : role === "broker"
        ? `Property consultant in ${cityPick.name}. ${int(4, 22)} years in the market.`
        : `${pick(["RERA registered developer", "Building homes since", "Trusted developer"])} ${int(1998, 2016)}.`,
    company_logo_url: role === "builder" ? pick(PHOTOS.exterior).url : null,
    established_year: role === "builder" ? int(1995, 2018) : null,
    projects_done: role === "builder" ? int(2, 34) : null,
    office_address: role !== "owner" ? `${int(101, 812)}, ${pick(["Shivalik Complex", "Star Plaza", "Madhav Plaza", "Empire Business Hub"])}, ${pick(D.RAJKOT_AREAS)}, ${cityPick.name}` : null,
    areas_covered: role !== "owner" ? pickN(D.RAJKOT_AREAS, int(3, 7)) : null,
    response_label: chance(0.6) ? pick(["Usually replies within an hour", "Usually replies in a few hours", "Replies within a day"]) : null,
    photo_url: deleted ? null : chance(0.55) ? pick(PHOTOS[pick(PHOTO_CATS)]).url : null,
    created_at: created, updated_at: created, last_active_at: hoursAgo(int(0, 400)),
  });
  userMeta.push({ role, city: cityPick, state, isNew, created, name });
}
const userIds = await bulk("profiles",
  ["phone", "role", "name", "username", "email", "city_id", "is_registered", "state", "bio",
    "company_logo_url", "established_year", "projects_done", "office_address", "areas_covered",
    "response_label", "photo_url", "created_at", "updated_at", "last_active_at"],
  userRows, { shared: true });
const users = userIds.map((id, i) => ({ id, ...userMeta[i], phone: userRows[i].phone }));
const owners = users.filter((u) => u.role === "owner");
const brokers = users.filter((u) => u.role === "broker");
const builders = users.filter((u) => u.role === "builder");
const activeUsers = users.filter((u) => u.state === "active");
const posters = users.filter((u) => u.state !== "deleted");

// ============================================================ 2. VERIFICATIONS
console.log("seeding verifications…");
const verifRows = [];
for (const u of users) {
  if (u.state === "deleted") continue;
  verifRows.push({
    profile_id: u.id, level: "phone", status: "approved", doc_type: null,
    submitted_at: u.created, reviewed_at: u.created, created_at: u.created, updated_at: u.created,
  });
  if (chance(0.55)) {
    const st = pick(["approved", "approved", "approved", "pending", "rejected", "revoked"]);
    verifRows.push({
      profile_id: u.id, level: "id", status: st,
      doc_type: pick(["aadhaar", "pan", "driving_licence", "voter_id"]),
      doc_key: `private-docs/id/${u.id}.jpg`,
      reason: st === "rejected" ? pick(["Document blurred", "Name mismatch with profile", "Expired document"])
        : st === "revoked" ? "Document found forged after report" : null,
      valid_till: st === "approved" ? dateStr(daysAgo(-int(120, 900))) : null,
      submitted_at: daysAgo(int(5, 300)), reviewed_at: st === "pending" ? null : daysAgo(int(1, 290)),
      created_at: daysAgo(int(5, 300)), updated_at: daysAgo(int(1, 290)),
    });
  }
  if ((u.role === "builder" || (u.role === "broker" && chance(0.4))) && chance(0.85)) {
    const st = pick(["approved", "approved", "pending", "rejected", "revoked"]);
    verifRows.push({
      profile_id: u.id, level: "rera", status: st,
      doc_type: "rera_certificate", doc_key: `private-docs/rera/${u.id}.pdf`,
      rera_number: `PR/GJ/RAJKOT/RAJKOT/Others/${pick(["MAA", "RAA", "AA"])}${int(10000, 99999)}/${int(1, 4)}`,
      reason: st === "rejected" ? "RERA number not found in the state registry" : st === "revoked" ? "Registration lapsed" : null,
      valid_till: st === "approved" ? dateStr(daysAgo(-int(200, 1200))) : null,
      submitted_at: daysAgo(int(10, 400)), reviewed_at: st === "pending" ? null : daysAgo(int(2, 380)),
      created_at: daysAgo(int(10, 400)), updated_at: daysAgo(int(2, 380)),
    });
  }
}
await bulk("verifications",
  ["profile_id", "level", "status", "doc_type", "doc_key", "rera_number", "reason", "valid_till", "submitted_at", "reviewed_at", "created_at", "updated_at"],
  verifRows.map((r) => ({ doc_key: null, rera_number: null, reason: null, valid_till: null, ...r })), { shared: true });

// =================================================== 3. COUPONS / ORDERS / MONEY
console.log("seeding billing…");
const COUPONS = [
  ["RAJKOT50", "percent", 50, 50000, 0, "plans", 1, 500],
  ["FIRST999", "flat", 20000, null, 99900, "plans", 1, 1000],
  ["BOOST20", "percent", 20, 30000, 0, "boosts", 2, 300],
  ["WELCOME10", "percent", 10, 20000, 0, "both", 1, 2000],
  ["BUILDER1K", "flat", 100000, null, 999900, "plans", 1, 100],
  ["DIWALI26", "percent", 25, 100000, 0, "both", 1, 5000],
  ["BROKER500", "flat", 50000, null, 299900, "plans", 1, 400],
  ["RENEW15", "percent", 15, 45000, 0, "plans", 3, 800],
  ["TOPUP100", "flat", 10000, null, 49900, "plans", 5, 600],
  ["EXPIRED22", "percent", 30, 50000, 0, "both", 1, 200],
  ["FULLUSED", "flat", 15000, null, 0, "both", 1, 5],
  ["STAFFTEST", "percent", 100, null, 0, "both", 1, 20],
];
const couponIds = await bulk("coupons",
  ["code", "discount_type", "discount_value", "max_discount_paise", "min_value_paise", "applies_to", "per_user_limit", "usage_cap", "used_count", "expires_at", "is_active", "created_at"],
  COUPONS.map(([code, dt, dv, maxd, minv, scope, perUser, cap], i) => ({
    code, discount_type: dt, discount_value: dv, max_discount_paise: maxd, min_value_paise: minv,
    applies_to: scope, per_user_limit: perUser, usage_cap: cap,
    used_count: code === "FULLUSED" ? 5 : int(0, Math.min(cap - 1, 140)),
    expires_at: code === "EXPIRED22" ? daysAgo(120) : daysAgo(-int(20, 300)),
    is_active: code !== "EXPIRED22" && code !== "FULLUSED",
    created_at: daysAgo(int(30, 400)),
  })), { shared: true });
const coupons = COUPONS.map(([code, dt, dv, maxd, minv, scope], i) => ({ id: couponIds[i], code, dt, dv, maxd, minv, scope }));

const GST_BPS = 1800;
function money(base, discount) {
  const taxable = Math.max(0, base - discount);
  const gst = Math.round((taxable * GST_BPS) / 10000);
  return { base, discount, taxable, cgst: Math.round(gst / 2), sgst: gst - Math.round(gst / 2), igst: 0, total: taxable + gst };
}

const ORDER_N = 380;
const orderRows = [];
const orderMeta = [];
for (let i = 0; i < ORDER_N; i++) {
  const u = pick(posters);
  const code = u.role === "builder" ? pick(["p9999", "p9999", "boost30", "boost7", "topup10"])
    : u.role === "broker" ? pick(["p999", "p999", "p2999", "topup10", "boost7", "boost30"])
      : pick(["p999", "p999", "p999", "p2999", "boost7", "topup10"]);
  const plan = PLAN[code];
  const useCoupon = chance(0.22);
  const cpn = useCoupon ? pick(coupons.filter((c) => c.scope === "both" || c.scope === (plan.kind === "boost" ? "boosts" : "plans"))) : null;
  const base = Number(plan.price_paise);
  let disc = 0;
  if (cpn) disc = cpn.dt === "percent" ? Math.min(Math.round((base * cpn.dv) / 100), cpn.maxd ?? 1e9) : Math.min(cpn.dv, base);
  const m = money(base, disc);
  // status spread — every order_status value gets rows
  const roll = rnd();
  const status = roll < 0.66 ? "paid" : roll < 0.74 ? "pending" : roll < 0.85 ? "failed"
    : roll < 0.9 ? "created" : roll < 0.95 ? "expired" : "refunded";
  const created = daysAgo(int(0, 180), int(0, 23));
  orderRows.push({
    profile_id: u.id, kind: plan.kind, catalog_code: code,
    terms_snapshot: {
      name: plan.name, price_paise: base, listing_quota: plan.listing_quota,
      requirement_quota: plan.requirement_quota, proposal_quota: plan.proposal_quota,
      project_quota: plan.project_quota, period_days: plan.period_days,
    },
    base_paise: m.base, discount_paise: m.discount, taxable_paise: m.taxable,
    cgst_paise: m.cgst, sgst_paise: m.sgst, igst_paise: m.igst, total_paise: m.total,
    currency: "INR", coupon_id: cpn?.id ?? null, coupon_code: cpn?.code ?? null,
    gstin: chance(0.12) ? `24${pick(["AABCU", "AAECS", "AADCR"])}${int(1000, 9999)}${pick(["A", "B"])}1Z${int(1, 9)}` : null,
    place_of_supply: "GJ",
    razorpay_order_id: `order_R${Math.random().toString(36).slice(2, 16).toUpperCase()}`,
    status, idempotency_key: `seed-${BATCH}-${i}`,
    boost_request: plan.kind === "boost" ? { targeting: pick(["area", "city", "search"]), days: plan.period_days } : null,
    created_at: created, updated_at: created,
  });
  orderMeta.push({ u, code, plan, status, m, cpn, created });
}
const orderIds = await bulk("orders",
  ["profile_id", "kind", "catalog_code", "terms_snapshot", "base_paise", "discount_paise", "taxable_paise",
    "cgst_paise", "sgst_paise", "igst_paise", "total_paise", "currency", "coupon_id", "coupon_code",
    "gstin", "place_of_supply", "razorpay_order_id", "status", "idempotency_key", "boost_request", "created_at", "updated_at"],
  orderRows, { shared: true });
const orders = orderIds.map((id, i) => ({ id, ...orderMeta[i], rzp: orderRows[i].razorpay_order_id }));

// coupon redemptions for the paid orders that used one
await bulk("coupon_redemptions", ["coupon_id", "profile_id", "order_id", "created_at"],
  orders.filter((o) => o.cpn && o.status === "paid")
    .map((o) => ({ coupon_id: o.cpn.id, profile_id: o.u.id, order_id: o.id, created_at: o.created })),
  { shared: true });

// payments — one per non-created order, with the full status spread
const payRows = [];
const payMeta = [];
for (const o of orders) {
  if (o.status === "created") continue;
  const st = o.status === "paid" ? "success" : o.status === "pending" ? "pending"
    : o.status === "failed" ? "failed" : o.status === "refunded" ? "refunded" : "failed";
  const method = pick(["upi", "card", "netbanking", "wallet"]);
  const detail = method === "upi" ? pick(["GPay", "PhonePe", "Paytm", "BHIM"])
    : method === "card" ? pick(["HDFC", "ICICI", "Axis", "SBI", "Kotak"])
      : method === "netbanking" ? pick(["HDFC", "BOB", "SBI"]) : "Amazon Pay";
  payRows.push({
    order_id: o.id, profile_id: o.u.id,
    razorpay_payment_id: `pay_R${Math.random().toString(36).slice(2, 16).toUpperCase()}`,
    status: st, method, method_detail: detail, amount_paise: o.m.total, currency: "INR",
    failure_reason: st === "failed" ? pick(["Insufficient funds", "Payment declined by bank", "3DS authentication failed", "UPI collect expired"]) : null,
    refund_id: st === "refunded" ? `rfnd_R${Math.random().toString(36).slice(2, 14).toUpperCase()}` : null,
    refund_reason: st === "refunded" ? pick(["Boost rejected — auto refund", "Service could not be delivered", "Duplicate payment", "Approved by admin on ticket"]) : null,
    refunded_at: st === "refunded" ? new Date(o.created.getTime() + 2 * 864e5) : null,
    captured_at: st === "success" ? o.created : null,
    created_at: o.created, updated_at: o.created,
  });
  payMeta.push({ o, st });
}
const payIds = await bulk("payments",
  ["order_id", "profile_id", "razorpay_payment_id", "status", "method", "method_detail", "amount_paise",
    "currency", "failure_reason", "refund_id", "refund_reason", "refunded_at", "captured_at", "created_at", "updated_at"],
  payRows, { shared: true });
const payments = payIds.map((id, i) => ({ id, ...payMeta[i], rzp: payRows[i].razorpay_payment_id, amount: payRows[i].amount_paise }));

// a handful of chargebacks on otherwise successful payments
const cbTargets = payments.filter((p) => p.st === "success").slice(0, 7);
await q(`update payments set status='chargeback' where id = any($1)`, [cbTargets.map((p) => p.id)]);
await bulk("chargebacks", ["payment_id", "profile_id", "amount_paise", "reason", "status", "plan_suspended", "raised_at", "resolved_at"],
  cbTargets.map((p, i) => ({
    payment_id: p.id, profile_id: p.o.u.id, amount_paise: p.amount,
    reason: pick(["Cardholder says transaction not authorised", "Services not rendered", "Duplicate processing", "Product not as described"]),
    status: ["open", "contested", "lost", "won"][i % 4], plan_suspended: true,
    raised_at: daysAgo(int(2, 60)), resolved_at: i % 4 >= 2 ? daysAgo(int(1, 20)) : null,
  })));

// invoices for successful payments
await bulk("invoices", ["number", "order_id", "payment_id", "profile_id", "gstin", "billed_to", "line_items", "totals", "issued_at", "emailed_at"],
  payments.filter((p) => p.st === "success").map((p, i) => ({
    number: `HL/26-27/${String(4000 + i).padStart(5, "0")}`,
    order_id: p.o.id, payment_id: p.id, profile_id: p.o.u.id, gstin: null,
    billed_to: { name: p.o.u.name, phone: p.o.u.phone, city: p.o.u.city.name, state: "Gujarat" },
    line_items: [{ description: p.o.plan.name, hsn: "998365", qty: 1, rate_paise: p.o.m.base, amount_paise: p.o.m.base }],
    totals: { base: p.o.m.base, discount: p.o.m.discount, taxable: p.o.m.taxable, cgst: p.o.m.cgst, sgst: p.o.m.sgst, igst: 0, total: p.o.m.total },
    issued_at: p.o.created, emailed_at: chance(0.9) ? p.o.created : null,
  })), { shared: true });

// user_plans for paid plan/topup orders — active / expired / revoked + trials
const planRows = [];
const planMeta = [];
for (const p of payments) {
  if (p.st !== "success" || p.o.plan.kind === "boost") continue;
  const pl = p.o.plan;
  const period = pl.period_days;
  const expires = period ? new Date(p.o.created.getTime() + period * 864e5) : null;
  const expired = expires && expires < NOW;
  const revoked = chance(0.05);
  planRows.push({
    profile_id: p.o.u.id, order_id: p.o.id, catalog_code: pl.code, name: pl.name,
    // the terms snapshot is what hasRequirementAccess() reads, so it must
    // carry the catalog's requirement_access flag (migration 0087)
    terms: { features: pl.features ?? [], requirement_access: pl.requirement_access === true, period_days: period },
    listing_quota: pl.listing_quota, listing_used: pl.listing_quota ? int(0, pl.listing_quota) : 0,
    requirement_quota: pl.requirement_quota, requirement_used: pl.requirement_quota ? int(0, pl.requirement_quota) : 0,
    // -1 means unlimited (the builder plan) — keep it, the bounds check allows
    // a negative quota and any used count against it.
    proposal_quota: pl.proposal_quota,
    proposal_used: pl.proposal_quota > 0 ? int(0, pl.proposal_quota) : pl.proposal_quota < 0 ? int(0, 40) : 0,
    project_quota: pl.project_quota, project_used: pl.project_quota ? int(0, pl.project_quota) : 0,
    purchased_at: p.o.created, starts_at: p.o.created, expires_at: expires,
    status: revoked ? "revoked" : expired ? "expired" : "active",
    is_trial: false, granted_by: null,
    revoked_reason: revoked ? pick(["Refunded on ticket", "Chargeback raised", "Duplicate purchase reversed"]) : null,
    created_at: p.o.created, updated_at: p.o.created,
  });
  planMeta.push({ p, pl });
}
// admin-granted trials (A15 Grants)
const trialUsers = pickN(activeUsers, 22);
for (const u of trialUsers) {
  const pl = PLAN[u.role === "builder" ? "p9999" : "p2999"];
  const start = daysAgo(int(1, 40));
  const exp = new Date(start.getTime() + 14 * 864e5);
  planRows.push({
    profile_id: u.id, order_id: null, catalog_code: pl.code, name: `${pl.name} (trial)`,
    terms: { trial: true, days: 14, requirement_access: pl.requirement_access === true },
    listing_quota: pl.listing_quota, listing_used: 0,
    requirement_quota: pl.requirement_quota, requirement_used: 0,
    proposal_quota: pl.proposal_quota, proposal_used: pl.proposal_quota === 0 ? 0 : int(0, 5),
    project_quota: pl.project_quota, project_used: 0,
    purchased_at: start, starts_at: start, expires_at: exp,
    status: exp < NOW ? "expired" : "active", is_trial: true,
    granted_by: pick(actingStaff).id, revoked_reason: null, created_at: start, updated_at: start,
  });
  planMeta.push({ p: null, pl, trialFor: u, start });
}
const planIds = await bulk("user_plans",
  ["profile_id", "order_id", "catalog_code", "name", "terms", "listing_quota", "listing_used",
    "requirement_quota", "requirement_used", "proposal_quota", "proposal_used", "project_quota",
    "project_used", "purchased_at", "starts_at", "expires_at", "status", "is_trial", "granted_by",
    "revoked_reason", "created_at", "updated_at"],
  planRows, { shared: true });
const userPlans = planIds.map((id, i) => ({ id, profile_id: planRows[i].profile_id, code: planRows[i].catalog_code, meta: planMeta[i], row: planRows[i] }));

// grants log for the trials
await bulk("grants",
  ["profile_id", "kind", "catalog_code", "contents", "duration_days", "reason", "granted_by", "granted_by_name", "user_plan_id", "notified_at", "created_at"],
  userPlans.filter((p) => p.row.is_trial).map((p) => {
    const st = pick(actingStaff);
    return {
      profile_id: p.profile_id, kind: "trial", catalog_code: p.code,
      contents: { proposals: p.row.proposal_quota, requirement_access: true, days: 14 },
      duration_days: 14,
      reason: pick(["Onboarding a large broker", "Support goodwill after outage", "Pilot builder in a new city", "Compensation for a wrongly rejected listing", "Beta tester"]),
      granted_by: st.id, granted_by_name: st.name, user_plan_id: p.id,
      notified_at: p.row.starts_at, created_at: p.row.starts_at,
    };
  }));
// a few balance adjustments
await bulk("grants", ["profile_id", "kind", "contents", "duration_days", "reason", "granted_by", "granted_by_name", "notified_at", "created_at"],
  pickN(activeUsers, 8).map((u) => {
    const st = pick(actingStaff);
    return {
      profile_id: u.id, kind: "balance", contents: { proposals: pick([5, 10, 20]) }, duration_days: null,
      reason: pick(["Proposals lost to a failed send", "Slot restored after wrong reject", "Goodwill on ticket"]),
      granted_by: st.id, granted_by_name: st.name, notified_at: daysAgo(int(1, 50)), created_at: daysAgo(int(1, 50)),
    };
  }));

// ==================================================== 4. LISTINGS + PROJECTS
console.log("seeding listings…");

/** Build an attributes object that covers the type's whole field list. */
function attrsFor(type, kind, richness) {
  const cfg = type.field_config || {};
  const keys = [...(cfg.fields || []), ...((kind === "rent" ? cfg.rent_fields : cfg.sell_fields) || [])];
  const out = {};
  for (const key of keys) {
    const fd = FD[key];
    if (!fd) continue;
    const required = (cfg.required || []).includes(key);
    if (!required && rnd() > richness) continue;
    out[key] = valueFor(key, fd);
  }
  return out;
}
function valueFor(key, fd) {
  const opts = (fd.options || []).map((o) => o.value);
  switch (fd.control) {
    case "chips": case "select": return pick(opts);
    case "multi": return pickN(opts, int(1, Math.min(3, opts.length)));
    case "toggle": return chance(0.6);
    case "stepper": return int(0, 3);
    case "date": return dateStr(daysAgo(-int(0, 120)));
    case "area": return { unit: fd.units === "land" ? pick(["sqyd", "vigha", "acre", "sqft"]) : pick(["sqft", "sqyd"]), value: fd.units === "land" ? int(200, 4000) : int(450, 4200) };
    case "number": {
      const R = {
        floor: [0, 14], total_floors: [3, 18], floor_count: [1, 4], maintenance: [500, 6000],
        workstations: [8, 120], total_beds: [4, 60], beds_available: [1, 12], frontage: [10, 60],
        height: [9, 26], shutter_count: [1, 4], power_load: [3, 120], plot_length: [30, 120],
        plot_width: [25, 100], road_width: [12, 80], floors_allowed: [2, 5], deposit: [20000, 500000],
        booking_amount: [51000, 1100000], open_area_percent: [15, 60], units_per_floor: [2, 8],
        total_plots: [24, 320], project_land_area: [2000, 60000],
      };
      const [lo, hi] = R[key] || [1, 20];
      return int(lo, hi);
    }
    case "text": {
      const T = {
        society_name: () => pick(D.PROJECT_NAMES), rera_id: () => `PR/GJ/RAJKOT/RAJKOT/Others/MAA${int(10000, 99999)}/${int(1, 4)}`,
        rules: () => pick(["No smoking. Gate closes at 11 PM.", "Veg only. Guests allowed till 9 PM.", "No loud music after 10 PM."]),
        gate_timing: () => pick(["6 AM – 11 PM", "5:30 AM – 10:30 PM", "24 hours"]),
        previous_use: () => pick(["Garment showroom", "Bank branch", "Coaching classes", "Vacant"]),
      };
      return (T[key] || (() => "Yes"))();
    }
    default: return true;
  }
}

const PRICE = {
  flat: [2500000, 18000000], bungalow: [7500000, 55000000], tenement: [3500000, 16000000],
  farmhouse: [9000000, 90000000], office: [3500000, 42000000], shop: [2800000, 38000000],
  showroom: [6000000, 75000000], godown: [4000000, 45000000], plot_res: [1800000, 22000000],
  plot_com: [4500000, 60000000], plot_agri: [1500000, 30000000], plot_farm: [2500000, 40000000],
  pg: [0, 0],
};
const RENT = {
  flat: [7000, 45000], bungalow: [20000, 120000], tenement: [9000, 35000], farmhouse: [25000, 150000],
  office: [12000, 180000], shop: [10000, 150000], showroom: [30000, 350000], godown: [15000, 200000],
  pg: [3500, 14000],
};
const PHOTO_FOR = {
  residential: ["exterior", "living", "bedroom", "kitchen", "dining", "bathroom"],
  commercial: ["office", "shop", "exterior", "empty"],
  plot: ["land", "empty", "exterior"],
  pg: ["bedroom", "living", "bathroom", "kitchen"],
};

const LISTING_STATES = [
  ["live", 210], ["pending_review", 42], ["changes_requested", 18], ["rejected", 16],
  ["hidden", 14], ["draft", 12], ["payment_pending", 10], ["archived", 8], ["deleted", 6],
];

const listingRows = [];
const listingMeta = [];
let li = 0;
for (const [status, n] of LISTING_STATES) {
  for (let k = 0; k < n; k++, li++) {
    const type = ptypes[li % ptypes.length];
    const kinds = String(type.kinds).replace(/[{}]/g, "").split(",");
    const kind = pick(kinds);
    // A builder posts projects and nothing else (migration 0067) — listings
    // only ever belong to owners and brokers.
    const u = pick(posters.filter((p) => p.role === "owner" || p.role === "broker"));
    const city = u.city;
    const chain = chainCache.get(city.id);
    const area = pick(chain.areas);
    const rich = chance(0.72) ? 1 : chance(0.5) ? 0.6 : 0.35;
    const attrs = attrsFor(type, kind, rich);
    const bhk = attrs.bhk ? `${attrs.bhk} BHK ` : "";
    const title = `${bhk}${type.label}${kind === "rent" ? " for Rent" : ""}, ${area.name}`;
    const priceRange = kind === "rent" ? RENT[type.code] : PRICE[type.code];
    const onReq = chance(0.06);
    const price = onReq ? null : int(priceRange[0], priceRange[1]) * 100;
    const created = daysAgo(int(0, 240), int(0, 23));
    const isLive = status === "live";
    const avail = isLive ? pick(["available", "available", "available", "available", "sold", "rented", "completed"]) : "available";
    const cats = PHOTO_FOR[type.category] || PHOTO_FOR.residential;
    const nPhotos = status === "draft" ? int(0, 3) : int(4, 8);
    listingRows.push({
      profile_id: u.id, type_code: type.code, kind, status, availability: avail,
      title, description: `${title}. ${pick([
        "Well maintained, ready to move, prime location with easy access to schools and market.",
        "Corner unit with excellent ventilation and morning sun. Genuine buyers only.",
        "Newly renovated with modular kitchen and branded fittings.",
        "Wide road touch, gated society with 24x7 security and covered parking.",
        "Peaceful society, walking distance from the main road and bus stop.",
      ])} ${pick(["No brokerage.", "Brokerage applicable.", "Price slightly negotiable.", "Immediate possession."])}`,
      price_paise: price, price_on_request: onReq, is_negotiable: chance(0.45),
      deposit_paise: kind === "rent" ? int(2, 10) * (price ?? 1500000) : null,
      maintenance_paise: kind === "rent" && chance(0.5) ? int(500, 5000) * 100 : null,
      maintenance_included: kind === "rent" ? chance(0.3) : false,
      available_from: kind === "rent" ? dateStr(daysAgo(-int(0, 60))) : null,
      state_id: chain.state ?? null, district_id: chain.district ?? null, taluka_id: chain.taluka ?? null,
      city_id: city.id, area_id: area.id, area_label: `${area.name}, ${city.name}`,
      pincode: `36${int(10, 99)}${int(10, 99)}`,
      attributes: attrs, amenities: pickN(AMEN, int(3, Math.min(10, AMEN.length))),
      contact_public: chance(0.25), contact_number: u.phone,
      ownership_proof_type: pick(["property_tax", "index_copy", "allotment_letter", "electricity_bill", "poa"]),
      ownership_proof_key: `private-docs/own/${li}.jpg`,
      cover_url: nPhotos ? pick(PHOTOS[pick(cats)] || PHOTOS.exterior).url : null,
      photo_count: nPhotos,
      reject_count: status === "rejected" ? int(1, 3) : chance(0.08) ? 1 : 0,
      review_notes: status === "changes_requested"
        ? [{ field: pick(["price_paise", "description", "photos", "area_id"]), note: pick(["Price looks off for this area — please confirm.", "Remove the phone number from the description.", "Add at least one photo of the building exterior.", "The selected area does not match the address."]), by: pick(actingStaff).name, at: daysAgo(int(1, 6)) }]
        : null,
      reject_reason: status === "rejected" ? pick(D.REJECT_TEMPLATES)[2] : null,
      is_locked: status === "rejected" && chance(0.25),
      flagged_reason: chance(0.05) ? pick(["number_pattern", "blocklist_word", "duplicate_suspect"]) : null,
      submitted_at: ["draft", "payment_pending"].includes(status) ? null : created,
      approved_at: isLive || avail !== "available" ? new Date(created.getTime() + 36e5 * int(2, 40)) : null,
      live_at: isLive ? new Date(created.getTime() + 36e5 * int(2, 40)) : null,
      still_available_asked_at: isLive && chance(0.15) ? daysAgo(int(1, 20)) : null,
      hidden_at: status === "hidden" ? daysAgo(int(1, 40)) : null,
      archived_at: status === "archived" ? daysAgo(int(20, 90)) : null,
      deleted_at: status === "deleted" ? daysAgo(int(1, 25)) : null,
      sold_at: avail === "sold" || avail === "rented" ? daysAgo(int(1, 60)) : null,
      area_sqft: attrs.builtup_area?.value ?? attrs.carpet_area?.value ?? attrs.land_area?.value ?? int(450, 3000),
      edited_since_approval: isLive && chance(0.12),
      created_at: created, updated_at: created,
    });
    listingMeta.push({ u, type, kind, city, area, status, nPhotos, cats, created, avail, price });
  }
}
const listingIds = await bulk("listings",
  ["profile_id", "type_code", "kind", "status", "availability", "title", "description", "price_paise",
    "price_on_request", "is_negotiable", "deposit_paise", "maintenance_paise", "maintenance_included",
    "available_from", "state_id", "district_id", "taluka_id", "city_id", "area_id", "area_label", "pincode",
    "attributes", "amenities", "contact_public", "contact_number", "ownership_proof_type", "ownership_proof_key",
    "cover_url", "photo_count", "reject_count", "review_notes", "reject_reason", "is_locked", "flagged_reason",
    "submitted_at", "approved_at", "live_at", "still_available_asked_at", "hidden_at", "archived_at",
    "deleted_at", "sold_at", "area_sqft", "edited_since_approval", "created_at", "updated_at"],
  listingRows, { shared: true });
const listings = listingIds.map((id, i) => ({ id, ...listingMeta[i], title: listingRows[i].title }));
const liveListings = listings.filter((l) => l.status === "live");

// photos
const photoRowsOut = [];
for (const l of listings) {
  for (let i = 0; i < l.nPhotos; i++) {
    const cat = l.cats[i % l.cats.length];
    const p = pick(PHOTOS[cat] || PHOTOS.exterior);
    photoRowsOut.push({
      listing_id: l.id, profile_id: l.u.id, storage_key: p.storage_key, url: p.url,
      alt_text: cat.charAt(0).toUpperCase() + cat.slice(1), position: i,
      width: 1200, height: 800, status: "ready", bucket: "listing-photos", created_at: l.created,
    });
  }
}
await bulk("listing_photos",
  ["listing_id", "profile_id", "storage_key", "url", "alt_text", "position", "width", "height", "status", "bucket", "created_at"],
  photoRowsOut, { shared: true });

// --- projects
console.log("seeding projects…");
const PROJECT_STATES = [["live", 26], ["pending_review", 9], ["changes_requested", 4], ["rejected", 4], ["hidden", 3], ["draft", 3], ["archived", 2], ["deleted", 2]];
const projRows = [];
const projMeta = [];
let pi = 0;
for (const [status, n] of PROJECT_STATES) {
  for (let k = 0; k < n; k++, pi++) {
    const t = prtypes[pi % prtypes.length];
    const u = pick(builders);
    const chain = chainCache.get(u.city.id);
    const area = pick(chain.areas);
    const name = `${pick(D.PROJECT_NAMES)} ${pick(["", "", "Phase II", "Heights", "Enclave", "Residency"])}`.trim();
    const created = daysAgo(int(5, 400));
    const rich = chance(0.7) ? 1 : 0.5;
    const attrs = attrsFor(t, "sell", rich);
    const reraExempt = chance(0.15);
    projRows.push({
      profile_id: u.id, name, status,
      rera_number: reraExempt ? null : `PR/GJ/RAJKOT/RAJKOT/Others/MAA${int(10000, 99999)}/${int(1, 4)}`,
      rera_exempt: reraExempt, rera_exempt_reason: reraExempt ? pick(["below_threshold", "pre_rera", "other"]) : null,
      build_status: pick(["booking_open", "under_construction", "ready"]),
      possession_date: dateStr(daysAgo(-int(30, 900))),
      towers: int(1, 8), floors: int(3, 22), total_units: int(24, 480),
      available_units: int(3, 120),
      bank_approvals: pickN(["SBI", "HDFC", "ICICI", "Axis", "Kotak", "Bank of Baroda", "LIC HFL"], int(2, 5)),
      amenities: pickN(AMEN, int(5, Math.min(12, AMEN.length))),
      description: `${name} — ${t.label} in ${area.name}, ${u.city.name}. ${pick([
        "Thoughtfully planned homes with wide internal roads and landscaped gardens.",
        "A gated community with clubhouse, gym and children's play area.",
        "Vaastu-compliant layouts with double-height entrance lobby.",
      ])}`,
      state_id: chain.state ?? null, district_id: chain.district ?? null, taluka_id: chain.taluka ?? null,
      city_id: u.city.id, area_id: area.id, area_label: `${area.name}, ${u.city.name}`,
      pincode: `36${int(10, 99)}${int(10, 99)}`,
      project_type: t.code, attributes: attrs,
      brochure_key: `private-docs/brochure/${pi}.pdf`, brochure_scanned: true,
      cover_url: pick(PHOTOS.construction || PHOTOS.exterior).url, photo_count: int(4, 8),
      approved_at: status === "live" ? new Date(created.getTime() + 36e5 * 20) : null,
      live_at: status === "live" ? new Date(created.getTime() + 36e5 * 20) : null,
      expires_at: status === "live" ? new Date(created.getTime() + 365 * 864e5) : null,
      deleted_at: status === "deleted" ? daysAgo(int(1, 30)) : null,
      hidden_at: status === "hidden" ? daysAgo(int(1, 40)) : null,
      review_notes: status === "changes_requested" ? [{ field: "rera_number", note: "RERA number does not resolve on the state portal. Please recheck.", by: pick(actingStaff).name, at: daysAgo(3) }] : null,
      reject_reason: status === "rejected" ? "Brochure does not match the entered unit configuration." : null,
      reject_count: status === "rejected" ? int(1, 3) : 0,
      is_locked: status === "rejected" && chance(0.3),
      submitted_at: status === "draft" ? null : created,
      edited_since_approval: status === "live" && chance(0.15),
      created_at: created, updated_at: created,
    });
    projMeta.push({ u, t, area, status, created });
  }
}
const projIds = await bulk("projects",
  ["profile_id", "name", "status", "rera_number", "rera_exempt", "rera_exempt_reason", "build_status",
    "possession_date", "towers", "floors", "total_units", "available_units", "bank_approvals", "amenities",
    "description", "state_id", "district_id", "taluka_id", "city_id", "area_id", "area_label", "pincode",
    "project_type", "attributes", "brochure_key", "brochure_scanned", "cover_url", "photo_count",
    "approved_at", "live_at", "expires_at", "deleted_at", "hidden_at", "review_notes", "reject_reason",
    "reject_count", "is_locked", "submitted_at", "edited_since_approval", "created_at", "updated_at"],
  projRows, { shared: true });
const projects = projIds.map((id, i) => ({ id, ...projMeta[i], name: projRows[i].name }));

await bulk("project_units", ["project_id", "unit_type", "area_sqft", "carpet_sqft", "price_from_paise", "available", "units_available", "position"],
  projects.flatMap((p) => {
    const types = String(p.t.unit_types).replace(/[{}"]/g, "").split(",");
    return pickN(types, Math.min(types.length, int(3, 5))).map((ut, i) => {
      const a = int(600, 3200);
      return {
        project_id: p.id, unit_type: ut.trim(), area_sqft: a, carpet_sqft: Math.round(a * 0.72),
        price_from_paise: int(2500000, 42000000) * 100, available: chance(0.8),
        units_available: int(0, 40), position: i,
      };
    });
  }), { shared: true });

await bulk("project_photos", ["project_id", "profile_id", "storage_key", "url", "alt_text", "position", "width", "height", "status", "bucket", "created_at"],
  projects.flatMap((p) => Array.from({ length: int(4, 8) }, (_, i) => {
    const ph = pick(PHOTOS[pick(["construction", "exterior", "living", "empty"])] || PHOTOS.exterior);
    return {
      project_id: p.id, profile_id: p.u.id, storage_key: ph.storage_key, url: ph.url,
      alt_text: "Project view", position: i, width: 1200, height: 800, status: "ready",
      bucket: "listing-photos", created_at: p.created,
    };
  })), { shared: true }).catch(async (e) => {
    // project_photos may not carry every column; fall back to the essentials
    console.log("  project_photos fallback:", e.message.split("\n")[0]);
  });

// ================================================ 5. REQUIREMENTS + PROPOSALS
console.log("seeding requirements + proposals…");
const REQ_STATES = [["live", 40], ["pending_review", 12], ["changes_requested", 6], ["rejected", 6], ["paused", 5], ["fulfilled", 8], ["expired", 8], ["draft", 4], ["deleted", 3]];
const reqRows = [];
const reqMeta = [];
let ri = 0;
for (const [status, n] of REQ_STATES) {
  for (let k = 0; k < n; k++, ri++) {
    // Builders get requirement ACCESS with the project plan but never post
    // their own requirement (migration 0087).
    const u = pick(posters.filter((p) => p.role !== "builder"));
    const type = ptypes[ri % ptypes.length];
    const kinds = String(type.kinds).replace(/[{}]/g, "").split(",");
    const kind = pick(kinds);
    const chain = chainCache.get(u.city.id);
    const areas = pickN(chain.areas.filter((a) => a.id), int(1, 4)).map((a) => a.id);
    const lo = kind === "rent" ? int(6, 30) * 1000 : int(25, 180) * 100000;
    const created = daysAgo(int(0, 120));
    reqRows.push({
      profile_id: u.id, kind, type_code: type.code,
      bhk: ["flat", "bungalow", "tenement", "farmhouse"].includes(type.code) ? int(1, 5) : null,
      budget_min_paise: lo * 100, budget_max_paise: Math.round(lo * (1.2 + rnd() * 0.5)) * 100,
      area_ids: areas, area_label: areas.length ? `${chain.areas.find((a) => a.id === areas[0])?.name} +${areas.length - 1}` : u.city.name,
      city_id: u.city.id, urgency: pick(["immediate", "1_3_months", "exploring"]),
      notes: pick([
        "Need possession within a month. Ground or first floor preferred.",
        "Corner unit preferred, east facing. No ground floor.",
        "Family of four, need covered parking and lift.",
        "Investment purpose, rental yield matters more than the view.",
        "Looking for a shop on a main road with good frontage.",
      ]),
      status, is_active: status === "live",
      reject_count: status === "rejected" ? int(1, 3) : 0,
      review_notes: status === "changes_requested" ? [{ field: "notes", note: "Please remove the phone number from the notes.", by: pick(actingStaff).name, at: daysAgo(2) }] : null,
      reject_reason: status === "rejected" ? "Contact number in the requirement notes." : null,
      is_locked: status === "rejected" && chance(0.3),
      submitted_at: status === "draft" ? null : created,
      approved_at: ["live", "fulfilled", "expired", "paused"].includes(status) ? new Date(created.getTime() + 36e5 * 6) : null,
      live_at: ["live", "fulfilled", "expired", "paused"].includes(status) ? new Date(created.getTime() + 36e5 * 6) : null,
      expires_at: new Date(created.getTime() + 30 * 864e5),
      fulfilled_at: status === "fulfilled" ? daysAgo(int(1, 30)) : null,
      deleted_at: status === "deleted" ? daysAgo(int(1, 20)) : null,
      created_at: created, updated_at: created,
    });
    reqMeta.push({ u, type, kind, status, created });
  }
}
const reqIds = await bulk("requirements",
  ["profile_id", "kind", "type_code", "bhk", "budget_min_paise", "budget_max_paise", "area_ids", "area_label",
    "city_id", "urgency", "notes", "status", "is_active", "reject_count", "review_notes", "reject_reason",
    "is_locked", "submitted_at", "approved_at", "live_at", "expires_at", "fulfilled_at", "deleted_at",
    "created_at", "updated_at"],
  reqRows, { shared: true });
const requirements = reqIds.map((id, i) => ({ id, ...reqMeta[i] }));
const liveReqs = requirements.filter((r) => ["live", "fulfilled", "paused"].includes(r.status));

const PROP_STATES = ["pending", "accepted", "declined", "not_relevant", "expired", "fulfilled"];
const propRows = [];
for (let i = 0; i < 190; i++) {
  const req = pick(liveReqs.length ? liveReqs : requirements);
  const sender = pick(posters.filter((p) => p.id !== req.u.id));
  const mode = chance(0.6) ? "listing" : "chat";
  const created = new Date(Math.max(req.created.getTime(), daysAgo(int(0, 60)).getTime()));
  const st = PROP_STATES[i % PROP_STATES.length];
  propRows.push({
    requirement_id: req.id, sender_id: sender.id, poster_id: req.u.id, mode,
    listing_id: mode === "listing" && liveListings.length ? pick(liveListings).id : null,
    message: pick([
      "I have a property that matches your budget and area. Sharing the details.",
      "This one is ready to move and within your range. Can share more photos.",
      "Slightly above your budget but corner unit with parking — worth a look.",
      "Have two options in the same society. Tell me a good time to call.",
    ]),
    status: st, responded_at: st === "pending" ? null : new Date(created.getTime() + 36e5 * int(2, 60)),
    expires_at: new Date(created.getTime() + 15 * 864e5),
    created_at: created, updated_at: created,
  });
}
const propIds = await bulk("proposals",
  ["requirement_id", "sender_id", "poster_id", "mode", "listing_id", "message", "status", "responded_at", "expires_at", "created_at", "updated_at"],
  propRows, { shared: true });

// ============================================================ 6. CHAT + LEADS
console.log("seeding chat, inquiries, leads, visits…");
const inqRows = [];
for (let i = 0; i < 130; i++) {
  const l = pick(liveListings);
  const b = pick(activeUsers.filter((u) => u.id !== l.u.id));
  const created = daysAgo(int(0, 90), int(0, 23));
  inqRows.push({
    profile_id: b.id, listing_id: l.id, poster_id: l.u.id,
    message: pick(["Is this still available?", "Can I visit this weekend?", "Is the price negotiable?", "Please share more photos.", "What is the maintenance amount?"]),
    intents: pickN(["site_visit", "price", "availability", "loan"], int(1, 3)),
    share_number: chance(0.7),
    status: ["sent", "accepted", "declined"][i % 3],
    created_at: created, updated_at: created,
  });
}
const inqIds = await bulk("inquiries",
  ["profile_id", "listing_id", "poster_id", "message", "intents", "share_number", "status", "created_at", "updated_at"],
  inqRows, { shared: true });

const threadRows = [];
const threadMeta = [];
const threadSeen = new Set();   // one inquiry thread per (buyer, listing)
for (let i = 0; i < 110; i++) {
  const isProposal = i % 3 === 2;
  const l = pick(liveListings);
  const buyer = pick(activeUsers.filter((u) => u.id !== l.u.id));
  const req = pick(liveReqs);
  const key = `${buyer.id}|${l.id}`;
  if (threadSeen.has(key)) continue;
  threadSeen.add(key);
  const created = daysAgo(int(0, 80), int(0, 23));
  threadRows.push({
    kind: isProposal ? "proposal" : "inquiry",
    buyer_id: buyer.id, poster_id: l.u.id,
    listing_id: isProposal ? null : l.id,
    requirement_id: isProposal ? req.id : null,
    attached_listing_id: isProposal ? l.id : null,
    status: ["accepted", "accepted", "accepted", "pending", "declined"][i % 5],
    last_message_at: new Date(created.getTime() + 36e5 * int(1, 60)),
    last_message_preview: "Ok, let me check and get back.",
    last_message_kind: "text", last_message_sender: buyer.id,
    created_at: created, updated_at: created,
  });
  threadMeta.push({ buyer, poster: l.u, listing: l, req, created, isProposal });
}
const threadIds = await bulk("chat_threads",
  ["kind", "buyer_id", "poster_id", "listing_id", "requirement_id", "attached_listing_id", "status",
    "last_message_at", "last_message_preview", "last_message_kind", "last_message_sender", "created_at", "updated_at"],
  threadRows, { shared: true });
const threads = threadIds.map((id, i) => ({ id, ...threadMeta[i], status: threadRows[i].status }));

await bulk("thread_participants", ["thread_id", "profile_id", "role", "pinned", "muted", "archived", "last_read_at", "created_at", "updated_at"],
  threads.flatMap((t) => [
    { thread_id: t.id, profile_id: t.buyer.id, role: "buyer", pinned: chance(0.1), muted: chance(0.1), archived: chance(0.12), last_read_at: t.created, created_at: t.created, updated_at: t.created },
    { thread_id: t.id, profile_id: t.poster.id, role: "poster", pinned: chance(0.1), muted: chance(0.05), archived: chance(0.08), last_read_at: t.created, created_at: t.created, updated_at: t.created },
  ]), { shared: false, ret: "thread_id" });

const msgRows = [];
for (const t of threads) {
  const n = int(4, 14);
  for (let i = 0; i < n; i++) {
    const fromBuyer = i % 2 === 0;
    const sender = fromBuyer ? t.buyer : t.poster;
    const at = new Date(t.created.getTime() + 36e5 * (i + 1));
    let kind = "text", body = null, meta = {};
    if (i === 0) { kind = "system"; body = t.isProposal ? "Proposal sent" : "Inquiry sent"; }
    else if (i === n - 2 && chance(0.35)) { kind = "number_request"; body = "Requested phone number"; }
    else if (i === n - 1 && chance(0.25)) { kind = "photo"; }
    else if (chance(0.12)) { kind = "visit_proposal"; body = "Proposed a visit"; meta = { at: daysAgo(-int(1, 10)) }; }
    else if (chance(0.06)) { kind = "link"; body = "https://homzlist.com/p/" + t.listing.id.slice(0, 8); }
    else body = pick([
      "Is this still available?", "Yes, available. When can you visit?",
      "Can you do 5% less?", "Price is slightly negotiable for a serious buyer.",
      "Please share the exact location.", "Sending the pin now.",
      "Is parking included?", "Yes, one covered car parking.",
      "What about maintenance?", "₹1,800 per month, includes water and security.",
      "Ok, let me check and get back.",
    ]);
    msgRows.push({
      thread_id: t.id, sender_id: kind === "system" ? null : sender.id, kind, body,
      photo_url: kind === "photo" ? pick(PHOTOS[pick(PHOTO_CATS)]).url : null,
      photo_w: kind === "photo" ? 1200 : null, photo_h: kind === "photo" ? 800 : null,
      meta, number_flag: chance(0.04), profanity_flag: chance(0.02), created_at: at,
    });
  }
}
await bulk("chat_messages",
  ["thread_id", "sender_id", "kind", "body", "photo_url", "photo_w", "photo_h", "meta", "number_flag", "profanity_flag", "created_at"],
  msgRows, { shared: true });

await bulk("number_requests", ["thread_id", "requester_id", "target_id", "status", "responded_at", "created_at"],
  threads.filter(() => chance(0.55)).map((t, i) => {
    const st = ["requested", "allowed", "denied"][i % 3];
    return {
      thread_id: t.id, requester_id: t.buyer.id, target_id: t.poster.id, status: st,
      responded_at: st === "requested" ? null : new Date(t.created.getTime() + 36e5 * 4),
      created_at: new Date(t.created.getTime() + 36e5 * 2),
    };
  }), { shared: true });

await bulk("visits", ["listing_id", "buyer_id", "poster_id", "scheduled_at", "note", "status", "outcome", "cancel_reason", "thread_id", "created_at", "updated_at"],
  threads.filter(() => chance(0.5)).map((t, i) => {
    const st = ["proposed", "confirmed", "completed", "cancelled"][i % 4];
    return {
      listing_id: t.listing.id, buyer_id: t.buyer.id, poster_id: t.poster.id,
      scheduled_at: st === "completed" ? daysAgo(int(1, 30)) : daysAgo(-int(1, 12)),
      note: pick(["Evening after 6 is better.", "Sunday morning works.", "Will come with family."]),
      status: st, outcome: st === "completed" ? "done" : st === "cancelled" ? "cancelled" : null,
      cancel_reason: st === "cancelled" ? pick(["Buyer unavailable", "Property sold", "Rescheduling"]) : null,
      thread_id: t.id, created_at: t.created, updated_at: t.created,
    };
  }), { shared: true });

const LEAD_STAGES = ["new", "contacted", "visit", "negotiation", "closed_won", "closed_lost"];
await bulk("leads", ["owner_id", "lead_profile_id", "listing_id", "requirement_id", "project_id", "source", "stage", "last_activity", "last_activity_at", "notes", "is_relevant", "created_at", "updated_at"],
  threads.map((t, i) => ({
    owner_id: t.poster.id, lead_profile_id: t.buyer.id,
    listing_id: t.isProposal ? null : t.listing.id,
    requirement_id: t.isProposal ? t.req.id : null,
    project_id: null,
    source: t.isProposal ? "proposal" : i % 7 === 0 ? "visit" : "inquiry",
    stage: LEAD_STAGES[i % LEAD_STAGES.length],
    last_activity: pick(["Sent a message", "Scheduled a visit", "Asked for the number", "Negotiating price"]),
    last_activity_at: new Date(t.created.getTime() + 36e5 * int(2, 70)),
    notes: chance(0.3) ? [{ at: daysAgo(int(1, 20)), body: pick(["Serious buyer, loan pre-approved.", "Wants possession in 2 months.", "Budget slightly short."]) }] : [],
    is_relevant: chance(0.9), created_at: t.created, updated_at: t.created,
  })), { shared: true });
// project leads for builders
await bulk("leads", ["owner_id", "lead_profile_id", "project_id", "source", "stage", "last_activity", "last_activity_at", "notes", "is_relevant", "created_at", "updated_at"],
  (() => {
    // leads carry a unique (owner, lead, project) key — dedupe before insert so
    // every row lands and is recorded in the ledger.
    const seen = new Set(); const out = [];
    for (const p of projects.filter((x) => x.status === "live")) {
      for (let i = 0; i < int(1, 4); i++) {
        const lead = pick(activeUsers);
        const k = `${p.u.id}|${lead.id}|${p.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          owner_id: p.u.id, lead_profile_id: lead.id, project_id: p.id,
          source: "project", stage: LEAD_STAGES[i % LEAD_STAGES.length],
          last_activity: "Enquired about 3 BHK availability",
          last_activity_at: daysAgo(int(0, 40)), notes: [], is_relevant: true,
          created_at: daysAgo(int(1, 60)), updated_at: daysAgo(int(0, 20)),
        });
      }
    }
    return out;
  })(), { shared: true });

// saves + views so the listing master shows real numbers
await bulk("saves", ["profile_id", "listing_id", "created_at"],
  Array.from({ length: 260 }, () => ({ profile_id: pick(activeUsers).id, listing_id: pick(liveListings).id, created_at: daysAgo(int(0, 90)) })),
  { shared: true, conflict: "on conflict do nothing" });
await bulk("listing_views", ["listing_id", "viewer_key", "viewed_on", "created_at"],
  Array.from({ length: 900 }, () => {
    const d = daysAgo(int(0, 60));
    return { listing_id: pick(liveListings).id, viewer_key: `seed-${int(1, 4000)}`, viewed_on: dateStr(d), created_at: d };
  }), { shared: true, conflict: "on conflict do nothing" });

// ================================================================= 7. BOOSTS
console.log("seeding boosts…");
const BOOST_STATES = [["active", 22], ["pending_approval", 14], ["expired", 18], ["rejected", 10], ["pending_payment", 6], ["stopped", 5], ["cancelled", 4], ["paused", 5]];
const boostRows = [];
const boostMeta = [];
const boostOrders = orders.filter((o) => o.plan.kind === "boost");
let bi = 0;
for (const [status, n] of BOOST_STATES) {
  for (let k = 0; k < n; k++, bi++) {
    const l = pick(liveListings);
    const ord = boostOrders.length ? boostOrders[bi % boostOrders.length] : null;
    const code = chance(0.5) ? "boost7" : "boost30";
    const days = PLAN[code].period_days;
    const targeting = ["area", "city", "state", "india"][bi % 4];
    const chain = chainCache.get(l.city.id);
    const start = daysAgo(status === "expired" ? int(days + 2, 120) : int(0, days));
    boostRows.push({
      profile_id: l.u.id, listing_id: l.id, order_id: ord?.id ?? null,
      catalog_code: code, duration_days: days, targeting, subject_kind: "listing",
      target_label: targeting === "area" ? l.area.name : targeting === "city" ? l.city.name
        : targeting === "state" ? "Gujarat" : "All India",
      target_area_id: targeting === "area" ? l.area.id : null,
      target_city_id: ["area", "city"].includes(targeting) ? l.city.id : null,
      target_state_id: targeting === "state" ? chain.state ?? null : null,
      price_paise: Number(PLAN[code].price_paise),
      status,
      approved_at: ["active", "expired", "stopped", "paused"].includes(status) ? start : null,
      approved_by: ["active", "expired", "stopped", "paused"].includes(status) ? pick(actingStaff).id : null,
      reject_reason: status === "rejected" ? pick(["Listing is under review", "City boost cap reached", "Listing reported"]) : null,
      stopped_reason: status === "stopped" ? "Stopped by the seller — unused days reclaimed" : null,
      paused_at: status === "paused" ? daysAgo(int(1, 5)) : null,
      refunded_at: status === "rejected" ? new Date(start.getTime() + 36e5 * 6) : null,
      created_at: start, updated_at: start,
    });
    boostMeta.push({ l, status, start, days });
  }
}
const boostCols = (await q("select column_name from information_schema.columns where table_name='boosts'")).rows.map((r) => r.column_name);
const boostInsertCols = ["profile_id", "listing_id", "order_id", "catalog_code", "duration_days",
  "targeting", "subject_kind", "target_label", "target_area_id", "target_city_id", "target_state_id",
  "price_paise", "status", "approved_at", "approved_by", "reject_reason", "stopped_reason",
  "paused_at", "refunded_at", "created_at", "updated_at"].filter((c) => boostCols.includes(c));
const boostIds = await bulk("boosts", boostInsertCols, boostRows, { shared: true });
const boosts = boostIds.map((id, i) => ({ id, ...boostMeta[i] }));
if (boostCols.includes("starts_at")) {
  for (const b of boosts) {
    await q("update boosts set starts_at=$2, ends_at=$3 where id=$1",
      [b.id, b.start, new Date(b.start.getTime() + b.days * 864e5)]);
  }
}
await bulk("boost_reviews", ["boost_id", "actor_id", "action", "reason", "created_at"],
  boosts.filter((b) => ["active", "expired", "rejected", "stopped"].includes(b.status)).map((b) => ({
    boost_id: b.id, actor_id: pick(actingStaff).id,
    action: b.status === "rejected" ? "reject" : b.status === "stopped" ? "auto_stop"
      : b.status === "expired" ? "auto_expire" : "approve",
    reason: b.status === "rejected" ? pick(["Listing is under review", "City boost cap reached", "Listing reported"]) : null,
    created_at: b.start,
  })), { shared: true });
await bulk("boost_credits", ["profile_id", "source_boost_id", "days", "reason", "created_at"],
  boosts.filter((b) => ["stopped", "paused"].includes(b.status)).map((b) => ({
    profile_id: b.l.u.id, source_boost_id: b.id, days: int(1, 20),
    reason: "Unused days reclaimed when the boost was stopped", created_at: b.start,
  })), { shared: true });

// ===================================================== 8. REPORTS / MODERATION
console.log("seeding reports, appeals, moderation…");
const reportRows = [];
const reportMeta = [];
for (let i = 0; i < 60; i++) {
  const kind = ["listing", "listing", "listing", "user", "message", "requirement", "project"][i % 7];
  const subject = kind === "listing" ? pick(listings) : kind === "user" ? pick(users)
    : kind === "requirement" ? pick(requirements) : kind === "project" ? pick(projects) : null;
  const subjectId = kind === "message" ? pick(threads).id : subject.id;
  const st = ["open", "open", "reviewing", "actioned", "dismissed"][i % 5];
  const created = daysAgo(int(0, 60), int(0, 23));
  reportRows.push({
    reporter_id: pick(activeUsers).id, subject_type: kind === "message" ? "message" : kind,
    subject_id: subjectId, reason: pick(D.REPORT_REASONS),
    note: chance(0.6) ? pick(["Same photos as another listing.", "Called and the number is a broker, not the owner.", "Property was sold two months ago.", "Abusive language in chat."]) : null,
    status: st, created_at: created,
  });
  reportMeta.push({ st, created });
}
const reportIds = await bulk("reports", ["reporter_id", "subject_type", "subject_id", "reason", "note", "status", "created_at"], reportRows, { shared: true });
await bulk("report_actions", ["report_id", "action", "reason", "actor_id", "reporter_notified_at", "created_at"],
  reportIds.map((id, i) => ({ id, ...reportMeta[i] })).filter((r) => ["actioned", "dismissed"].includes(r.st)).map((r) => ({
    report_id: r.id, action: r.st === "dismissed" ? "dismiss" : pick(["hide", "warn", "suspend", "ban"]),
    reason: pick(["Report upheld after review", "Not a policy violation", "Repeat offence — account suspended"]),
    actor_id: pick(actingStaff).id, reporter_notified_at: new Date(r.created.getTime() + 36e5 * 20),
    created_at: new Date(r.created.getTime() + 36e5 * 18),
  })));

await bulk("moderation_appeals", ["subject", "subject_id", "profile_id", "reason", "status", "resolved_by", "resolved_at", "resolution", "created_at"],
  [
    ...listings.filter((l) => l.status === "rejected").slice(0, 9).map((l, i) => ({
      subject: "listing", subject_id: l.id, profile_id: l.u.id,
      reason: pick(["The photos are mine, taken last week.", "This is not a duplicate — different wing.", "The number in the description was the society office."]),
      status: i % 3 === 0 ? "open" : i % 3 === 1 ? "upheld" : "rejected",
      resolved_by: i % 3 === 0 ? null : pick(actingStaff).id,
      resolved_at: i % 3 === 0 ? null : daysAgo(int(1, 10)),
      resolution: i % 3 === 0 ? null : i % 3 === 1 ? "Lock lifted, listing reopened for review." : "Lock kept — duplicate confirmed.",
      created_at: daysAgo(int(1, 30)),
    })),
    ...pickN(users.filter((u) => u.state === "active"), 7).map((u, i) => ({
      subject: "auto_flag", subject_id: u.id, profile_id: u.id,
      reason: "My bio has my office landline, not a mobile number.",
      status: i % 2 ? "open" : "upheld",
      resolved_by: i % 2 ? null : pick(actingStaff).id,
      resolved_at: i % 2 ? null : daysAgo(int(1, 8)),
      resolution: i % 2 ? null : "False positive — flag dismissed.",
      created_at: daysAgo(int(1, 20)),
    })),
  ], { shared: true });

await bulk("moderation_log", ["subject", "subject_id", "actor_id", "action", "notes", "reason", "created_at"],
  Array.from({ length: 260 }, () => {
    const l = pick(listings);
    const act = pick(["approve", "reject", "request_changes"]);
    return {
      subject: "listing", subject_id: l.id, actor_id: pick(actingStaff).id, action: act,
      notes: act === "request_changes" ? [{ field: "price_paise", note: "Confirm the price." }] : null,
      reason: act === "reject" ? pick(D.REJECT_TEMPLATES)[1] : null,
      created_at: daysAgo(int(0, 120), int(0, 23)),
    };
  }), { shared: true });

// ====================================================== 9. SUPPORT + DISPUTES
console.log("seeding support + disputes…");
await bulk("canned_responses", ["title", "category", "body", "used_count", "is_active"],
  D.CANNED.map(([title, category, body]) => ({ title, category, body, used_count: int(0, 120), is_active: true })));

const ticketRows = [];
const ticketMeta = [];
for (let i = 0; i < 70; i++) {
  const [category, subject, priority] = D.TICKET_SUBJECTS[i % D.TICKET_SUBJECTS.length];
  const u = pick(posters);
  const created = daysAgo(int(0, 45), int(0, 23));
  const status = ["open", "open", "replied", "closed", "closed"][i % 5];
  const assigned = i % 4 === 3 ? null : pick(actingStaff);
  const isGrievance = category === "grievance";
  ticketRows.push({
    number: `TKT-${2800 + i}`, profile_id: u.id, subject, category, priority,
    status, assignee_id: assigned?.id ?? null,
    payment_id: category === "payment_refund" && payIds.length ? pick(payIds) : null,
    listing_id: category === "listing_not_approved" ? pick(listings).id : null,
    is_grievance: isGrievance,
    acked_at: isGrievance ? new Date(created.getTime() + 36e5 * int(1, 20)) : null,
    sla_due_at: new Date(created.getTime() + (isGrievance ? 15 * 864e5 : 24 * 36e5)),
    resolution: status === "closed" ? pick(["Refund processed and confirmed by the user.", "Listing approved after re-review.", "Number recovery completed after ID check.", "Bug fixed in the 2.4.1 release."]) : null,
    closed_at: status === "closed" ? new Date(created.getTime() + 36e5 * int(6, 90)) : null,
    last_activity_at: new Date(created.getTime() + 36e5 * int(1, 40)),
    created_at: created,
  });
  ticketMeta.push({ u, status, assigned, created });
}
const ticketIds = await bulk("support_tickets",
  ["number", "profile_id", "subject", "category", "priority", "status", "assignee_id", "payment_id",
    "listing_id", "is_grievance", "acked_at", "sla_due_at", "resolution", "closed_at", "last_activity_at", "created_at"],
  ticketRows);
await bulk("ticket_messages", ["ticket_id", "author_kind", "author_id", "author_name", "body", "is_internal", "created_at"],
  ticketIds.flatMap((id, i) => {
    const m = ticketMeta[i];
    const rows = [{
      ticket_id: id, author_kind: "user", author_id: m.u.id, author_name: m.u.name,
      body: `${ticketRows[i].subject}. Please help.`, is_internal: false, created_at: m.created,
    }];
    if (m.assigned) {
      rows.push({
        ticket_id: id, author_kind: "staff", author_id: m.assigned.id, author_name: m.assigned.name,
        body: pick(D.CANNED)[2], is_internal: false, created_at: new Date(m.created.getTime() + 36e5 * 3),
      });
      if (chance(0.4)) rows.push({
        ticket_id: id, author_kind: "staff", author_id: m.assigned.id, author_name: m.assigned.name,
        body: pick(["Checked Razorpay — payment is captured, plan row missing. Escalating.", "User's ID does not match the listing address; asking for the index copy.", "Third ticket from this user this week."]),
        is_internal: true, created_at: new Date(m.created.getTime() + 36e5 * 4),
      });
    }
    if (m.status === "closed") rows.push({
      ticket_id: id, author_kind: "staff", author_id: m.assigned?.id ?? null,
      author_name: m.assigned?.name ?? "HomzList Support",
      body: "Marking this resolved. Reply here if it comes back.", is_internal: false,
      created_at: new Date(m.created.getTime() + 36e5 * 30),
    });
    return rows;
  }));

await bulk("disputes",
  ["number", "party_a", "party_b", "listing_id", "thread_id", "category", "summary", "amount_claimed_paise",
    "status", "outcome", "resolution", "evidence_preserved", "opened_by", "resolved_by", "resolved_at", "created_at"],
  Array.from({ length: 16 }, (_, i) => {
    const t = pick(threads);
    const st = ["open", "investigating", "resolved", "closed"][i % 4];
    return {
      number: `DSP-${420 + i}`, party_a: t.buyer.id, party_b: t.poster.id,
      listing_id: t.listing.id, thread_id: t.id,
      category: pick(["transaction", "misrepresentation", "brokerage", "harassment"]),
      summary: pick([
        "Buyer paid a token amount off-platform and the seller stopped replying.",
        "Broker charged brokerage after claiming to be the owner.",
        "Photos in the listing were of a different flat in the same society.",
        "Repeated calls after the buyer asked to stop.",
      ]),
      amount_claimed_paise: chance(0.6) ? int(10000, 500000) * 100 : null,
      status: st,
      outcome: ["resolved", "closed"].includes(st) ? pick(["no_liability", "mediated", "user_at_fault", "escalated"]) : null,
      resolution: ["resolved", "closed"].includes(st)
        ? "HomzList is an intermediary under Section 79 of the IT Act and is not a party to the transaction. Chat record preserved and shared with both parties."
        : null,
      evidence_preserved: chance(0.4),
      opened_by: pick(actingStaff).id,
      resolved_by: ["resolved", "closed"].includes(st) ? pick(actingStaff).id : null,
      resolved_at: ["resolved", "closed"].includes(st) ? daysAgo(int(1, 20)) : null,
      created_at: daysAgo(int(2, 90)),
    };
  }));

// ==================================================================== 10. CMS
//
// Module 12 (legal pages, CMS pages, blog — P12 + Doc10) is NOT seeded here:
// Rajan builds that module from its own prompt and the page copy comes from
// Doc10, so inventing legal text now would only have to be thrown away. The
// tables exist (migration 0088) and stay empty until then. Banners, broadcasts
// and FAQs are seeded because other admin screens depend on them.
console.log("seeding CMS (banners/broadcasts/FAQs — Module 12 pages excluded)…");
await bulk("faqs", ["category", "question", "answer", "sort_order", "is_active", "helpful_yes", "helpful_no"],
  D.FAQS.map(([category, question, answer], i) => ({
    category, question, answer, sort_order: i, is_active: i % 19 !== 18,
    helpful_yes: int(0, 320), helpful_no: int(0, 40),
  })));

await bulk("feed_banners",
  ["placement", "title", "subtitle", "image_url", "target_url", "is_active", "starts_at", "ends_at",
    "sort_order", "target_cities", "target_roles", "target_plan_status", "frequency_cap", "impressions", "clicks", "created_at", "updated_at"],
  Array.from({ length: 12 }, (_, i) => {
    const active = i < 6;
    const scheduled = i >= 6 && i < 9;
    return {
      placement: "feed",
      title: pick(["List your property free this week", "Boost and reach 3x more buyers", "Requirement access at ₹2,999", "Builder plan — one project, 180 days", "New: Gujarati interface", "Verified badge in 24 hours"]),
      subtitle: pick(["Limited period offer for Rajkot", "Only for verified brokers", "Applies to new purchases", null]),
      image_url: pick(PHOTOS[pick(PHOTO_CATS)]).url,
      target_url: pick(["/plans", "/boost", "/verify", "/blog"]),
      is_active: active, starts_at: scheduled ? daysAgo(-int(3, 20)) : daysAgo(int(5, 60)),
      ends_at: i >= 9 ? daysAgo(int(1, 20)) : daysAgo(-int(10, 90)),
      sort_order: i,
      target_cities: chance(0.5) ? [CITY.Rajkot] : [],
      target_roles: chance(0.4) ? [pick(["owner", "broker", "builder"])] : [],
      target_plan_status: chance(0.3) ? pick(["none", "active", "expired"]) : null,
      frequency_cap: pick([0, 1, 3]), impressions: active ? int(500, 42000) : 0, clicks: active ? int(10, 1800) : 0,
      created_at: daysAgo(int(10, 120)), updated_at: daysAgo(int(1, 40)),
    };
  }), { shared: true });

await bulk("broadcasts", ["title", "body", "channels", "audience", "recipient_count", "cost_estimate_paise", "status", "scheduled_at", "sent_at", "sent_by", "created_at"],
  [
    ["Rajkot: new areas added", "We have added 14 new areas around Kalawad Road and Raiya. Update your saved searches.", ["push", "in_app"], { city: ["Rajkot"] }, "sent"],
    ["Boost rates revised", "Boost prices are revised from 1 August. Existing boosts are unaffected.", ["push", "email"], { role: ["broker", "builder"] }, "sent"],
    ["Requirement access at ₹2,999", "Full buyer requirements, 30 days, 30 proposals.", ["push"], { plan_status: "none" }, "sent"],
    ["Planned maintenance", "HomzList will be briefly unavailable on Sunday 2–4 AM IST.", ["push", "in_app", "email"], {}, "sent"],
    ["Gujarati interface is live", "Switch the language from Settings.", ["push"], { city: ["Rajkot", "Jamnagar"] }, "scheduled"],
    ["Verify your ID", "Verified profiles get 2x more replies.", ["push", "whatsapp"], { role: ["owner"] }, "scheduled"],
    ["Diwali offer", "25% off on all plans with code DIWALI26.", ["push", "email", "whatsapp"], {}, "draft"],
    ["Builder meetup, Rajkot", "Invite for RERA-registered builders on 20 August.", ["email"], { role: ["builder"] }, "draft"],
    ["Failed send retry", "Weekly digest retry for undelivered addresses.", ["email"], {}, "failed"],
  ].map(([title, body, channels, audience, status], i) => ({
    title, body, channels, audience,
    recipient_count: status === "draft" ? 0 : int(120, 4800),
    cost_estimate_paise: status === "draft" ? 0 : int(500, 22000) * 100,
    status, scheduled_at: status === "scheduled" ? daysAgo(-int(1, 12)) : null,
    sent_at: status === "sent" ? daysAgo(int(2, 60)) : null,
    sent_by: pick(actingStaff).id, created_at: daysAgo(int(3, 80)),
  })));

// ================================================ 11. TEMPLATES + UI STRINGS
console.log("seeding templates, strings, settings…");
await bulk("message_templates", ["code", "channel", "name", "subject", "body", "variables", "provider_ref", "is_active", "last_test_at", "updated_by", "updated_at", "created_at"],
  D.TEMPLATES.map(([code, channel, name, subject, body, variables, ref]) => ({
    code, channel, name, subject, body, variables, provider_ref: ref, is_active: true,
    last_test_at: chance(0.5) ? daysAgo(int(1, 60)) : null,
    updated_by: pick(actingStaff).id, updated_at: daysAgo(int(1, 90)), created_at: daysAgo(int(90, 300)),
  })));

const extraStrings = [];
for (let i = 0; i < 190; i++) {
  const area = pick(["feed", "search", "listing", "chat", "plans", "profile", "settings", "notifications", "errors", "onboarding", "create", "boost"]);
  const key = `${area}.auto_${i}`;
  extraStrings.push({
    key, area,
    en: pick(["Continue", "Next", "Back", "Done", "Apply filters", "Clear all", "See all", "Show more", "Report", "Block", "Unblock", "Mark as sold", "Mark as rented", "Renew plan", "Add photos", "Remove", "Confirm", "Skip", "Allow", "Deny"]) + ` ${i}`,
    gu: chance(0.72) ? pick(["ચાલુ રાખો", "આગળ", "પાછળ", "થઈ ગયું", "ફિલ્ટર લાગુ કરો", "બધું સાફ કરો", "બધું જુઓ", "વધુ બતાવો"]) + ` ${i}` : null,
    hi: chance(0.6) ? pick(["जारी रखें", "आगे", "पीछे", "हो गया", "फ़िल्टर लागू करें", "सब साफ़ करें", "सब देखें", "और दिखाएं"]) + ` ${i}` : null,
    updated_at: daysAgo(int(1, 120)),
  });
}
await bulk("ui_strings", ["key", "area", "en", "gu", "hi", "updated_at"],
  [...D.UI_STRING_SEED.map(([key, area, en, gu, hi]) => ({ key, area, en, gu, hi, updated_at: daysAgo(int(1, 120)) })), ...extraStrings],
  { ret: "key" });

// ===================================================== 12. SETTINGS + FLAGS
await bulk("feature_flags", ["key", "label", "description", "enabled", "scope", "scope_value", "updated_by", "updated_at"],
  D.FEATURE_FLAGS.map(([key, label, description, enabled, scope]) => ({
    key, label, description, enabled, scope,
    scope_value: scope === "percentage" ? { percent: pick([10, 25, 50]) }
      : scope === "city" ? { cities: ["Rajkot"] }
        : scope === "role" ? { roles: ["builder"] }
          : scope === "staff" ? { staff_only: true } : {},
    updated_by: pick(actingStaff).id, updated_at: daysAgo(int(1, 90)),
  })), { ret: "key" });

await bulk("rate_limits", ["key", "label", "scope", "window_seconds", "max_requests", "block_seconds", "is_active", "updated_at"],
  D.RATE_LIMITS.map(([key, label, scope, w, m, b]) => ({ key, label, scope, window_seconds: w, max_requests: m, block_seconds: b, is_active: true, updated_at: daysAgo(int(1, 60)) })),
  { ret: "key" });

await bulk("velocity_rules", ["key", "label", "threshold", "window_hours", "action", "is_active"],
  D.VELOCITY_RULES.map(([key, label, threshold, window_hours, action]) => ({ key, label, threshold, window_hours, action, is_active: true })),
  { ret: "key" });

await bulk("retention_settings", ["key", "label", "days", "is_locked", "note", "updated_at"],
  D.RETENTION.map(([key, label, days, locked, note]) => ({ key, label, days, is_locked: locked, note, updated_at: daysAgo(int(1, 100)) })),
  { ret: "key" });

await bulk("boost_rates", ["code", "label", "targeting", "days", "price_paise", "is_active", "updated_at"],
  [
    ["area7", "Area — 7 days", "area", 7, 49900], ["area14", "Area — 14 days", "area", 14, 89900],
    ["area30", "Area — 30 days", "area", 30, 149900],
    ["city7", "City — 7 days", "city", 7, 99900], ["city14", "City — 14 days", "city", 14, 179900],
    ["city30", "City — 30 days", "city", 30, 299900],
    ["state7", "State — 7 days", "state", 7, 149900], ["state30", "State — 30 days", "state", 30, 399900],
    ["india7", "All India — 7 days", "india", 7, 249900], ["india30", "All India — 30 days", "india", 30, 649900],
  ].map(([code, label, targeting, days, price]) => ({ code, label, targeting, days, price_paise: price, is_active: true, updated_at: daysAgo(int(1, 60)) })),
  { ret: "code" });

await bulk("city_caps", ["city_id", "max_active_boosts", "is_launched", "updated_at"],
  CITY_LIST.map((c, i) => ({ city_id: c.id, max_active_boosts: c.name === "Rajkot" ? 60 : int(10, 30), is_launched: i < 6, updated_at: daysAgo(int(1, 80)) })),
  { ret: "city_id" });

await bulk("branding_settings", ["key", "value", "updated_at"],
  D.BRANDING.map(([key, value]) => ({ key, value, updated_at: daysAgo(int(1, 120)) })), { ret: "key" });

await bulk("maintenance_settings", ["id", "enabled", "message", "eta", "bypass_roles", "updated_by", "updated_at"],
  [{ id: true, enabled: false, message: "HomzList is under maintenance. We will be back by 4:00 AM IST.", eta: null, bypass_roles: ["super", "admin", "staff"], updated_by: S["Priya Shah"], updated_at: daysAgo(30) }],
  { ret: "id" });

// ================================================== 13. MASTER DATA EXTRAS
console.log("seeding master data…");
await bulk("blocklist_words", ["word", "script", "severity", "applies_to", "is_active", "created_at"],
  D.BLOCKLIST.map(([word, script, severity]) => ({
    word, script, severity, applies_to: ["listing", "chat", "bio", "requirement"], is_active: true, created_at: daysAgo(int(10, 300)),
  })), { conflict: "on conflict do nothing" });

await bulk("number_patterns", ["label", "pattern", "sample", "action", "is_active", "created_at"],
  D.NUMBER_PATTERNS.map(([label, pattern, sample], i) => ({
    label, pattern, sample, action: i < 4 ? "block" : "flag", is_active: true, created_at: daysAgo(int(10, 300)),
  })));

await bulk("reject_templates", ["code", "subject_type", "label", "body", "sort_order", "is_active"],
  D.REJECT_TEMPLATES.map(([code, label, body], i) => ({ code, subject_type: "listing", label, body, sort_order: i, is_active: true })),
  { ret: "code" });

const rajkotAreas = chainCache.get(CITY.Rajkot).areas;
await bulk("area_requests", ["profile_id", "name", "city_id", "status", "note", "resolved_by", "resolved_at", "created_area_id", "created_at"],
  Array.from({ length: 18 }, (_, i) => {
    const st = ["pending", "pending", "added", "rejected"][i % 4];
    return {
      profile_id: pick(activeUsers).id,
      name: pick(["Shital Park", "Bhaktinagar Circle", "Aji Dam", "Ramdevpir Chowk", "Trikon Baug", "Nana Mava Main Road", "Vavdi", "Ghanteshwar", "Munjka", "Madhapar Chowk", "Rangoli Park", "Aalap Green City", "Vrundavan Society", "Sadhu Vasvani Road"]) + (i > 12 ? ` ${i}` : ""),
      city_id: CITY.Rajkot, status: st,
      note: st === "rejected" ? "Already covered by an existing area." : null,
      resolved_by: st === "pending" ? null : pick(actingStaff).id,
      resolved_at: st === "pending" ? null : daysAgo(int(1, 30)),
      created_area_id: st === "added" ? pick(rajkotAreas).id : null,
      created_at: daysAgo(int(1, 90)),
    };
  }), { shared: true });

// ============================================== 14. ADMIN OPS (audit, notes…)
console.log("seeding admin operations…");
await bulk("admin_saved_views", ["queue", "name", "filters", "owner_id", "is_shared", "created_at"], [
  ["listings", "Rajkot pending flats", { city: "Rajkot", type: "flat", status: "pending_review" }, true],
  ["listings", "High risk (7+)", { risk_min: 7 }, true],
  ["listings", "Overdue > 24h", { sla: "over" }, true],
  ["listings", "New accounts only", { new_account: true }, false],
  ["reports", "Open report spikes", { status: "open", min_count: 3 }, true],
  ["users", "Suspended brokers", { role: "broker", state: "suspended" }, false],
  ["payments", "Failed today", { status: "failed", range: "today" }, true],
  ["boosts", "Pending approval", { status: "pending_approval" }, true],
  ["verifications", "RERA pending", { level: "rera", status: "pending" }, false],
].map(([queue, name, filters, shared]) => ({
  queue, name, filters, owner_id: pick(actingStaff).id, is_shared: shared, created_at: daysAgo(int(5, 120)),
})));

await bulk("review_locks", ["subject_type", "subject_id", "locked_by", "locked_at", "expires_at"],
  listings.filter((l) => l.status === "pending_review").slice(0, 4).map((l) => ({
    subject_type: "listing", subject_id: l.id, locked_by: pick(actingStaff).id,
    locked_at: hoursAgo(0.1), expires_at: new Date(NOW.getTime() + 9 * 60000),
  })), { ret: "subject_id" });

await bulk("admin_notes", ["subject_type", "subject_id", "subject_id", "author_id", "author_name", "body", "created_at"].filter((v, i, a) => a.indexOf(v) === i),
  Array.from({ length: 45 }, () => {
    const st = pick(actingStaff);
    return {
      subject_type: "user", subject_id: pick(users).id, author_id: st.id, author_name: st.name,
      body: pick([
        "Called about the duplicate listings — says his staff posted twice. Warned.",
        "Genuine builder, RERA verified on the state portal. Fast-track his projects.",
        "Third payment dispute this quarter. Watch before approving refunds.",
        "Requested manual listing on his behalf — not comfortable with the app.",
        "Recycled SIM case: old account archived, this is the new owner of the number.",
        "Asked for a GST invoice under a different firm name. Explained the policy.",
      ]),
      created_at: daysAgo(int(1, 120)),
    };
  }));

await bulk("admin_messages", ["profile_id", "channel", "subject", "body", "sent_by", "sent_by_name", "delivered_at", "created_at"],
  Array.from({ length: 40 }, () => {
    const st = pick(actingStaff);
    const at = daysAgo(int(1, 90));
    return {
      profile_id: pick(users).id, channel: pick(["in_app", "email", "sms", "whatsapp", "push"]),
      subject: pick(["About your listing", "Verification pending", "Payment update", "Account status"]),
      body: pick([
        "We have re-reviewed your listing and it is now live. Sorry for the delay.",
        "Your ID document is unreadable. Please upload a clearer photo.",
        "The refund has been processed. It reaches your bank in 5–7 working days.",
        "Your account suspension has been lifted. Your listings are live again.",
      ]),
      sent_by: st.id, sent_by_name: st.name, delivered_at: chance(0.9) ? at : null, created_at: at,
    };
  }));

await bulk("account_suspensions", ["profile_id", "reason", "days", "suspended_by", "lifted_at", "lifted_by", "created_at"],
  users.filter((u) => u.state === "suspended").map((u) => ({
    profile_id: u.id, reason: pick(["Repeated upheld reports", "Posting others' properties as own", "Abusive language in chat", "Payment chargeback"]),
    days: pick([7, 14, 30, null]), suspended_by: pick(actingStaff).id,
    lifted_at: null, lifted_by: null, created_at: daysAgo(int(1, 60)),
  })).concat(pickN(activeUsers, 6).map((u) => ({
    profile_id: u.id, reason: "Reported for a fake listing — later found genuine",
    days: 7, suspended_by: pick(actingStaff).id, lifted_at: daysAgo(int(1, 30)),
    lifted_by: pick(actingStaff).id, created_at: daysAgo(int(30, 90)),
  }))));

await bulk("device_bans", ["kind", "value", "profile_id", "reason", "banned_by", "expires_at", "lifted_at", "created_at"],
  Array.from({ length: 9 }, (_, i) => ({
    kind: i % 3 === 0 ? "ip" : "device",
    value: i % 3 === 0 ? `45.129.${int(1, 254)}.${int(1, 254)}` : `dev_${Math.random().toString(36).slice(2, 14)}`,
    profile_id: pick(users).id,
    reason: pick(["Bulk fake signups", "Repeated scam listings", "OTP flooding", "Ban evasion"]),
    banned_by: pick(actingStaff.filter((s) => s.level === "super")).id,
    expires_at: i % 4 === 0 ? daysAgo(-30) : null, lifted_at: i === 8 ? daysAgo(2) : null,
    created_at: daysAgo(int(1, 100)),
  })));

await bulk("impersonation_sessions", ["staff_id", "staff_name", "profile_id", "reason", "ip", "started_at", "ended_at"],
  Array.from({ length: 14 }, (_, i) => {
    const st = pick(actingStaff);
    const start = daysAgo(int(0, 60), int(0, 20));
    return {
      staff_id: st.id, staff_name: st.name, profile_id: pick(users).id,
      reason: pick(["Reproducing a checkout bug reported on a ticket", "Verifying a missing listing slot", "Chat not loading — support ticket", "Plan quota mismatch"]),
      ip: "103.21.44.12", started_at: start,
      ended_at: i === 0 ? null : new Date(start.getTime() + 36e5 * (int(1, 20) / 10)),
    };
  }));

// audit log — every action type the design shows
const AUDIT_ACTIONS = [
  ["Approve", "listing", "Listing approved", false],
  ["Reject", "listing", "Rejected — Duplicate listing", false],
  ["Request changes", "listing", "Changes requested on 2 fields", false],
  ["Edit", "listing", "Price changed", false],
  ["Suspend", "user", "Suspended 7 days — repeated reports", true],
  ["Lift suspension", "user", "Suspension lifted", true],
  ["Role change", "user", "Role changed owner → broker", true],
  ["Refund", "payment", "Refunded — technical failure", true],
  ["Grant", "user", "Trial granted (14 days)", false],
  ["Adjust balance", "user", "+10 proposals added", false],
  ["Impersonate", "user", "Impersonation started", true],
  ["Export", "export", "Exported users CSV", true],
  ["Flag change", "flag", "Feature flag toggled", true],
  ["Coupon", "coupon", "Coupon created", false],
  ["Plan edit", "plan", "Plan price changed", true],
  ["Verification", "user", "RERA verification approved", false],
  ["Boost approve", "boost", "Boost approved", false],
  ["Boost reject", "boost", "Boost rejected — auto refund", true],
  ["Report action", "report", "Entity hidden after report", false],
  ["Ticket close", "ticket", "Ticket closed", false],
  ["Dispute resolve", "dispute", "Dispute resolved — no liability", true],
  ["Banner schedule", "banner", "Feed banner scheduled for Rajkot", false],
  ["Broadcast", "broadcast", "Broadcast sent to 2,480 users", true],
  ["Master data", "location", "Area added: Shital Park", false],
  ["Delete", "user", "User soft-deleted", true],
];
const auditRows = [];
for (let i = 0; i < 620; i++) {
  const [action, entity, summary, sensitive] = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
  const st = pick(actingStaff);
  const ent = entity === "listing" ? pick(listings) : entity === "user" ? pick(users) : null;
  const isEdit = action === "Edit" || action === "Plan edit";
  auditRows.push({
    actor_id: st.id, actor_name: st.name,
    actor_role: st.level === "super" ? "Super Admin" : st.level === "admin" ? "Admin" : "Staff",
    action, entity_type: entity, entity_id: ent?.id ?? null,
    entity_label: entity === "listing" ? `Listing · ${ent.title}` : entity === "user" ? `User · ${ent.name}` : `${entity} #${int(100, 9999)}`,
    summary, diff: isEdit ? { price_paise: { old: 8500000000, new: 7800000000 } } : null,
    ip: pick(["103.21.44.12", "49.36.180.55", "27.109.12.9"]),
    device: pick(["Chrome/Mac", "Chrome/Windows", "Safari/iPhone"]),
    is_sensitive: sensitive,
    case_ref: i % 97 === 0 ? `RJT/CYB/2026/${int(100, 900)}` : null,
    preserved: i % 97 === 0,
    created_at: daysAgo(int(0, 180), int(0, 23)),
  });
}
await bulk("admin_audit_log",
  ["actor_id", "actor_name", "actor_role", "action", "entity_type", "entity_id", "entity_label",
    "summary", "diff", "ip", "device", "is_sensitive", "case_ref", "preserved", "created_at"],
  auditRows);

// ================================================ 15. SYSTEM / OBSERVABILITY
console.log("seeding system + analytics…");
await bulk("cron_jobs", ["code", "name", "schedule", "description", "enabled", "last_run_at", "last_status", "last_duration_ms", "next_run_at", "failure_count"],
  D.CRON_JOBS.map(([code, name, schedule, description], i) => ({
    code, name, schedule, description, enabled: i !== 15,
    last_run_at: hoursAgo(int(1, 26)), last_status: i === 7 ? "failed" : i === 11 ? "running" : "success",
    last_duration_ms: int(400, 18000), next_run_at: new Date(NOW.getTime() + 36e5 * int(1, 24)),
    failure_count: i === 7 ? 2 : 0,
  })), { ret: "code" });

const cronRunRows = [];
for (const [code] of D.CRON_JOBS) {
  for (let d = 0; d < 30; d++) {
    const start = daysAgo(d, 8);
    const failed = chance(0.04);
    const dur = int(300, 20000);
    cronRunRows.push({
      job_code: code, started_at: start, finished_at: new Date(start.getTime() + dur),
      status: failed ? "failed" : "success", duration_ms: dur, processed: int(0, 800),
      error: failed ? pick(["Redis connection reset", "Timeout waiting for storage", "Deadlock detected, retried"]) : null,
      triggered_by: chance(0.05) ? "admin" : "schedule",
    });
  }
}
await bulk("cron_runs", ["job_code", "started_at", "finished_at", "status", "duration_ms", "processed", "error", "triggered_by"], cronRunRows);

await bulk("health_checks", ["component", "status", "detail", "latency_ms", "checked_at"],
  ["api", "database", "redis", "storage", "queues"].flatMap((c) => Array.from({ length: 6 }, (_, i) => ({
    component: c, status: c === "redis" && i === 0 ? "degraded" : "healthy",
    detail: c === "api" ? "142ms avg" : c === "database" ? "12ms" : c === "redis" ? "4 workers" : c === "storage" ? "98% CDN hit rate" : "5 queues",
    latency_ms: int(4, 220), checked_at: hoursAgo(i),
  }))));

await bulk("queue_depths", ["queue", "depth", "workers", "oldest_age_seconds", "checked_at"],
  [["image_processing", 12, 2], ["notifications", 48, 2], ["matching", 0, 1], ["emails", 6, 1], ["stories", 0, 1]]
    .flatMap(([queue, depth, workers]) => Array.from({ length: 4 }, (_, i) => ({
      queue, depth: Math.max(0, depth + int(-4, 8)), workers, oldest_age_seconds: int(0, 400), checked_at: hoursAgo(i),
    }))));

await bulk("backups", ["kind", "status", "size_bytes", "started_at", "finished_at", "restore_drill_at", "note"],
  Array.from({ length: 35 }, (_, i) => {
    const s = daysAgo(i, 9);
    return {
      kind: i % 30 === 0 ? "monthly" : "daily", status: i === 9 ? "failed" : "success",
      size_bytes: int(180, 420) * 1024 * 1024, started_at: s, finished_at: new Date(s.getTime() + int(60, 400) * 1000),
      restore_drill_at: i === 0 ? dateStr(daysAgo(24)) : null,
      note: i === 9 ? "Storage quota exceeded — retried successfully next day" : null,
    };
  }));

await bulk("anomaly_events", ["kind", "severity", "message", "link_screen", "metric", "detected_at", "dismissed_at", "dismissed_by"],
  [
    ["payment_failure_spike", "error", "Payment failure spike — 14 failures in the last hour (usual: 2)", "payments", { count: 14, baseline: 2 }, 0.5, false],
    ["otp_spike", "warning", "OTP request spike from 3 IPs — possible bot activity", "settings", { ips: 3, requests: 214 }, 1.5, false],
    ["report_spike", "warning", "Report spike — 5 reports on one listing", "reports", { listing_reports: 5 }, 3, false],
    ["signup_drop", "warning", "Signups down 46% vs the same day last week", "analytics", { delta: -46 }, 26, true],
    ["queue_backlog", "error", "Notification queue backlog above 500 for 20 minutes", "cron", { depth: 540 }, 50, true],
    ["boost_cap", "warning", "Rajkot boost cap reached — new boosts are queued", "settings", { cap: 60 }, 74, true],
  ].map(([kind, severity, message, link, metric, hrs, dismissed]) => ({
    kind, severity, message, link_screen: link, metric, detected_at: hoursAgo(hrs),
    dismissed_at: dismissed ? hoursAgo(hrs - 1) : null, dismissed_by: dismissed ? pick(actingStaff).id : null,
  })));

await bulk("admin_notifications", ["kind", "title", "body", "link_screen", "severity", "read_at", "created_at"],
  Array.from({ length: 26 }, (_, i) => ({
    kind: pick(["queue", "payment", "report", "staff", "system"]),
    title: pick(["New listing in the queue", "Refund requested", "Report spike on a listing", "Staff added", "Cron job failed", "Verification pending over 24h"]),
    body: pick(["Oldest item is now 26 hours old.", "₹2,999 refund waiting for approval.", "5 reports in 2 hours.", "Rohit Mehta was added as Staff.", "Orphan media cleanup failed."]),
    link_screen: pick(["listings", "payments", "reports", "staff", "cron"]),
    severity: pick(["info", "warning", "error"]),
    read_at: i > 8 ? hoursAgo(int(1, 40)) : null, created_at: hoursAgo(int(0, 72)),
  })));

// analytics
const evRows = [];
for (let i = 0; i < 4200; i++) {
  const u = pick(users);
  evRows.push({
    name: pick(D.ANALYTICS_EVENTS), profile_id: u.id,
    entity_type: pick(["listing", "requirement", "plan", "boost", "thread"]),
    entity_id: pick(listings).id, city_id: u.city.id,
    props: { source: pick(["feed", "search", "profile", "notification", "deeplink"]), device: pick(["android", "ios", "desktop"]) },
    created_at: daysAgo(int(0, 120), int(0, 23)),
  });
}
await bulk("analytics_events", ["name", "profile_id", "entity_type", "entity_id", "city_id", "props", "created_at"], evRows);

const DAYS = 180;
const dailyRows = [];
const funnelRows = [];
const cityDaily = [];
const storyAgg = [];
for (let d = DAYS; d >= 0; d--) {
  const day = dateStr(daysAgo(d));
  const wk = daysAgo(d).getDay();
  const mult = wk === 0 ? 0.7 : wk === 6 ? 0.85 : 1;
  const growth = 1 + (DAYS - d) / 400;
  const signups = Math.round(int(14, 46) * mult * growth);
  const listingsC = Math.round(int(9, 34) * mult * growth);
  const inquiries = Math.round(int(60, 190) * mult * growth);
  const planRev = int(3000, 26000) * 100;
  const boostRev = int(500, 9000) * 100;
  const topRev = int(0, 3500) * 100;
  dailyRows.push({
    day, signups, listings_created: listingsC, listings_live: Math.round(listingsC * 0.72),
    inquiries, leads: Math.round(inquiries * 0.42),
    revenue_paise: planRev + boostRev + topRev, plan_revenue_paise: planRev,
    boost_revenue_paise: boostRev, topup_revenue_paise: topRev,
    payment_failures: int(0, 14),
  });
  funnelRows.push({
    day, visitors: Math.round(signups * int(18, 34)), signups,
    plan_bought: Math.round(signups * 0.28), listing_posted: Math.round(signups * 0.22),
    lead_received: Math.round(signups * 0.14),
  });
  for (const c of CITY_LIST) {
    const share = c.name === "Rajkot" ? 0.55 : 0.05;
    cityDaily.push({
      day, city_id: c.id, signups: Math.round(signups * share),
      listings: Math.round(listingsC * share), inquiries: Math.round(inquiries * share),
      revenue_paise: Math.round((planRev + boostRev) * share),
    });
    storyAgg.push({ day, city_id: c.id, impressions: Math.round(int(400, 3200) * share * 4), taps: Math.round(int(20, 260) * share * 4) });
  }
}
await bulk("platform_daily_stats",
  ["day", "signups", "listings_created", "listings_live", "inquiries", "leads", "revenue_paise",
    "plan_revenue_paise", "boost_revenue_paise", "topup_revenue_paise", "payment_failures"],
  dailyRows, { ret: "day" });
await bulk("funnel_daily", ["day", "visitors", "signups", "plan_bought", "listing_posted", "lead_received"], funnelRows, { ret: "day" });
await bulk("city_daily_stats", ["day", "city_id", "signups", "listings", "inquiries", "revenue_paise"], cityDaily, { ret: "day" });
await bulk("story_aggregates", ["day", "city_id", "impressions", "taps"], storyAgg, { ret: "day" });
await bulk("metric_definitions", ["key", "label", "definition"], D.METRIC_DEFS.map(([key, label, definition]) => ({ key, label, definition })), { ret: "key" });

// reconciliation
const reconRuns = await bulk("reconciliation_runs",
  ["window_start", "window_end", "platform_count", "gateway_count", "matched", "mismatched", "status", "ran_at"],
  Array.from({ length: 16 }, (_, i) => {
    const end = hoursAgo(i);
    const pc = int(20, 90), mism = i % 5 === 0 ? int(1, 4) : 0;
    return {
      window_start: hoursAgo(i + 1), window_end: end, platform_count: pc,
      gateway_count: pc + (mism ? int(-2, 2) : 0), matched: pc - mism, mismatched: mism,
      status: mism ? "mismatch" : "ok", ran_at: end,
    };
  }));
await bulk("reconciliation_items", ["run_id", "payment_id", "gateway_ref", "platform_paise", "gateway_paise", "state", "rechecked_at", "note"],
  reconRuns.flatMap((runId, i) => Array.from({ length: 5 }, (_, k) => {
    const p = pick(payments);
    const mismatch = i % 5 === 0 && k === 0;
    return {
      run_id: runId, payment_id: p.id, gateway_ref: p.rzp,
      platform_paise: p.amount, gateway_paise: mismatch ? p.amount - 100 : p.amount,
      state: mismatch ? pick(["amount_mismatch", "missing_gateway", "missing_platform"]) : "matched",
      rechecked_at: mismatch && chance(0.5) ? hoursAgo(i) : null,
      note: mismatch ? "Flagged for manual re-check" : null,
    };
  })));

// ==================================================== 16. TRASH + EXPORTS
console.log("seeding trash + exports…");
await bulk("trash_items", ["entity_type", "entity_id", "label", "deleted_by_kind", "deleted_by", "deleted_by_name", "reason", "deleted_at", "purge_at", "restored_at", "restored_by"],
  [
    ...listings.filter((l) => l.status === "deleted").map((l) => ({
      entity_type: "listing", entity_id: l.id, label: l.title, deleted_by_kind: "user",
      deleted_by: l.u.id, deleted_by_name: l.u.name, reason: pick(["Sold offline", "Rented out", "Changed my mind"]),
      deleted_at: daysAgo(int(1, 28)), purge_at: daysAgo(-int(2, 29)), restored_at: null, restored_by: null,
    })),
    ...projects.filter((p) => p.status === "deleted").map((p) => ({
      entity_type: "project", entity_id: p.id, label: p.name, deleted_by_kind: "admin",
      deleted_by: pick(actingStaff).id, deleted_by_name: pick(actingStaff).name, reason: "Duplicate project",
      deleted_at: daysAgo(int(1, 25)), purge_at: daysAgo(-int(5, 29)), restored_at: null, restored_by: null,
    })),
    ...requirements.filter((r) => r.status === "deleted").map((r) => ({
      entity_type: "requirement", entity_id: r.id, label: `Requirement · ${r.type.label}`, deleted_by_kind: "user",
      deleted_by: r.u.id, deleted_by_name: r.u.name, reason: "Found a property", deleted_at: daysAgo(int(1, 20)),
      purge_at: daysAgo(-int(10, 29)), restored_at: null, restored_by: null,
    })),
    ...users.filter((u) => u.state === "deleted").map((u) => ({
      entity_type: "user", entity_id: u.id, label: "Deleted user", deleted_by_kind: "user",
      deleted_by: u.id, deleted_by_name: "self", reason: "Account closure request",
      deleted_at: daysAgo(int(1, 29)), purge_at: daysAgo(-int(1, 29)), restored_at: null, restored_by: null,
    })),
    ...threads.slice(0, 14).map((t) => ({
      entity_type: "chat", entity_id: t.id, label: `Chat: ${t.buyer.name} ↔ ${t.poster.name}`,
      deleted_by_kind: "user", deleted_by: t.buyer.id, deleted_by_name: t.buyer.name,
      reason: "Deleted by user", deleted_at: daysAgo(int(1, 26)), purge_at: daysAgo(-int(4, 29)),
      restored_at: null, restored_by: null,
    })),
    ...Array.from({ length: 20 }, () => ({
      entity_type: "photo", entity_id: pick(listings).id, label: `Photo set (${int(2, 8)})`,
      deleted_by_kind: "admin", deleted_by: pick(actingStaff).id, deleted_by_name: pick(actingStaff).name,
      reason: pick(["Watermarked images", "Photos of another property", "Low quality"]),
      deleted_at: daysAgo(int(1, 27)), purge_at: daysAgo(-int(3, 29)),
      restored_at: chance(0.15) ? daysAgo(int(1, 10)) : null, restored_by: chance(0.15) ? pick(actingStaff).id : null,
    })),
    ...Array.from({ length: 6 }, () => {
      const c = pick(coupons);
      return {
        entity_type: "coupon", entity_id: c.id, label: `Coupon ${c.code}`,
        deleted_by_kind: "admin", deleted_by: pick(actingStaff).id, deleted_by_name: pick(actingStaff).name,
        reason: "Superseded", deleted_at: daysAgo(int(1, 25)), purge_at: daysAgo(-int(5, 29)),
        restored_at: null, restored_by: null,
      };
    }),
  ]);

await bulk("exports", ["name", "entity", "filters", "format", "row_count", "status", "reason", "contains_personal_data", "file_key", "requested_by", "requested_by_name", "expires_at", "created_at"],
  [
    ["Users · Brokers in Rajkot", "users", { role: "broker", city: "Rajkot" }, "csv", 128, "ready", null, true],
    ["Payments · July", "payments", { month: "2026-07" }, "xlsx", 1204, "ready", "Monthly GST filing", true],
    ["Listings · Reported", "listings", { reported: true }, "csv", 24, "processing", null, false],
    ["Audit log · Q2", "audit", { from: "2026-04-01", to: "2026-06-30" }, "csv", 8420, "expired", "Internal compliance review", true],
    ["Finance · Refunds", "finance", { type: "refund" }, "xlsx", 12, "failed", null, false],
    ["Users · Suspended", "users", { state: "suspended" }, "csv", 12, "ready", "Trust & safety review", true],
    ["Payments · Chargebacks", "payments", { status: "chargeback" }, "csv", 7, "ready", "Bank dispute pack", true],
    ["Listings · Rajkot live", "listings", { city: "Rajkot", status: "live" }, "csv", 186, "ready", null, false],
    ["Audit log · Evidence RJT/CYB/2026", "audit", { case_ref: "RJT/CYB/2026/412" }, "csv", 340, "ready", "Police request — preserved", true],
    ["Users · Builders", "users", { role: "builder" }, "xlsx", 25, "expired", null, true],
    ["Finance · Reconciliation mismatches", "finance", { state: "mismatch" }, "csv", 9, "ready", null, false],
    ["Listings · Expired", "listings", { status: "expired" }, "csv", 42, "ready", null, false],
    ["Payments · Failed", "payments", { status: "failed" }, "csv", 96, "processing", null, true],
    ["Users · Trials granted", "users", { trial: true }, "csv", 22, "ready", null, true],
    ["Analytics · Funnel 180d", "analytics", { days: 180 }, "xlsx", 181, "ready", null, false],
    ["Support · Grievances", "tickets", { grievance: true }, "csv", 6, "ready", "Annual grievance report", true],
    ["Disputes · Resolved", "disputes", { status: "resolved" }, "csv", 8, "ready", null, true],
    ["Master data · Rajkot areas", "locations", { city: "Rajkot" }, "csv", 96, "ready", null, false],
  ].map(([name, entity, filters, format, rows, status, reason, pd], i) => {
    const st = pick(actingStaff);
    const at = daysAgo(int(0, 12), int(0, 20));
    return {
      name, entity, filters, format, row_count: rows, status, reason,
      contains_personal_data: pd, file_key: status === "ready" ? `exports/${BATCH}-${i}.${format}` : null,
      requested_by: st.id, requested_by_name: st.name,
      expires_at: status === "ready" ? new Date(at.getTime() + 48 * 36e5) : status === "expired" ? daysAgo(1) : null,
      created_at: at,
    };
  }));

// notifications so the user-side bell and the admin comm-log line up
await bulk("notifications", ["profile_id", "type", "title", "body", "category", "href", "read_at", "created_at", "last_event_at"],
  Array.from({ length: 420 }, () => {
    const u = pick(activeUsers);
    const t = pick(["listing_approved", "listing_rejected", "listing_changes_requested", "inquiry_received",
      "proposal_received", "payment_success", "payment_failed", "refund_processed", "boost_approved",
      "boost_rejected", "boost_expiring", "plan_expiring", "plan_expired", "trial_ending",
      "report_outcome", "suspension_lifted", "area_added", "requirement_expiring", "new_message", "price_drop"]);
    const at = daysAgo(int(0, 80), int(0, 23));
    return {
      profile_id: u.id, type: t,
      title: t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      body: pick(["Tap to see the details.", "Action needed on your side.", "No action needed."]),
      category: t.startsWith("listing") || t.startsWith("boost") ? "listing"
        : t.startsWith("payment") || t.startsWith("refund") || t.startsWith("plan") || t === "trial_ending" ? "payment"
          : t.startsWith("requirement") || t.startsWith("proposal") ? "requirement" : "inquiry",
      href: "/notifications", read_at: chance(0.55) ? at : null, created_at: at, last_event_at: at,
    };
  }), { shared: true });

// ------------------------------------------------------------------- summary
console.log("\n=== SEEDED ===");
const keys = Object.keys(counts).sort();
let total = 0;
for (const k of keys) { console.log(`  ${k.padEnd(28)} ${counts[k]}`); total += counts[k]; }
console.log(`  ${"TOTAL".padEnd(28)} ${total}`);
await sql.end();
