/**
 * Module 9 (Boost placement) cross-role live sweep.
 *
 * Logs in through the real OTP flow and asserts what the SERVER returned, not
 * what a screen looked like. The things it exists to prove:
 *
 *   1. TARGETING IS REAL — a Rajkot-city boost tops a Rajkot viewer's feed and is
 *      absent from a Surat viewer's; a state/All-India boost on an out-of-city
 *      listing reaches both. (Before Module 9 the first was wrong and the second
 *      was impossible.)
 *   2. PROMOTED AGREES WITH POSITION — a card tagged Promoted is a card that was
 *      actually hoisted, for this viewer.
 *   3. ADMIN APPROVAL WORKS — staff approves a pending boost, it goes active with
 *      a real window, and a non-staff caller gets 404 from the same endpoint.
 *   4. REJECT REFUNDS, AND THE RACE IS SEALED — approving a boost whose listing
 *      went sold in the meantime rejects + refunds instead of going live.
 *   5. NO ANALYTICS LEAK — the boost payload carries status only (Doc2 §13).
 *   6. IDOR — one seller cannot read, cancel or renew another's boost.
 *
 * Read-only except where it says otherwise; the writes it does make are undone at
 * the end (`node scripts/seed-module9.mjs` restores a clean state regardless).
 *
 *   BOOST_BASE=http://localhost:3000 node scripts/check-boost-live.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const BASE = process.env.BOOST_BASE || "http://localhost:3000";

// The sweep CONSUMES states (it approves, rejects, pauses, sells). Reseed first so
// every run starts from the same known set rather than from the last run's
// leftovers — otherwise a re-run reports failures that are really just used-up
// fixtures. Skip with BOOST_NO_SEED=1.
if (process.env.BOOST_NO_SEED !== "1") {
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["scripts/seed-module9.mjs"], { stdio: ["ignore", "ignore", "inherit"] });
  console.log("(reseeded module 9 states)\n");
}

// ---- DB handle, for the "show me the row" half of every assertion ----------
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

/**
 * Run a step that SELLS a listing, and put the listing back whatever happens.
 *
 * Several steps below need a boosted listing to go sold so the auto-stop and
 * refund paths have something to react to. They used to restore the row on the
 * happy path only — a `finally`-less restore — and one step never restored at
 * all. Any failed assertion in between therefore left a real listing archived
 * and sold for good: nine of them had piled up, which then made the NEXT run
 * fail on "boost IS promoted for a Rajkot viewer", because the listing behind
 * that boost was no longer live. A check that damages the data it inspects
 * reports on a world it created.
 */
async function withListingRestored(listingId, step) {
  const before = await row1(
    `select status, availability, sold_at, archived_at from listings where id=$1`, [listingId]);
  try {
    return await step();
  } finally {
    if (before) {
      await sql(
        `update listings set status=$2, availability=$3, sold_at=$4, archived_at=$5, updated_at=now()
          where id=$1`,
        [listingId, before.status, before.availability, before.sold_at, before.archived_at],
      );
    }
  }
}

// ---- HTTP with a per-identity cookie jar -----------------------------------
const jar = new Map();
function save(res, key) {
  const set = res.headers.getSetCookie?.() ?? [];
  const cur = jar.get(key) ?? new Map();
  for (const ck of set) {
    const [pair] = ck.split(";");
    const i = pair.indexOf("=");
    cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jar.set(key, cur);
}
const cookie = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

let ipN = 30;
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
  try { json = await res.json(); } catch { /* non-JSON (a page) */ }
  return { status: res.status, json };
}
const loggedIn = new Set();
/**
 * Log in, distinguishing "the limiter said no" from "auth is broken".
 *
 * The OTP limiter is 5/hour PER NUMBER and the KV driver is in-memory, so a
 * second sweep against the same dev server hits 429 — which previously surfaced
 * as a stream of 401s in later sections and read exactly like an authorization
 * bug. Now it says so.
 */
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
/** Log in or say plainly why the block below can't run. */
async function need(phone, label) {
  const res = await login(phone);
  if (res === "ok") return true;
  if (res === "rate_limited") { console.log(`  [SKIP] ${label} — OTP limiter (5/hr per number); restart the dev server to reset`); return false; }
  check(false, `${label} — login failed`);
  return false;
}

