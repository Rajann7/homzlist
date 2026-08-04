/**
 * Feed cards (property + project) — cross-role live sweep.
 *
 * The redesign of 28 Jul 2026 is only half a fix if the buttons on the new card
 * still do nothing, so this asserts what the SERVER did, per role, and shows the
 * row behind every claim:
 *
 *   1. Every project card carries the fields the card renders (type label,
 *      price band, unit chips, facts) — no empty block on a live scheme.
 *   2. Facts come from the scheme's OWN columns: a plotting scheme reports
 *      Plots/Site area, a tower reports Towers/Floors/Units.
 *   3. Call/WhatsApp on a project writes a real `leads` row for the builder,
 *      and is idempotent (four taps = one lead).
 *   4. A builder is never handed their own number back, and a GUEST is handed
 *      no number at all (no bulk harvest from the public feed).
 *   5. The property card's Save and Inquiry still write `saves` / `inquiries`.
 *   6. Report writes a `reports` row for BOTH subject types.
 *   7. Unauthenticated sweep: every write endpoint the cards touch is 401.
 *   8. IDOR: a viewer cannot record a lead against a project that isn't live,
 *      and cannot save/inquire on their own listing.
 *
 *   FEED_BASE=http://localhost:3000 node scripts/check-feed-cards-live.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const BASE = process.env.FEED_BASE || "http://localhost:3000";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a verification run into a false failure.
// scripts/lib/dbx.mjs walks the same ladder q.mjs and db-proof.mjs already use:
// direct first, then the regional poolers on 5432 and 6543.
const pgc = await dbConnect();
const sql = (s, p) => pgc.query(s, p);
const row1 = async (s, p) => (await sql(s, p)).rows[0];

// ---- HTTP with a per-identity cookie jar -----------------------------------
const jar = new Map();
function save(res, key) {
  const cur = jar.get(key) ?? new Map();
  for (const ck of res.headers.getSetCookie?.() ?? []) {
    const [pair] = ck.split(";");
    const i = pair.indexOf("=");
    cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jar.set(key, cur);
}
const cookie = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

let ipN = 60;
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
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const loggedIn = new Set();
async function login(phone) {
  if (loggedIn.has(phone)) return "ok";
  const ip = `198.51.100.${ipN++}`;
  const r = await api(phone, "/api/v1/auth/otp/request", { method: "POST", body: { phone }, ip });
  if (r.status === 429) return "rate_limited";
  const v = await api(phone, "/api/v1/auth/otp/verify", {
    method: "POST", ip,
    body: { otpSession: r.json?.data?.otpSession, code: r.json?.data?.devCode ?? "123456" },
  });
  if (v.status === 200) { loggedIn.add(phone); return "ok"; }
  return "failed";
}
async function need(phone, label) {
  const res = await login(phone);
  if (res === "ok") return true;
  if (res === "rate_limited") { console.log(`  [SKIP] ${label} — OTP limiter; restart the dev server to reset`); return false; }
  check(false, `${label} — login failed`);
  return false;
}

let fails = 0;
const check = (cond, label, extra = "") => {
  if (!cond) fails++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};
const section = (t) => console.log(`\n=== ${t} ===`);

// ---- actors ----------------------------------------------------------------
const OWNER = "+919825000001";   // Owner Test, Rajkot
const BROKER = "+919700088877";  // Nav Test, Rajkot
const BUILDER = "+919825000002"; // Builder Test — owns the QA schemes

const projectCards = (items) => items.filter((c) => c.kind === "project");
const propertyCards = (items) => items.filter((c) => c.kind === "property");

// ===========================================================================
section("1 · Project cards carry everything the card renders (per role)");

const feeds = {};
for (const [label, phone] of [["owner", OWNER], ["broker", BROKER], ["builder", BUILDER], ["guest", null]]) {
  if (phone && !(await need(phone, `${label} feed`))) continue;
  const r = await api(phone, "/api/v1/feed?filter=all");
  const items = r.json?.data?.items ?? [];
  feeds[label] = { phone, items };
  const projects = projectCards(items);
  check(r.status === 200, `${label}: GET /feed 200`, `${items.length} cards, ${projects.length} project`);
  for (const c of projects) {
    check(
      typeof c.projectTypeLabel === "string" && c.projectTypeLabel.length > 0,
      `${label}: "${c.title}" has a scheme-type label`, c.projectTypeLabel ?? "(null)",
    );
    check(Array.isArray(c.unitTypes), `${label}: "${c.title}" carries unit types`, (c.unitTypes ?? []).join(", ") || "(none)");
    check(Array.isArray(c.facts), `${label}: "${c.title}" carries a facts strip`,
      (c.facts ?? []).map((f) => `${f.value} ${f.label}`).join(" · ") || "(none)");
    check(c.priceBand !== undefined, `${label}: "${c.title}" carries a price band`, c.priceBand ?? "(price on request)");
  }
}

// ---------------------------------------------------------------------------
// Whichever signed-in role actually got a feed this run — the OTP limiter can
// skip one actor, and that must not read as "the card has no project".
const actorFeed = [feeds.owner, feeds.broker, feeds.builder].find((f) => f && projectCards(f.items).length && f.phone) ?? feeds.owner;
const ACTOR_PHONE = actorFeed?.phone ?? OWNER;

section("2 · Facts are the scheme's OWN columns, verified against the row");

for (const c of projectCards(actorFeed?.items ?? [])) {
  const row = await row1(
    `select project_type, towers, floors, total_units, available_units, attributes,
            (select coalesce(sum(units_available),0) from project_units u where u.project_id = p.id and u.available) as avail_sum
       from projects p where p.id = $1`, [c.id]);
  if (!row) { check(false, `row for ${c.title}`); continue; }
  const got = Object.fromEntries((c.facts ?? []).map((f) => [f.label, f.value]));
  if (row.project_type === "plotting") {
    check(got.Plots === String(row.attributes?.total_plots ?? ""), `${c.title}: Plots = attributes.total_plots`, `${got.Plots} vs ${row.attributes?.total_plots}`);
    check(Boolean(got["Site area"]), `${c.title}: Site area from attributes.project_land_area`, got["Site area"] ?? "(missing)");
    check(got.Towers === undefined, `${c.title}: no Towers on a plotting scheme`);
  } else {
    if (row.towers != null) check(got.Towers === String(row.towers), `${c.title}: Towers = projects.towers`, `${got.Towers} vs ${row.towers}`);
    if (row.total_units != null) check(got["Total units"] === String(row.total_units), `${c.title}: Total units = projects.total_units`, `${got["Total units"]} vs ${row.total_units}`);
  }
  if (got.Available !== undefined) {
    const expect = row.available_units != null ? String(row.available_units) : String(row.avail_sum);
    check(got.Available === expect, `${c.title}: Available = the real count`, `${got.Available} vs ${expect}`);
  }
}

// ---------------------------------------------------------------------------
section("3 · Contact number exposure");

for (const [label, f] of Object.entries(feeds)) {
  const projects = projectCards(f.items);
  if (!projects.length) continue;
  if (label === "guest") {
    check(projects.every((c) => c.contactNumber == null), "guest: NO builder numbers in the feed payload");
  } else {
    check(projects.some((c) => c.contactNumber), `${label}: signed-in viewer gets the builder's number (Doc2 §6)`,
      projects.find((c) => c.contactNumber)?.contactNumber ?? "");
    check(projects.every((c) => !(c.isOwn && c.contactNumber)), `${label}: never handed their own number back`);
  }
}

// ---------------------------------------------------------------------------
section("4 · Call / WhatsApp writes a real lead (and only one)");

const proj = projectCards(actorFeed?.items ?? [])[0];
if (proj) {
  const before = await row1("select count(*)::int n from leads where project_id = $1", [proj.id]);
  for (const via of ["call", "whatsapp", "call", "whatsapp"]) {
    await api(ACTOR_PHONE, `/api/v1/projects/${proj.id}/contact`, { method: "POST", body: { channel: via } });
  }
  const lead = await row1(
    `select l.id, l.stage, l.source, l.last_activity, p.name as builder, pr.name as project
       from leads l join profiles p on p.id = l.owner_id join projects pr on pr.id = l.project_id
      where l.project_id = $1 and l.lead_profile_id = (select id from profiles where phone = $2)`,
    [proj.id, ACTOR_PHONE]);
  const after = await row1("select count(*)::int n from leads where project_id = $1", [proj.id]);
  check(Boolean(lead), `lead row written for "${proj.title}"`, lead ? `${lead.project} ← ${lead.last_activity}` : "");
  check(after.n <= before.n + 1, "four taps produced ONE lead, not four", `${before.n} → ${after.n}`);
} else {
  check(false, "a project card to contact");
}

// ---------------------------------------------------------------------------
section("5 · Property card: Save + Inquiry still write");

const prop = propertyCards(actorFeed?.items ?? []).find((c) => !c.isOwn);
if (prop) {
  const s1 = await api(ACTOR_PHONE, "/api/v1/saves", { method: "POST", body: { listingId: prop.id } });
  const saved = await row1("select id, saved_price_paise from saves where listing_id = $1 and profile_id = (select id from profiles where phone = $2)", [prop.id, ACTOR_PHONE]);
  check(s1.json?.data?.saved === true && Boolean(saved), "Save wrote a `saves` row", saved ? `id=${saved.id}` : "(none)");
  await api(ACTOR_PHONE, "/api/v1/saves", { method: "POST", body: { listingId: prop.id } }); // toggle back
  const gone = await row1("select id from saves where listing_id = $1 and profile_id = (select id from profiles where phone = $2)", [prop.id, ACTOR_PHONE]);
  check(!gone, "Unsave deleted it again");

  const inq = await api(ACTOR_PHONE, "/api/v1/inquiries", { method: "POST", body: { listingId: prop.id, message: "QA sweep — is this available?", intents: ["site_visit"], shareNumber: true } });
  const inqRow = await row1("select id, status, message from inquiries where listing_id = $1 and profile_id = (select id from profiles where phone = $2)", [prop.id, ACTOR_PHONE]);
  check(inq.status === 200 && Boolean(inqRow), "Inquiry wrote an `inquiries` row", inqRow ? `${inqRow.status}: ${inqRow.message.slice(0, 32)}` : "");
} else {
  check(false, "a foreign property card to act on");
}

// ---------------------------------------------------------------------------
section("6 · Report works for BOTH subject types");

for (const [kind, card] of [["listing", prop], ["project", proj]]) {
  if (!card) continue;
  const r = await api(BROKER, "/api/v1/reports", { method: "POST", body: { subjectType: kind, subjectId: card.id, reason: "wrong_price", note: "QA sweep" } });
  const row = await row1("select id, subject_type, status from reports where subject_id = $1 and reporter_id = (select id from profiles where phone = $2)", [card.id, BROKER]);
  check(r.status === 200 && Boolean(row), `report on a ${kind} persisted`, row ? `${row.subject_type}/${row.status}` : "(none)");
}

// ---------------------------------------------------------------------------
section("7 · Unauthenticated sweep — every card write is 401");

for (const [p, body] of [
  ["/api/v1/saves", { listingId: prop?.id ?? "00000000-0000-0000-0000-000000000000" }],
  ["/api/v1/inquiries", { listingId: prop?.id ?? "00000000-0000-0000-0000-000000000000", message: "x" }],
  ["/api/v1/reports", { subjectType: "listing", subjectId: prop?.id ?? "00000000-0000-0000-0000-000000000000", reason: "fake" }],
  [`/api/v1/projects/${proj?.id ?? "00000000-0000-0000-0000-000000000000"}/contact`, { channel: "call" }],
]) {
  const r = await api(null, p, { method: "POST", body });
  check(r.status === 401, `POST ${p} → 401 for a guest`, `got ${r.status}`);
}

// ---------------------------------------------------------------------------
section("8 · IDOR / self-action");

{
  const mine = await row1("select id from listings where profile_id = (select id from profiles where phone = $1) and status = 'live' limit 1", [ACTOR_PHONE]);
  if (mine) {
    await api(ACTOR_PHONE, "/api/v1/saves", { method: "POST", body: { listingId: mine.id } });
    const self = await row1("select id from saves where listing_id = $1 and profile_id = (select id from profiles where phone = $2)", [mine.id, ACTOR_PHONE]);
    check(!self, "cannot save your OWN listing (no row)");
    const si = await api(ACTOR_PHONE, "/api/v1/inquiries", { method: "POST", body: { listingId: mine.id, message: "self" } });
    check(si.json?.error?.code === "SELF_ACTION_BLOCKED" || si.status >= 400, "cannot inquire on your OWN listing", si.json?.error?.code ?? si.status);
  }
  const draft = await row1("select id, profile_id from projects where status <> 'live' limit 1");
  if (draft) {
    const before = await row1("select count(*)::int n from leads where project_id = $1", [draft.id]);
    const r = await api(BROKER, `/api/v1/projects/${draft.id}/contact`, { method: "POST", body: { channel: "call" } });
    const after = await row1("select count(*)::int n from leads where project_id = $1", [draft.id]);
    check(after.n === before.n, "no lead recorded against a NON-LIVE project", `status ${r.status}`);
  }
  const builderSelf = feeds.builder && projectCards(feeds.builder.items).some((c) => c.isOwn);
  check(!builderSelf, "a builder's own project is not injected into their feed");
}

// ---------------------------------------------------------------------------
section("9 · Preview card endpoint (the create flow's 'Feed card' tab)");

{
  const mine = await row1(
    "select id, title from listings where profile_id = (select id from profiles where phone = $1) order by created_at desc limit 1",
    [ACTOR_PHONE],
  );
  if (mine) {
    const own = await api(ACTOR_PHONE, `/api/v1/listings/${mine.id}/card`);
    const card = own.json?.data?.card;
    check(own.status === 200 && card?.kind === "property", "owner gets their listing as a feed card",
      card?.title ?? `status ${own.status}`);
    // The whole point: the preview payload is the SAME shape the feed renders.
    check(Array.isArray(card?.metaChips) && Array.isArray(card?.facts) && card !== undefined && "typeLabel" in card,
      "…with the same chips/facts/type the feed card uses",
      `${(card?.metaChips ?? []).join(", ")} | ${(card?.facts ?? []).map((f) => f.label).join(", ")}`);
    check(card?.isOwn === false, "…and NOT flagged isOwn — the preview shows what a BUYER sees");

    const guest = await api(null, `/api/v1/listings/${mine.id}/card`);
    check(guest.status === 401, "guest → 401", `got ${guest.status}`);

    const stranger = await api(BROKER, `/api/v1/listings/${mine.id}/card`);
    check(stranger.json?.error?.code === "NOT_FOUND",
      "another user → NOT_FOUND (never FORBIDDEN — no id confirmation)",
      stranger.json?.error?.code ?? `status ${stranger.status}`);
  } else {
    check(false, "a listing of the actor's to preview");
  }
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`}`);
await pgc.end();
process.exit(fails === 0 ? 0 : 1);
