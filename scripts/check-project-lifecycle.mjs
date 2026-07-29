/**
 * Live proof for the project lifecycle (migration 0079).
 *
 * Before this, a builder could not take a project down by any route: there was
 * no status endpoint, no DELETE, and the `deleted_at` the read paths filtered
 * on was never written by anything. A scheme posted by mistake stayed on the
 * profile and in the feed permanently and its ₹9,999 slot was gone with it.
 *
 * What this walks, against the REAL database after every call:
 *   1. hide     → status hidden, hidden_at set, a running boost PAUSED
 *   2. unhide   → back to live (or review if edited), boost RESUMED
 *   3. delete   → status deleted, in trash, out of the manager and the feed
 *   4. restore  → back to pending_review, out of trash
 *   5. purge    → the row is GONE
 *   6. slot accounting — a never-published project gives its project slot back;
 *      one that has been live does not
 *   7. IDOR — another builder gets 404 on hide, delete and purge
 *   8. illegal transitions — hiding a project under review is a 400, not a
 *      silent success that would strand it outside the review queue
 *
 * Creates its own throwaway project rows directly in the DB (so it never
 * consumes a real plan) and removes them at the end.
 *
 *   LIFECYCLE_BASE=http://localhost:3000 node scripts/check-project-lifecycle.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.env.LIFECYCLE_BASE || "http://localhost:3000";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const pgc = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await pgc.connect();
const sql = (s, p) => pgc.query(s, p);
const row1 = async (s, p) => (await sql(s, p)).rows[0] ?? null;

const jars = new Map();
function save(res, key) {
  const cur = jars.get(key) ?? new Map();
  for (const ck of res.headers.getSetCookie?.() ?? []) {
    const [pair] = ck.split(";");
    const i = pair.indexOf("=");
    cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jars.set(key, cur);
}
const cookie = (key) => [...(jars.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

let ipN = 10;
async function api(key, p, { method = "GET", body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${ipN++ % 250}`, ...(key ? { cookie: cookie(key) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (key) save(res, key);
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}
async function login(phone) {
  const r = await api(phone, "/api/v1/auth/otp/request", { method: "POST", body: { phone } });
  if (r.status === 429) return "rate_limited";
  const v = await api(phone, "/api/v1/auth/otp/verify", {
    method: "POST",
    body: { otpSession: r.json?.data?.otpSession, code: r.json?.data?.devCode ?? "123456" },
  });
  return v.status === 200 ? "ok" : "failed";
}

let fails = 0;
const check = (cond, label, extra = "") => {
  if (!cond) fails++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};

// ---------------------------------------------------------------------------
// Two builders: the owner and the intruder (for the IDOR probe).
// ---------------------------------------------------------------------------
const builders = (await sql(
  `select id, phone from profiles where role = 'builder' and state = 'active' order by created_at limit 2`,
)).rows;
if (builders.length < 2) { console.log("need two builder accounts"); await pgc.end(); process.exit(1); }
const [owner, intruder] = builders;

for (const b of builders) {
  const res = await login(b.phone);
  if (res !== "ok") { console.log(`login ${b.phone}: ${res} — restart the dev server to reset the OTP limiter`); await pgc.end(); process.exit(1); }
}
console.log(`owner ${owner.phone} · intruder ${intruder.phone}\n`);

// A real city and the state above it — the location chain is a cascade of
// `parent_id`, not a pair of columns.
const city = await row1(
  `select c.id, s.id as state_id
     from locations c
     join locations t on t.id = c.parent_id
     join locations d on d.id = t.parent_id
     join locations s on s.id = d.parent_id and s.level = 'state'
    where c.level = 'city' limit 1`,
);
const made = [];

/** A throwaway project straight into the table — no plan is consumed. */
async function makeProject(status, opts = {}) {
  const r = await row1(
    `insert into projects (profile_id, name, status, city_id, state_id, area_label, pincode, project_type,
                           rera_exempt, rera_exempt_reason, build_status, slot_id, live_at, approved_at)
     values ($1,$2,$3,$4,$5,'Lifecycle Probe','360001','apartment',true,'plot_under_500sqm','under_construction',$6,$7,$8)
     returning id, slot_id`,
    [owner.id, opts.name ?? `ZZ Lifecycle ${status} ${Date.now()}`, status, city.id, city.state_id,
     opts.slotId ?? null, opts.liveAt ?? null, opts.approvedAt ?? null],
  );
  made.push(r.id);
  return r.id;
}
const projectRow = (id) =>
  row1(`select id, status, hidden_at, deleted_at, slot_id, submitted_at from projects where id = $1`, [id]);