let fails = 0;
const check = (cond, label, extra = "") => {
  if (!cond) fails++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};

// ---------------------------------------------------------------------------
// Fixtures straight out of the boosts table
// ---------------------------------------------------------------------------
const cityId = Object.fromEntries(
  (await sql(`select name, id from locations where level='city'`)).rows.map((r) => [r.name, r.id]),
);

const viewers = {
  rajkot: await row1(`select phone, name from profiles where city_id=$1 and phone is not null
                       and not exists (select 1 from boosts b where b.profile_id = profiles.id and b.status='active')
                      limit 1`, [cityId.Rajkot]),
  // A seller with live inventory — the boost PICKER has nothing to assert about an
  // empty account.
  seller: await row1(`select p.phone, p.name from profiles p
                       where p.phone is not null
                         and (select count(*) from listings l
                               where l.profile_id=p.id and l.status='live' and l.availability='available') >= 2
                       order by (select count(*) from listings l2 where l2.profile_id=p.id) desc limit 1`),
  surat: await row1(`select phone, name from profiles where city_id=$1 and phone is not null limit 1`, [cityId.Surat]),
  ahmedabad: await row1(`select phone, name from profiles where city_id=$1 and phone is not null limit 1`, [cityId.Ahmedabad]),
};

const staff = await row1(`select p.phone, p.name from staff s join profiles p on p.id=s.profile_id where s.is_active limit 1`);

/** The seeded active boosts, by targeting scope. */
const active = (await sql(
  `select b.id, b.listing_id, b.subject_kind, b.targeting, b.target_label, b.target_city_id,
          b.starts_at, b.profile_id, p.phone as seller_phone, l.city_id as subject_city
     from boosts b
     join profiles p on p.id = b.profile_id
     left join listings l on l.id = b.listing_id
    where b.status='active' and b.starts_at <= now() and (b.ends_at is null or b.ends_at > now())
    order by b.starts_at`,
)).rows;

console.log(`BASE=${BASE}`);
console.log(`viewers: rajkot=${viewers.rajkot?.name} surat=${viewers.surat?.name} ahmedabad=${viewers.ahmedabad?.name} seller=${viewers.seller?.name}`);
console.log(`staff:   ${staff?.name} (${staff?.phone})`);
console.log(`active boosts: ${active.length} (${active.map((b) => b.targeting).join(", ")})\n`);

// ---------------------------------------------------------------------------
// 1. Guest — the public feed still ranks boosts
// ---------------------------------------------------------------------------
console.log("== Guest — feed / stories / search ==");
{
  const f = await api(null, "/api/v1/feed");
  const items = f.json?.data?.items ?? [];
  const promoted = items.filter((i) => i.promoted);
  check(f.status === 200 && items.length > 0, "feed loads for a guest", `${items.length} cards`);
  check(promoted.length > 0, "guest feed carries Promoted cards (no viewer city → national feed)", `${promoted.length} promoted`);
  // Every promoted card must be at the FRONT — the tag is meaningless otherwise.
  const firstOrganic = items.findIndex((i) => !i.promoted);
  const promotedAfterOrganic = firstOrganic >= 0 && items.slice(firstOrganic).some((i) => i.promoted);
  check(!promotedAfterOrganic, "every Promoted card is above every organic one (FIFO top slots)");

  const s = await api(null, "/api/v1/search?q=Rajkot");
  const sItems = s.json?.data?.sections?.flatMap((x) => x.items) ?? [];
  check(s.status === 200, "search loads for a guest", `${sItems.length} results`);
}