// ---------------------------------------------------------------------------
// 1-2. hide → unhide, and what it does to a running boost
// ---------------------------------------------------------------------------
console.log("hide / unhide");
{
  const id = await makeProject("live", { liveAt: new Date().toISOString(), approvedAt: new Date().toISOString() });
  // A boost that is genuinely running on this project, so pause/resume is
  // proven against a row rather than asserted.
  const boost = await row1(
    `insert into boosts (profile_id, listing_id, subject_kind, catalog_code, duration_days, targeting,
                         target_label, price_paise, status, starts_at, ends_at)
     values ($1,$2,'project','boost7',7,'city','Rajkot',49900,'active', now(), now() + interval '7 days')
     returning id`,
    [owner.id, id],
  );

  const hide = await api(owner.phone, `/api/v1/projects/${id}/status`, { method: "POST", body: { action: "hide" } });
  const afterHide = await projectRow(id);
  const boostHidden = await row1(`select status, paused_at from boosts where id = $1`, [boost.id]);
  check(hide.status === 200, "POST status hide → 200", `got ${hide.status}`);
  check(afterHide.status === "hidden", "DB says hidden", `status=${afterHide.status}`);
  check(!!afterHide.hidden_at, "hidden_at was written", String(afterHide.hidden_at));
  check(boostHidden.status === "paused", "the running boost PAUSED, not spent", `boost=${boostHidden.status}`);

  // Hidden → out of the builder's own boost picker, and out of the public feed.
  const feed = await api(null, "/api/v1/feed?filter=all&sort=latest");
  const inFeed = JSON.stringify(feed.json ?? {}).includes(id);
  check(!inFeed, "a hidden project is not in the public feed");

  const unhide = await api(owner.phone, `/api/v1/projects/${id}/status`, { method: "POST", body: { action: "unhide" } });
  const afterUnhide = await projectRow(id);
  const boostBack = await row1(`select status from boosts where id = $1`, [boost.id]);
  check(unhide.status === 200, "POST status unhide → 200", `got ${unhide.status}`);
  check(afterUnhide.status === "live", "approved + untouched → straight back LIVE", `status=${afterUnhide.status}`);
  check(afterUnhide.hidden_at === null, "hidden_at cleared");
  check(boostBack.status === "active", "the paused boost RESUMED", `boost=${boostBack.status}`);

  await sql(`delete from boosts where id = $1`, [boost.id]);
}

// ---------------------------------------------------------------------------
// 3-5. delete → trash → restore → purge
// ---------------------------------------------------------------------------
console.log("\ndelete / restore / purge");
{
  const id = await makeProject("live", { liveAt: new Date().toISOString(), approvedAt: new Date().toISOString() });

  const del = await api(owner.phone, `/api/v1/projects/${id}`, { method: "DELETE" });
  const afterDel = await projectRow(id);
  check(del.status === 200, "DELETE → 200", `got ${del.status}`);
  check(afterDel.status === "deleted" && !!afterDel.deleted_at, "DB says deleted, with a timestamp", `${afterDel.status} @ ${afterDel.deleted_at}`);

  const mine = await api(owner.phone, "/api/v1/listings/mine");
  const inMine = (mine.json?.data?.items ?? []).some((i) => i.id === id);
  check(!inMine, "gone from My Listings");

  const trash = await api(owner.phone, "/api/v1/listings/trash");
  const trashed = (trash.json?.data?.items ?? []).find((i) => i.id === id);
  check(!!trashed, "in Recently deleted");
  check(trashed?.subjectKind === "project", "tagged as a project so the screen calls the right endpoints", trashed?.subjectKind);
  check(typeof trashed?.daysLeft === "number" && trashed.daysLeft <= 30, "carries the server's daysLeft", String(trashed?.daysLeft));

  const restore = await api(owner.phone, `/api/v1/projects/${id}/status`, { method: "POST", body: { action: "restore" } });
  const afterRestore = await projectRow(id);
  check(restore.status === 200, "POST status restore → 200", `got ${restore.status}`);
  check(afterRestore.status === "pending_review", "restores INTO review, never straight to live", `status=${afterRestore.status}`);
  check(afterRestore.deleted_at === null, "deleted_at cleared");

  // Purge only ever works from trash — this is the wall that stops it being a
  // way to hard-delete a live project.
  const earlyPurge = await api(owner.phone, `/api/v1/projects/${id}/purge`, { method: "POST" });
  check(earlyPurge.status === 404, "purge refuses a project that is NOT in trash", `got ${earlyPurge.status}`);
  check(!!(await projectRow(id)), "and the row is still there");

  await api(owner.phone, `/api/v1/projects/${id}`, { method: "DELETE" });
  const purge = await api(owner.phone, `/api/v1/projects/${id}/purge`, { method: "POST" });
  check(purge.status === 200, "purge from trash → 200", `got ${purge.status}`);
  check((await projectRow(id)) === null, "the row is GONE from the database");
}