// ---------------------------------------------------------------------------
// 2. Targeting — the whole point of Module 9
// ---------------------------------------------------------------------------
console.log("\n== Targeting (Doc2 §13) ==");
const cityBoost = active.find((b) => b.targeting === "city" && b.target_city_id === cityId.Rajkot && b.subject_kind === "listing");
const wideBoost = active.find((b) => (b.targeting === "state" || b.targeting === "india") && b.subject_kind === "listing"
                                  && b.subject_city && b.subject_city !== cityId.Rajkot);

async function promotedIdsFor(phone) {
  if ((await login(phone)) !== "ok") return null;
  const f = await api(phone, "/api/v1/feed?limit=30");
  const items = f.json?.data?.items ?? [];
  return { all: items.map((i) => i.id), promoted: items.filter((i) => i.promoted).map((i) => i.id) };
}

const rajkotFeed = await promotedIdsFor(viewers.rajkot.phone);
const suratFeed = await promotedIdsFor(viewers.surat.phone);
check(!!rajkotFeed && !!suratFeed, "logged in as a Rajkot and a Surat viewer");

if (cityBoost && rajkotFeed && suratFeed) {
  const ownedByViewer = cityBoost.seller_phone === viewers.rajkot.phone;
  check(
    ownedByViewer || rajkotFeed.promoted.includes(cityBoost.listing_id),
    "Rajkot-city boost IS promoted for a Rajkot viewer",
    `boost=${cityBoost.id.slice(0, 8)} label="${cityBoost.target_label}"`,
  );
  check(
    !suratFeed.promoted.includes(cityBoost.listing_id) && !suratFeed.all.includes(cityBoost.listing_id),
    "…and is absent from a Surat viewer's feed entirely",
  );
} else {
  check(false, "a Rajkot-city boost exists to test with");
}

if (wideBoost && rajkotFeed) {
  check(
    rajkotFeed.promoted.includes(wideBoost.listing_id),
    `${wideBoost.targeting}-targeted boost on an out-of-city listing REACHES a Rajkot viewer`,
    `boost=${wideBoost.id.slice(0, 8)} label="${wideBoost.target_label}"`,
  );
} else {
  check(false, "a state/All-India boost on an out-of-city listing exists to test with");
}

// A paused boost must be placed NOWHERE.
const paused = await row1(`select id, listing_id from boosts where status='paused' limit 1`);
if (paused && rajkotFeed) {
  check(!rajkotFeed.promoted.includes(paused.listing_id), "a PAUSED boost is not placed anywhere",
    `boost=${paused.id.slice(0, 8)}`);
}

// ---------------------------------------------------------------------------
// 3. Requirement boost — locked-but-top for unpaid (Doc2 §9.2)
// ---------------------------------------------------------------------------
console.log("\n== Requirement boost — locked-but-top ==");
const reqBoost = active.find((b) => b.subject_kind === "requirement");
/**
 * Browse as someone the boost actually TARGETS.
 *
 * This step is about the locked-but-top rule, not about targeting — but it was
 * hardcoded to the Ahmedabad viewer while the seeded requirement boost is
 * targeted at Rajkot. A city-targeted boost is supposed not to reach another
 * city, so the check was asserting that targeting is broken, and "failing"
 * when it worked. Pick the viewer that matches the boost's own city.
 */
const reqViewer = !reqBoost ? null
  : reqBoost.target_city_id === cityId.Rajkot ? viewers.rajkot
  : reqBoost.target_city_id === cityId.Surat ? viewers.surat
  : viewers.ahmedabad;