// ---------------------------------------------------------------------------
// 6. Slot accounting — the half that costs ₹9,999
// ---------------------------------------------------------------------------
console.log("\nslot accounting");
{
  const plan = await row1(
    `select id, project_used from user_plans where profile_id = $1 order by created_at desc limit 1`,
    [owner.id],
  );
  if (!plan) {
    console.log("  [SKIP] this builder has no plan row to account against");
  } else {
    // (a) never published → the slot comes back
    const slotA = await row1(
      `insert into listing_slots (profile_id, user_plan_id, state) values ($1,$2,'reserved') returning id`,
      [owner.id, plan.id],
    );
    await sql(`update user_plans set project_used = project_used + 1 where id = $1`, [plan.id]);
    const usedBefore = (await row1(`select project_used from user_plans where id = $1`, [plan.id])).project_used;
    const draftId = await makeProject("pending_review", { slotId: slotA.id });

    await api(owner.phone, `/api/v1/projects/${draftId}`, { method: "DELETE" });
    const usedAfter = (await row1(`select project_used from user_plans where id = $1`, [plan.id])).project_used;
    const slotAfter = await row1(`select state from listing_slots where id = $1`, [slotA.id]);
    check(Number(usedAfter) === Number(usedBefore) - 1, "never-published project → project_used goes back down", `${usedBefore} → ${usedAfter}`);
    check(slotAfter.state === "released", "and its slot is released", slotAfter.state);

    // (b) has been live → the slot stays spent, or one plan could be recycled
    const slotB = await row1(
      `insert into listing_slots (profile_id, user_plan_id, state) values ($1,$2,'consumed') returning id`,
      [owner.id, plan.id],
    );
    await sql(`update user_plans set project_used = project_used + 1 where id = $1`, [plan.id]);
    const used2Before = (await row1(`select project_used from user_plans where id = $1`, [plan.id])).project_used;
    const liveId = await makeProject("live", { slotId: slotB.id, liveAt: new Date().toISOString(), approvedAt: new Date().toISOString() });

    await api(owner.phone, `/api/v1/projects/${liveId}`, { method: "DELETE" });
    const used2After = (await row1(`select project_used from user_plans where id = $1`, [plan.id])).project_used;
    check(Number(used2After) === Number(used2Before), "published project → the slot stays spent", `${used2Before} → ${used2After}`);

    await sql(`update user_plans set project_used = $2 where id = $1`, [plan.id, plan.project_used]);
    await sql(`delete from listing_slots where id = any($1)`, [[slotA.id, slotB.id]]);
  }
}

// ---------------------------------------------------------------------------
// 7-8. IDOR + illegal transitions
// ---------------------------------------------------------------------------
console.log("\nauthorization + state machine");
{
  const id = await makeProject("live", { liveAt: new Date().toISOString(), approvedAt: new Date().toISOString() });

  const hide = await api(intruder.phone, `/api/v1/projects/${id}/status`, { method: "POST", body: { action: "hide" } });
  const del = await api(intruder.phone, `/api/v1/projects/${id}`, { method: "DELETE" });
  const purge = await api(intruder.phone, `/api/v1/projects/${id}/purge`, { method: "POST" });
  check(hide.status === 404, "another builder hiding it → 404 (not 403: a 403 confirms the id)", `got ${hide.status}`);
  check(del.status === 404, "another builder deleting it → 404", `got ${del.status}`);
  check(purge.status === 404, "another builder purging it → 404", `got ${purge.status}`);
  check((await projectRow(id)).status === "live", "and the project is untouched");

  const anon = await api(null, `/api/v1/projects/${id}/status`, { method: "POST", body: { action: "hide" } });
  const anonDel = await api(null, `/api/v1/projects/${id}`, { method: "DELETE" });
  check(anon.status === 401, "unauthenticated status → 401", `got ${anon.status}`);
  check(anonDel.status === 401, "unauthenticated delete → 401", `got ${anonDel.status}`);

  // 422 is this codebase's VALIDATION_ERROR (lib/api.ts), the same answer the
  // listing status route gives an action it doesn't know.
  const bad = await api(owner.phone, `/api/v1/projects/${id}/status`, { method: "POST", body: { action: "archive" } });
  check(bad.status === 422, "an unknown action → 422 VALIDATION_ERROR", `got ${bad.status}`);

  const review = await makeProject("pending_review");
  const hideReview = await api(owner.phone, `/api/v1/projects/${review.id ?? review}/status`, { method: "POST", body: { action: "hide" } });
  check(hideReview.status === 400, "hiding an under-review project → 400 LISTING_STATE_LOCKED", `got ${hideReview.status}`);

  const unhideLive = await api(owner.phone, `/api/v1/projects/${id}/status`, { method: "POST", body: { action: "unhide" } });
  check(unhideLive.status === 400, "unhiding a project that isn't hidden → 400", `got ${unhideLive.status}`);
}

// ---------------------------------------------------------------------------
await sql(`delete from boosts where listing_id = any($1)`, [made]);
await sql(`delete from projects where id = any($1)`, [made]);
console.log(`\ncleaned up ${made.length} probe project(s)`);
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
await pgc.end();
process.exit(fails ? 1 : 0);