if (reqBoost && reqViewer) {
  await login(reqViewer.phone);
  const r = await api(reqViewer.phone, "/api/v1/requirements/browse");
  const sections = r.json?.data?.sections ?? [];
  const cards = sections.flatMap((s) => s.cards ?? []);
  const first = cards[0];
  const boostedCard = cards.find((c) => c.id === reqBoost.listing_id);
  const unlocked = r.json?.data?.unlocked;
  check(r.status === 200 && cards.length > 0, "requirements browse loads", `${cards.length} cards, unlocked=${unlocked}`);
  if (boostedCard) {
    check(boostedCard.isBoosted === true, "the boosted requirement is flagged isBoosted (server-decided)");
    check(first?.id === reqBoost.listing_id, "…and sits at the TOP of the list", `first=${first?.id?.slice(0, 8)}`);
    if (!unlocked) {
      check(
        boostedCard.access === "locked" && boostedCard.budgetLabel === undefined && boostedCard.posterName === undefined,
        "…while STILL locked for an unpaid viewer (budget/poster absent from the payload)",
      );
    } else {
      console.log("  [note] this viewer holds Requirement Access, so the locked half can't be shown here");
    }
  } else {
    check(false, "the boosted requirement reached this viewer", `boost city=${reqBoost.target_label}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Boost status screen — analytics-free, correct tabs
// ---------------------------------------------------------------------------
console.log("\n== Boost status per role (P11 S5) ==");
for (const [role, phone] of Object.entries({
  owner: (await row1(`select p.phone from boosts b join profiles p on p.id=b.profile_id where p.role='owner' and p.phone is not null limit 1`))?.phone,
  broker: (await row1(`select p.phone from boosts b join profiles p on p.id=b.profile_id where p.role='broker' and p.phone is not null limit 1`))?.phone,
  builder: (await row1(`select p.phone from boosts b join profiles p on p.id=b.profile_id where p.role='builder' and p.phone is not null limit 1`))?.phone,
})) {
  if (!phone) { check(false, `${role} with a boost exists`); continue; }
  await login(phone);
  const s = await api(phone, "/api/v1/billing/boost/status");
  const d = s.json?.data;
  const all = [...(d?.active ?? []), ...(d?.pending ?? []), ...(d?.past ?? [])];
  console.log(`  ${role} (${phone}): active=${d?.counts?.active} pending=${d?.counts?.pending} past=${d?.counts?.past}`);
  check(s.status === 200, `${role} boost status loads`);

  // Doc2 §13: status only. No views/clicks/impressions anywhere in the payload.
  const leaked = JSON.stringify(d ?? {}).match(/"(views|clicks|impressions|ctr|reach_actual)"/g);
  check(!leaked, `${role} payload carries NO analytics`, leaked ? leaked.join(",") : "status only");

  // `pending_payment` is an abandoned checkout — it must not be listed.
  check(!all.some((b) => b.status === "pending_payment"), `${role} never sees a pending_payment boost`);

  // Every card names its own subject, not the word "Listing".
  const mislabelled = all.filter((b) => !b.listingTitle || b.listingTitle === "Listing");
  check(mislabelled.length === 0, `${role} every boost card resolves its subject title`,
    mislabelled.length ? `${mislabelled.length} unresolved` : `${all.length} cards`);

  // The renew prompt only exists when a boost really ends inside a day.
  if (d?.renewPrompt) {
    const b = (d.active ?? []).find((x) => x.id === d.renewPrompt.boostId);
    check(b && b.daysLeft !== null && b.daysLeft <= 1, `${role} renew banner matches a boost ending ≤1 day`,
      `daysLeft=${b?.daysLeft}`);
  }
}

// ---------------------------------------------------------------------------
// 5. The boost picker — all three subject kinds, server-resolved labels
// ---------------------------------------------------------------------------
console.log("\n== Boost picker (P11 S4) ==");
{
  // A seller WITH inventory: the picker has nothing to assert about an empty
  // account, so pointing this at a fresh profile made both checks vacuous.
  const phone = viewers.seller.phone;
  if (await need(phone, "boost picker")) {
  const e = await api(phone, "/api/v1/billing/boost/eligible");
  const d = e.json?.data;
  const kinds = new Set((d?.listings ?? []).map((l) => l.subjectKind));
  check(e.status === 200, "eligible loads", `${d?.listings?.length ?? 0} subjects`);
  check(d?.durations?.length > 0, "durations come from the admin catalog", (d?.durations ?? []).map((x) => `${x.label} ${x.price}`).join(" / "));
  console.log(`  subject kinds offered: ${[...kinds].join(", ") || "(none)"}`);

  const labels = Object.values(d?.targetLabels ?? {})[0];
  if (labels) {
    check(
      !!labels.city && labels.city !== "Your city" && !!labels.state && labels.state !== "Your state",
      "target labels are real place names from the DB",
      JSON.stringify(labels),
    );
  } else {
    console.log("  [note] this account has no eligible subject, so no target labels to resolve");
  }
  // Ineligible subjects come back WITH a lock label rather than being hidden.
  const locked = (d?.listings ?? []).filter((l) => !l.eligible);
  check(locked.every((l) => !!l.lockLabel), "ineligible subjects carry a lock label", `${locked.length} dimmed`);
  }
}

// ---------------------------------------------------------------------------
// 6. Admin approval — the state transition that did not exist before Module 9
// ---------------------------------------------------------------------------
console.log("\n== Admin approval (Doc2 §13) ==");
{
  const pending = await row1(
    `select b.id, b.profile_id, b.listing_id, b.duration_days, b.target_label
       from boosts b where b.status='pending_approval' order by b.created_at limit 1`,
  );

  // A non-staff seller must get 404 (not 403) from the moderate endpoint.
  const seller = viewers.seller.phone;
  await login(seller);
  const forbidden = await api(seller, `/api/v1/admin/moderate/boost/${pending?.id}`, {
    method: "POST", body: { action: "approve" },
  });
  check(forbidden.status === 404, "non-staff approving a boost gets 404 (endpoint not confirmable)", `got ${forbidden.status}`);
  const stillPending = await row1(`select status from boosts where id=$1`, [pending?.id]);
  check(stillPending?.status === "pending_approval", "…and the boost did not move");

  // Staff queue + approve.
  await login(staff.phone);
  const queue = await api(staff.phone, "/api/v1/admin/queue/boost");
  const items = queue.json?.data?.items ?? [];
  check(queue.status === 200 && items.length > 0, "staff sees the boost queue", `${items.length} pending`);
  const q0 = items.find((i) => i.boostId === pending?.id);
  check(!!q0?.checks?.length, "queue row carries real eligibility checks",
    (q0?.checks ?? []).map((c) => `${c.label}=${c.pass}`).join(" · "));
  check(q0?.checks?.some((c) => c.label === "Payment verified" && c.pass), "…including a verified payment");

  const ap = await api(staff.phone, `/api/v1/admin/moderate/boost/${pending.id}`, {
    method: "POST", body: { action: "approve" },
  });
  check(ap.status === 200 && ap.json?.data?.status === "active", "staff APPROVE puts the boost live", JSON.stringify(ap.json?.data ?? ap.json));

  const after = await row1(
    `select status, starts_at, ends_at, approved_at, approved_by from boosts where id=$1`, [pending.id],
  );
  check(after?.status === "active" && !!after.starts_at && !!after.ends_at,
    "DB row: active with a real window",
    `${after?.starts_at} → ${after?.ends_at}`);
  const days = Math.round((new Date(after.ends_at) - new Date(after.starts_at)) / 86_400_000);
  check(days === pending.duration_days, "window length == the duration that was paid for", `${days}d vs ${pending.duration_days}d`);
  check(!!after?.approved_by, "the decision is attributed to the moderator");

  const audit = await row1(`select action, actor_id from boost_reviews where boost_id=$1 order by created_at desc limit 1`, [pending.id]);
  check(audit?.action === "approve", "boost_reviews has the audit row");

  const notif = await row1(
    `select type, title from notifications where profile_id=$1 and type='boost_approved' order by created_at desc limit 1`,
    [pending.profile_id],
  );
  check(!!notif, "the seller was notified", notif?.title ?? "(none)");

  // Approving twice must not double the window.
  const again = await api(staff.phone, `/api/v1/admin/moderate/boost/${pending.id}`, {
    method: "POST", body: { action: "approve" },
  });
  check(again.status !== 200, "a second approve is refused (no doubled window)", `got ${again.status}`);

  // Pause / resume (admin-hide).
  const pz = await api(staff.phone, `/api/v1/admin/moderate/boost/${pending.id}`, {
    method: "POST", body: { action: "pause", reason: "live-sweep pause" },
  });
  check(pz.status === 200, "staff PAUSE works");
  const paused2 = await row1(`select status, paused_at, ends_at from boosts where id=$1`, [pending.id]);
  check(paused2?.status === "paused" && !!paused2.paused_at, "DB row: paused");
  const rz = await api(staff.phone, `/api/v1/admin/moderate/boost/${pending.id}`, {
    method: "POST", body: { action: "resume" },
  });
  check(rz.status === 200, "staff RESUME works");
  const resumed = await row1(`select status, ends_at, paused_at from boosts where id=$1`, [pending.id]);
  check(resumed?.status === "active" && resumed.paused_at === null, "DB row: active again, pause cleared");
  check(new Date(resumed.ends_at) >= new Date(paused2.ends_at), "…and the paused time was added back to the window",
    `${paused2.ends_at} → ${resumed.ends_at}`);

  // Reject with a reason → refund queued (the money moves in the hourly sweep).
  const toReject = await row1(`select id, profile_id, order_id from boosts where status='pending_approval' order by created_at limit 1`);
  if (toReject) {
    const bad = await api(staff.phone, `/api/v1/admin/moderate/boost/${toReject.id}`, {
      method: "POST", body: { action: "reject", reason: "no" },
    });
    check(bad.status !== 200, "reject with a too-short reason is refused", `got ${bad.status}`);

    const rj = await api(staff.phone, `/api/v1/admin/moderate/boost/${toReject.id}`, {
      method: "POST", body: { action: "reject", reason: "Photos do not match the property · live sweep" },
    });
    check(rj.status === 200, "staff REJECT works");
    const rejected = await row1(`select status, reject_reason, refunded_at from boosts where id=$1`, [toReject.id]);
    check(rejected?.status === "rejected" && !!rejected.reject_reason, "DB row: rejected with the reason stored");
    check(rejected?.refunded_at === null, "…and refunded_at is still null — the single-flight sweep owns the money");
    const rnotif = await row1(
      `select title from notifications where profile_id=$1 and type='boost_rejected' order by created_at desc limit 1`,
      [toReject.profile_id],
    );
    check(!!rnotif, "the seller was told, with the refund promise", rnotif?.title ?? "(none)");
  }

  // Reject must NOT reach a live boost: it refunds in full, and a boost 20 days
  // into a 30-day window has already delivered that placement. Killing a live one
  // is `stop` — Doc2 §13's fraud case, no refund.
  const live = await row1(
    `select id, profile_id, starts_at from boosts where status='active' order by starts_at limit 1`,
  );
  if (live) {
    const badReject = await api(staff.phone, `/api/v1/admin/moderate/boost/${live.id}`, {
      method: "POST", body: { action: "reject", reason: "trying to refund a boost that already ran" },
    });
    check(badReject.status !== 200, "REJECT is refused on a live boost (would refund delivered placement)",
      `got ${badReject.status}`);
    const untouched = await row1(`select status from boosts where id=$1`, [live.id]);
    check(untouched?.status === "active", "…and the live boost is untouched");

    const stop = await api(staff.phone, `/api/v1/admin/moderate/boost/${live.id}`, {
      method: "POST", body: { action: "stop", reason: "Fraudulent listing · live sweep" },
    });
    check(stop.status === 200, "STOP ends a live boost", `got ${stop.status}`);
    const stopped = await row1(`select status, stopped_reason, refunded_at from boosts where id=$1`, [live.id]);
    check(stopped?.status === "stopped", "DB row: stopped", stopped?.stopped_reason ?? "");
    check(stopped?.refunded_at === null, "…with NO refund (Doc2 §13 fraud case)");
    const snotif = await row1(
      `select title from notifications where profile_id=$1 and type='boost_stopped' order by created_at desc limit 1`,
      [live.profile_id],
    );
    check(!!snotif, "the seller was told", snotif?.title ?? "(none)");
  }
}

// ---------------------------------------------------------------------------
// 7. Race seal — approving a boost whose listing went sold
// ---------------------------------------------------------------------------
console.log("\n== Race seal: subject sold while the boost waited (Doc2 §13) ==");
{
  const victim = await row1(
    `select b.id, b.listing_id, b.profile_id from boosts b
      where b.status='pending_approval' and b.subject_kind='listing' order by b.created_at limit 1`,
  );
  if (!victim) {
    console.log("  [skip] no pending_approval boost left after the approval tests");
  } else {
    await withListingRestored(victim.listing_id, async () => {
      await sql(`update listings set availability='sold', status='archived' where id=$1`, [victim.listing_id]);

      await login(staff.phone);
      const ap = await api(staff.phone, `/api/v1/admin/moderate/boost/${victim.id}`, {
        method: "POST", body: { action: "approve" },
      });
      check(ap.status !== 200, "approving a sold listing's boost is refused", `got ${ap.status}`);
      check(ap.json?.error?.autoRejected === true || ap.json?.autoRejected === true
            || JSON.stringify(ap.json).includes("autoRejected"), "…and the response says it was auto-rejected");
      const after = await row1(`select status, reject_reason from boosts where id=$1`, [victim.id]);
      check(after?.status === "rejected", "DB row: rejected, not active", after?.reject_reason ?? "");
    });
  }
}

// ---------------------------------------------------------------------------
// 8. Auto-stop on sold — and the refund for one that never went live
// ---------------------------------------------------------------------------
console.log("\n== Auto-stop on sold (Doc2 §13) ==");
{
  const live = await row1(
    `select b.id, b.listing_id, b.profile_id, p.phone
       from boosts b join profiles p on p.id=b.profile_id
      where b.status='active' and b.subject_kind='listing' and p.phone is not null
      order by b.starts_at limit 1`,
  );
  if (live) {
    // This step had no restore at all — it sold a live listing and left it
    // sold, which is where most of the accumulated damage came from.
    await withListingRestored(live.listing_id, async () => {
      await login(live.phone);
      const r = await api(live.phone, `/api/v1/listings/${live.listing_id}/status`, {
        method: "POST", body: { action: "sold" },
      });
      check(r.status === 200, "owner marks the boosted listing sold", `got ${r.status}`);
      const after = await row1(`select status, stopped_reason from boosts where id=$1`, [live.id]);
      check(after?.status === "stopped", "the running boost auto-stopped", after?.stopped_reason ?? "");
      const notif = await row1(
        `select title from notifications where profile_id=$1 and type='boost_stopped' order by created_at desc limit 1`,
        [live.profile_id],
      );
      check(!!notif, "the seller was told the boost stopped", notif?.title ?? "(none)");

      // And it must be gone from placement immediately.
      const f = await api(null, "/api/v1/feed?limit=30");
      const items = f.json?.data?.items ?? [];
      check(!items.some((i) => i.id === live.listing_id && i.promoted),
        "…and it is no longer promoted anywhere");
    });
  }
}

// A boost still awaiting approval when the subject sells must be REFUNDED, not
// silently kept — this is the defect Module 9 found in the three stop call sites.
console.log("\n== Sold BEFORE approval → refund, not 'stopped' ==");
{
  const cand = await row1(
    `select b.id, b.listing_id, b.profile_id, p.phone
       from boosts b join profiles p on p.id=b.profile_id
      where b.status='pending_approval' and b.subject_kind='listing' and p.phone is not null limit 1`,
  );
  if (!cand) {
    console.log("  [skip] no pending_approval boost left to sell out from under");
  } else {
    await withListingRestored(cand.listing_id, async () => {
      await login(cand.phone);
      const r = await api(cand.phone, `/api/v1/listings/${cand.listing_id}/status`, { method: "POST", body: { action: "sold" } });
      check(r.status === 200, "owner marks a listing sold while its boost is pending approval");
      const after = await row1(`select status, stopped_reason from boosts where id=$1`, [cand.id]);
      check(after?.status === "cancelled", "the never-live boost is CANCELLED (a refundable state), not 'stopped'",
        `status=${after?.status} · ${after?.stopped_reason ?? ""}`);
    });
  }
}

// ---------------------------------------------------------------------------
// 9. IDOR — one seller's boost is invisible to another
// ---------------------------------------------------------------------------
console.log("\n== IDOR / authorization (Doc9 §API1) ==");
{
  const mine = await row1(
    `select b.id, p.phone from boosts b join profiles p on p.id=b.profile_id
      where b.status='pending_approval' and p.phone is not null limit 1`,
  );
  // The other seller has to be an account that can actually SIGN IN. This took
  // the first profile row with a phone, which is just as likely to be a
  // suspended or never-registered one — it then failed to log in, the request
  // came back 401 for want of a session, and the check reported that as "IDOR
  // returned 401 instead of 404". The authorization rule was never exercised.
  const other = await row1(
    `select phone from profiles
      where phone is not null and phone <> coalesce($1,'')
        and state = 'active' and is_registered
      order by phone limit 1`,
    [mine?.phone ?? null],
  );
  if (mine && other && await need(other.phone, "IDOR probe as another seller")) {
    const c = await api(other.phone, `/api/v1/billing/boost/${mine.id}/cancel`, { method: "POST" });
    check(c.status === 404, "cancelling someone else's boost → 404", `got ${c.status}`);
    const rn = await api(other.phone, `/api/v1/billing/boost/${mine.id}/renew`, { method: "POST" });
    check(rn.status === 404, "renewing someone else's boost → 404", `got ${rn.status}`);
    const st = await row1(`select status from boosts where id=$1`, [mine.id]);
    check(st?.status === "pending_approval", "…and the boost is untouched");
  }

  // Unauthenticated sweep.
  for (const p of ["/api/v1/billing/boost/status", "/api/v1/billing/boost/eligible"]) {
    const r = await api(null, p);
    check(r.status === 401, `guest ${p} → 401`, `got ${r.status}`);
  }
  const aq = await api(null, "/api/v1/admin/queue/boost");
  check(aq.status === 404, "guest admin boost queue → 404", `got ${aq.status}`);
}

// ---------------------------------------------------------------------------
// 10. Checkout refuses what it should
// ---------------------------------------------------------------------------
console.log("\n== Checkout guards (Doc9 §11) ==");
{
  const phone = viewers.seller.phone;
  if (await need(phone, "checkout guards")) {
  const someoneElses = await row1(
    `select l.id from listings l where l.status='live' and l.profile_id <>
       (select id from profiles where phone=$1) limit 1`, [phone],
  );
  const r = await api(phone, "/api/v1/billing/checkout", {
    method: "POST",
    body: { planId: "boost30", listingId: someoneElses.id, subjectKind: "listing", targeting: "india" },
  });
  check(r.status !== 200, "boosting someone else's listing is refused", `got ${r.status} ${r.json?.error?.code ?? ""}`);

  const bad = await api(phone, "/api/v1/billing/checkout", {
    method: "POST",
    body: { planId: "boost30", listingId: someoneElses.id, subjectKind: "wat", targeting: "india" },
  });
  check(bad.status !== 200, "an unknown subjectKind is refused", `got ${bad.status}`);
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : `${fails} CHECK(S) FAILED`}`);
console.log("re-run `node scripts/seed-module9.mjs` to restore the seeded states.\n");
await pgc.end();
process.exit(fails === 0 ? 0 : 1);
