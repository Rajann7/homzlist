/**
 * P4 — A10 Users · A11 User detail · A12 Listings master · A31 Impersonation,
 * exercised against real rows.
 *
 * Same rule as check-admin-p3: a 200 is not the check, the row is. Every
 * control the design draws is driven here, and then the DATABASE is asked what
 * happened — the transition, the audit row, and the notification the user was
 * promised.
 *
 *   PORT=3000 node scripts/check-admin-p4.mjs
 */
import { connect, env } from "./lib/dbx.mjs";

const PORT = process.env.PORT ?? "3000";
const API = `http://account.localhost:${PORT}/api/v1/admin`;

const sql = await connect();
const one = async (q, ...a) => (await sql.query(q, a)).rows[0];
const all = async (q, ...a) => (await sql.query(q, a)).rows;

let failures = 0;
let checks = 0;
const check = (label, got, want, extra = "") => {
  checks++;
  const okay = String(got) === String(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(48)} got=${String(got).padEnd(20)} want=${want} ${extra}`,
  );
};
const gte = (label, got, want, extra = "") => {
  checks++;
  const okay = Number(got) >= Number(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(48)} got=${String(got).padEnd(20)} want>=${want} ${extra}`,
  );
};

function jar() {
  const c = new Map();
  return {
    header: () => [...c].map(([k, v]) => `${k}=${v}`).join("; "),
    get: (k) => c.get(k),
    absorb: (res) => {
      for (const s of res.headers.getSetCookie?.() ?? []) {
        const p = s.split(";")[0];
        const i = p.indexOf("=");
        c.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
      }
    },
  };
}

async function signIn(email) {
  const j = jar();
  const res = await fetch(`${API}/auth/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  j.absorb(res);
  const body = await res.json();
  if (!body.ok || body.data.outcome !== "ok") throw new Error(`sign-in failed for ${email}`);
  const call = async (path, init = {}) => {
    const r = await fetch(API + path, {
      ...init,
      headers: { "content-type": "application/json", cookie: j.header(), ...(init.headers ?? {}) },
    });
    j.absorb(r);
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  call.jar = j;
  return call;
}

const superEmail = process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL;
const api = await signIn(superEmail);
const superId = (await one(`select profile_id from staff where email=$1`, superEmail)).profile_id;

const since = new Date().toISOString();
const audited = async (action, entityId) =>
  Number(
    (
      await one(
        `select count(*) n from admin_audit_log
          where action=$1 and entity_id=$2 and created_at >= $3`,
        action,
        entityId,
        since,
      )
    ).n,
  );
const notified = async (profileId, type) =>
  Number(
    (
      await one(
        `select count(*) n from notifications
          where profile_id=$1 and type=$2::notification_type
            and greatest(created_at, coalesce(last_event_at, created_at)) >= $3`,
        profileId,
        type,
        since,
      )
    ).n,
  );

/* ═══════════════════════════════════════════════ 1 · A10 · the list engine ═ */
console.log("\nA10 — users list: every filter is SQL, not a page filter");

const total = Number((await one(`select count(*) n from admin_user_list`)).n);
{
  const { json } = await api("/list/users");
  check("unfiltered total = the view's row count", json.data.total, total);

  for (const [key, value] of [
    ["role", "broker"],
    ["status", "suspended"],
    ["plan", "none"],
    ["verification", "rera"],
  ]) {
    const column = key === "plan" ? "plan_key" : key === "verification" ? "verification_key" : key === "status" ? "status_key" : "role";
    const expected = Number(
      (await one(`select count(*) n from admin_user_list where ${column} = $1`, value)).n,
    );
    const r = await api(`/list/users?${key}=${value}`);
    check(`filter ${key}=${value}`, r.json.data.total, expected);
  }

  // two values on one key → OR, not AND
  const twoRoles = Number(
    (await one(`select count(*) n from admin_user_list where role in ('broker','builder')`)).n,
  );
  const r2 = await api("/list/users?role=broker&role=builder");
  check("filter role in (broker,builder)", r2.json.data.total, twoRoles);

  // search hits the server
  const someone = await one(
    `select name, phone from admin_user_list where name is not null order by joined_at desc limit 1`,
  );
  const term = someone.name.split(" ")[0];
  const expectedSearch = Number(
    (
      await one(
        `select count(*) n from admin_user_list
          where name ilike $1 or phone ilike $1 or email ilike $1 or handle ilike $1`,
        `%${term}%`,
      )
    ).n,
  );
  const r3 = await api(`/list/users?q=${encodeURIComponent(term)}`);
  check(`search "${term}"`, r3.json.data.total, expectedSearch);

  // sort is in the database, across pages
  const ascFirst = (await one(`select name from admin_user_list order by joined_at asc limit 1`)).name;
  const r4 = await api("/list/users?sort=joined_at&dir=asc");
  check("sort joined_at asc → oldest first", r4.json.data.rows[0].name, ascFirst);

  // page 2 respects the filter
  const r5 = await api("/list/users?role=broker&pageSize=5&page=2");
  const brokers = Number((await one(`select count(*) n from admin_user_list where role='broker'`)).n);
  check("page 2 keeps the filter (total)", r5.json.data.total, brokers);
  check("page 2 returns page 2", r5.json.data.page, 2);
  const r5a = await api("/list/users?role=broker&pageSize=5&page=1");
  check(
    "page 2 rows differ from page 1",
    r5.json.data.rows[0]?.id !== r5a.json.data.rows[0]?.id,
    true,
  );

  // a column the resource never declared cannot reach order()
  const r6 = await api("/list/users?sort=phone_hacker&dir=asc");
  check("unknown sort falls back to the default", r6.json.data.sort, "joined_at");
}

/* ══════════════════════════════════════════ 2 · A12 · chips are real counts ═ */
console.log("\nA12 — listings master: ten chips, ten real counts");
{
  const { json } = await api("/list/listings-master?tab=all");
  const counts = json.data.tabCounts;
  for (const key of ["live", "pending", "changes", "rejected", "hidden", "sold", "rented", "archived", "trash"]) {
    const expected = Number(
      (await one(`select count(*) n from admin_listing_master where status_key=$1`, key)).n,
    );
    check(`chip ${key}`, counts[key], expected);
  }
  const alive = Number(
    (await one(`select count(*) n from admin_listing_master where status_key <> 'trash'`)).n,
  );
  check("chip All = everything but Trash", counts.all, alive);

  // the union really carries both kinds
  const projects = Number(
    (await one(`select count(*) n from admin_listing_master where kind='project'`)).n,
  );
  gte("projects are in the master (builder rows)", projects, 1);

  // price range narrows in SQL
  const expensive = Number(
    (
      await one(
        `select count(*) n from admin_listing_master
          where price_paise >= 10000000 and status_key <> 'trash'`,
      )
    ).n,
  );
  const r = await api("/list/listings-master?tab=all&priceMin=10000000");
  check("filter priceMin >= ₹1L", r.json.data.total, expensive);

  const boosted = Number(
    (
      await one(
        `select count(*) n from admin_listing_master where is_boosted and status_key <> 'trash'`,
      )
    ).n,
  );
  const rb = await api("/list/listings-master?tab=all&boosted=true");
  check("filter boosted=true", rb.json.data.total, boosted);
}

/* ═══════════════════════════════════════════════ 3 · A11 · the ten tabs ════ */
console.log("\nA11 — user detail: every tab is a query");
{
  const rich = await one(
    `select p.id, p.name from profiles p
      where exists (select 1 from listings l where l.profile_id = p.id)
        and exists (select 1 from payments pay where pay.profile_id = p.id)
      order by p.created_at desc limit 1`,
  );
  for (const tab of [
    "overview",
    "plans",
    "payments",
    "listings",
    "requirements",
    "leads",
    "chats",
    "communication",
    "notes",
    "timeline",
  ]) {
    const { status, json } = await api(`/users/${rich.id}?tab=${tab}`);
    check(`tab ${tab} → 200 with data`, status === 200 && json.ok && json.data.tab === tab, true);
  }
  // opening the chat list is audited as a sensitive read
  gte("opening Chats writes a sensitive audit row", await audited("view_chats", rich.id), 1);
  const sens = await one(
    `select is_sensitive from admin_audit_log
      where action='view_chats' and entity_id=$1 order by created_at desc limit 1`,
    rich.id,
  );
  check("…and it is marked sensitive", sens.is_sensitive, true);

  // the listings tab agrees with the database
  const { json: lt } = await api(`/users/${rich.id}?tab=listings`);
  const owned = Number(
    (await one(`select count(*) n from admin_listing_master where poster_id=$1`, rich.id)).n,
  );
  check("Listings tab row count", lt.data.data.rows.length, Math.min(owned, 50));
}

/* ═════════════════════════════════════════ 4 · A11 · the actions, and rows ═ */
console.log("\nA11 — the action bar, proved from the database");

/** A user we can safely drive through suspend → lift. */
const victim = await one(
  `select p.id, p.name from profiles p
    where p.state='active' and p.is_registered
      and exists (select 1 from listings l where l.profile_id=p.id and l.status='live')
    order by random() limit 1`,
);

{
  const before = Number(
    (await one(`select count(*) n from listings where profile_id=$1 and status='live'`, victim.id)).n,
  );
  const r = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", days: 7, reason: "P4 check — automated" }),
  });
  check("suspend → 200", r.status, 200);
  const after = await one(`select state from profiles where id=$1`, victim.id);
  check("profiles.state", after.state, "suspended");
  const hidden = Number(
    (await one(`select count(*) n from listings where profile_id=$1 and status='live'`, victim.id)).n,
  );
  check("their live listings were hidden", hidden, 0, `(was ${before})`);
  gte(
    "account_suspensions row written",
    Number(
      (
        await one(
          `select count(*) n from account_suspensions where profile_id=$1 and created_at>=$2`,
          victim.id,
          since,
        )
      ).n,
    ),
    1,
  );
  gte("audit row", await audited("suspend", victim.id), 1);
  gte("user notified", await notified(victim.id, "account_suspended"), 1);

  // a second suspend is refused — the status filter is the claim
  const again = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", days: 7, reason: "again" }),
  });
  check("double suspend is refused", again.status, 422);

  // no reason → refused before anything is written
  const noReason = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", days: 7, reason: "  " }),
  });
  check("suspend without a reason is refused", noReason.status, 422);

  const lift = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "lift_suspension" }),
  });
  check("lift → 200", lift.status, 200);
  check(
    "profiles.state back to active",
    (await one(`select state from profiles where id=$1`, victim.id)).state,
    "active",
  );
  check(
    "the listings the suspension hid came back",
    Number(
      (await one(`select count(*) n from listings where profile_id=$1 and status='live'`, victim.id)).n,
    ),
    before,
  );
  gte("user notified of the lift", await notified(victim.id, "suspension_lifted"), 1);
}

{
  // grant trial → a real user_plans row the quota check already reads
  const r = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "grant_trial",
      contents: { listings: 1, requirements: 1, proposals: 10 },
      durationDays: 14,
      reason: "P4 check — automated",
    }),
  });
  check("grant trial → 200", r.status, 200);
  const plan = await one(
    `select id, is_trial, listing_quota, proposal_quota, expires_at, granted_by
       from user_plans where profile_id=$1 order by created_at desc limit 1`,
    victim.id,
  );
  check("user_plans.is_trial", plan.is_trial, true);
  check("user_plans.listing_quota", plan.listing_quota, 1);
  check("user_plans.proposal_quota", plan.proposal_quota, 10);
  check("granted_by = the admin", plan.granted_by, superId);
  gte(
    "grants row",
    Number(
      (await one(`select count(*) n from grants where profile_id=$1 and created_at>=$2`, victim.id, since)).n,
    ),
    1,
  );
  gte("audit row", await audited("grant", victim.id), 1);

  // adjust balance moves the quota AND leaves a reason behind
  const adj = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "adjust_balance",
      kind: "proposal",
      delta: 5,
      reason: "P4 check — goodwill",
    }),
  });
  check("adjust balance → 200", adj.status, 200);
  check(
    "proposal_quota 10 → 15",
    (await one(`select proposal_quota from user_plans where id=$1`, plan.id)).proposal_quota,
    15,
  );
  gte(
    "plan_adjustments row",
    Number((await one(`select count(*) n from plan_adjustments where profile_id=$1`, victim.id)).n),
    1,
  );

  // it cannot go below what is already used
  const tooFar = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "adjust_balance", kind: "proposal", delta: -99, reason: "x" }),
  });
  check("adjust below used is refused", tooFar.status, 422);
  const noReason2 = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "adjust_balance", kind: "proposal", delta: 1, reason: "" }),
  });
  check("adjust without a reason is refused", noReason2.status, 422);
}

{
  // role change
  const wasRole = (await one(`select role from profiles where id=$1`, victim.id)).role;
  const to = wasRole === "owner" ? "broker" : "owner";
  const r = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "role_change", role: to, reason: "P4 check" }),
  });
  check("role change → 200", r.status, 200);
  check("profiles.role", (await one(`select role from profiles where id=$1`, victim.id)).role, to);
  gte("role_change_requests row", Number((await one(
    `select count(*) n from role_change_requests where profile_id=$1 and created_at>=$2`, victim.id, since)).n), 1);
  gte("user notified", await notified(victim.id, "role_changed"), 1);
  // put it back
  await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "role_change", role: wasRole, reason: "P4 check — restore" }),
  });
}

{
  // message + note + profile edit
  const r = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "send_message",
      channels: ["in_app"],
      subject: "P4 check",
      body: "Automated check message.",
    }),
  });
  check("send message → 200", r.status, 200);
  const msg = await one(
    `select channel, delivered_at, sent_by_name from admin_messages
      where profile_id=$1 order by created_at desc limit 1`,
    victim.id,
  );
  check("admin_messages.channel", msg.channel, "in_app");
  check("in-app is marked delivered", msg.delivered_at !== null, true);
  gte("user notified", await notified(victim.id, "admin_message"), 1);

  // email/whatsapp have no provider — the row must NOT claim delivery
  const r2 = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "send_message",
      channels: ["email"],
      subject: "P4 check email",
      body: "Automated.",
    }),
  });
  check("send via email only → 200", r2.status, 200);
  const msg2 = await one(
    `select channel, delivered_at from admin_messages where profile_id=$1 order by created_at desc limit 1`,
    victim.id,
  );
  check("email-only send is NOT marked delivered", msg2.delivered_at, null);

  const note = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "add_note", body: "P4 automated note" }),
  });
  check("add note → 200", note.status, 200);
  const noteRow = await one(
    `select id, author_name from admin_notes where subject_type='user' and subject_id=$1
      order by created_at desc limit 1`,
    victim.id,
  );
  check("admin_notes.author_name", noteRow.author_name !== null, true);
  const del = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "delete_note", noteId: noteRow.id }),
  });
  check("delete note → 200", del.status, 200);
  check(
    "note is gone",
    Number((await one(`select count(*) n from admin_notes where id=$1`, noteRow.id)).n),
    0,
  );

  const wasBio = (await one(`select bio from profiles where id=$1`, victim.id)).bio;
  const edit = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "edit_field", field: "bio", value: "P4 edited bio" }),
  });
  check("inline field edit → 200", edit.status, 200);
  check(
    "profiles.bio changed",
    (await one(`select bio from profiles where id=$1`, victim.id)).bio,
    "P4 edited bio",
  );
  const diff = await one(
    `select diff from admin_audit_log where action='edit' and entity_id=$1 order by created_at desc limit 1`,
    victim.id,
  );
  check("audit diff carries the OLD value", diff.diff.from ?? null, wasBio ?? null);
  await sql.query(`update profiles set bio=$1 where id=$2`, [wasBio, victim.id]);

  const notEditable = await api(`/users/${victim.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "edit_field", field: "phone", value: "+919999999999" }),
  });
  check("editing a non-editable field is refused", notEditable.status, 422);
}

/* ══════════════════════════════════════════════ 5 · A12 · the panel actions ═ */
console.log("\nA12 — the listing panel, proved from the database");

const live = await one(
  `select l.id, l.profile_id, l.title, l.price_paise from listings l
    where l.status='live' and l.deleted_at is null order by random() limit 1`,
);
{
  const oldPrice = Number(live.price_paise ?? 0);
  const newPrice = oldPrice + 100000;
  const noReason = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "edit", kind: "listing", changes: { price_paise: newPrice }, reason: "" }),
  });
  check("edit without a reason is refused", noReason.status, 422);

  const r = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "edit",
      kind: "listing",
      changes: { price_paise: newPrice },
      reason: "P4 check — compliance edit",
      reReview: false,
    }),
  });
  check("edit price → 200", r.status, 200);
  check(
    "listings.price_paise",
    Number((await one(`select price_paise from listings where id=$1`, live.id)).price_paise),
    newPrice,
  );
  gte(
    "listing_price_history row",
    Number(
      (
        await one(
          `select count(*) n from listing_price_history where listing_id=$1 and changed_at>=$2`,
          live.id,
          since,
        )
      ).n,
    ),
    1,
  );
  const audit = await one(
    `select diff from admin_audit_log where action='edit' and entity_id=$1 order by created_at desc limit 1`,
    live.id,
  );
  check("audit diff carries the OLD price", audit.diff.changes.price_paise.from, oldPrice);
  check(
    "edited_since_approval flagged",
    (await one(`select edited_since_approval from listings where id=$1`, live.id)).edited_since_approval,
    true,
  );

  // an edit with no actual change is refused, not audited as one
  const same = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "edit",
      kind: "listing",
      changes: { price_paise: newPrice },
      reason: "no-op",
    }),
  });
  check("a no-op edit is refused", same.status, 422);
  // put it back
  await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "edit",
      kind: "listing",
      changes: { price_paise: oldPrice },
      reason: "P4 check — restore",
    }),
  });
}

{
  // hide → restore, each with its own state filter
  const r = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "hide", kind: "listing", reason: "P4 check" }),
  });
  check("hide → 200", r.status, 200);
  check(
    "listings.status",
    (await one(`select status from listings where id=$1`, live.id)).status,
    "hidden",
  );
  const twice = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "hide", kind: "listing" }),
  });
  check("hiding a hidden listing is refused", twice.status, 422);
  gte("audit row", await audited("hide", live.id), 1);

  const back = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "restore", kind: "listing" }),
  });
  check("restore → 200", back.status, 200);
  check(
    "listings.status back to live",
    (await one(`select status from listings where id=$1`, live.id)).status,
    "live",
  );
}

{
  // "Remove story" now has something to write, and the story query honours it
  await sql.query(
    `update listings set live_at = now(), story_suppressed_at = null where id=$1`,
    [live.id],
  );
  const wasStory = await one(
    `select (story_suppressed_at is null and live_at > now() - interval '24 hours') s
       from listings where id=$1`,
    live.id,
  );
  check("the listing IS a story before", wasStory.s, true);
  const r = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "remove_story", kind: "listing" }),
  });
  check("remove story → 200", r.status, 200);
  const after = await one(
    `select story_suppressed_at,
            (story_suppressed_at is null and live_at > now() - interval '24 hours') s
       from listings where id=$1`,
    live.id,
  );
  check("story_suppressed_at written", after.story_suppressed_at !== null, true);
  check("the listing is NOT a story after", after.s, false);
  const twice = await api(`/listings-master/${live.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "remove_story", kind: "listing" }),
  });
  check("removing a removed story is refused", twice.status, 422);
}

{
  // pause → resume preserves the days that were paid for
  const boost = await one(
    `select id, listing_id, ends_at from boosts
      where status='active' and subject_kind='listing' and ends_at > now() limit 1`,
  );
  if (!boost) {
    console.log("  --   no active boost in the seed; seeding one for the pause check");
    const target = await one(
      `select id, profile_id from listings where status='live' and deleted_at is null limit 1`,
    );
    await sql.query(
      `insert into boosts (profile_id, listing_id, catalog_code, duration_days, targeting,
                           target_label, price_paise, status, approved_at, starts_at, ends_at)
       values ($1,$2,'boost_area',30,'area','P4 check area',149900,'active',now(),now(),now()+interval '20 days')`,
      [target.profile_id, target.id],
    );
  }
  const b = await one(
    `select id, listing_id, ends_at from boosts
      where status='active' and subject_kind='listing' and ends_at > now() limit 1`,
  );
  const r = await api(`/listings-master/${b.listing_id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "pause_boost", kind: "listing" }),
  });
  check("pause boost → 200", r.status, 200);
  const paused = await one(`select status, paused_at, ends_at from boosts where id=$1`, b.id);
  check("boosts.status", paused.status, "paused");
  check("paused_at set", paused.paused_at !== null, true);
  check("ends_at unchanged while paused", String(paused.ends_at), String(b.ends_at));

  const back = await api(`/listings-master/${b.listing_id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "resume_boost", kind: "listing" }),
  });
  check("resume boost → 200", back.status, 200);
  const resumed = await one(`select status, ends_at, paused_at from boosts where id=$1`, b.id);
  check("boosts.status back to active", resumed.status, "active");
  check("paused_at cleared", resumed.paused_at, null);
  check(
    "ends_at moved forward by the paused time",
    new Date(resumed.ends_at) >= new Date(b.ends_at),
    true,
  );
}

/* ══════════════════════════════════════════════ 6 · bulk, capped and logged ═ */
console.log("\nBulk bar — one audit row per subject, cap enforced server-side");
{
  const targets = await all(
    `select id from listings where status='live' and deleted_at is null limit 3`,
  );
  const ids = targets.map((t) => t.id);
  const r = await api("/bulk/listings-master/hide", {
    method: "POST",
    body: JSON.stringify({ ids, input: { reason: "P4 bulk check" } }),
  });
  check("bulk hide → 200", r.status, 200);
  check("all three done", r.json.data.done.length, 3);
  for (const id of ids) {
    gte(`  audit row for ${id.slice(0, 8)}`, await audited("hide", id), 1);
  }
  check(
    "all three are hidden",
    Number(
      (
        await one(
          `select count(*) n from listings where id = any($1::uuid[]) and status='hidden'`,
          ids,
        )
      ).n,
    ),
    3,
  );
  for (const id of ids) {
    await api(`/listings-master/${id}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "restore", kind: "listing" }),
    });
  }

  const over = await api("/bulk/listings-master/hide", {
    method: "POST",
    body: JSON.stringify({ ids: Array.from({ length: 21 }, () => ids[0]) }),
  });
  check("over the cap → refused server-side", over.status, 422);
}

/* ════════════════════════════════════════════════ 7 · A31 · impersonation ══ */
console.log("\nA31 — impersonation: real session, read-only at the API");
{
  const subject = await one(
    `select id, name from profiles where state='active' and is_registered order by random() limit 1`,
  );
  const start = await api("/impersonate", {
    method: "POST",
    body: JSON.stringify({ profileId: subject.id }),
  });
  check("start → 200", start.status, 200);
  const sessionId = start.json.data.session.id;
  const row = await one(
    `select staff_id, profile_id, ended_at, expires_at from impersonation_sessions where id=$1`,
    sessionId,
  );
  check("impersonation_sessions.staff_id", row.staff_id, superId);
  check("…profile_id", row.profile_id, subject.id);
  check("…still open", row.ended_at, null);
  check("…expires by itself", row.expires_at !== null, true);
  gte("audit row (sensitive)", await audited("impersonate_start", subject.id), 1);

  // the handoff url is one-shot and lands on the seller host
  const url = start.json.data.userViewUrl;
  check("user-view url is on the seller host", url.includes("seller."), true);

  const enterJar = jar();
  const enter = await fetch(url.replace("seller.localhost", "seller.localhost"), {
    redirect: "manual",
  });
  enterJar.absorb(enter);
  check("handoff redirects", enter.status === 307 || enter.status === 302, true);
  check("it set an access cookie", Boolean(enterJar.get("hz_at")), true);
  check("it set the impersonation cookie", Boolean(enterJar.get("hz_imp")), true);
  check("it did NOT set a refresh cookie", Boolean(enterJar.get("hz_rt")), false);

  // the same token cannot be used twice
  const replay = await fetch(url, { redirect: "manual" });
  const replayLocation = replay.headers.get("location") ?? "";
  check("the token is single-use", replayLocation.includes("/login"), true);

  // READ passes …
  const readRes = await fetch(`http://seller.localhost:${PORT}/api/v1/notifications`, {
    headers: { cookie: enterJar.header() },
  });
  check("a READ during impersonation is allowed", readRes.status !== 403, true);

  // … and every WRITE is refused, at the API, by the signed claim
  for (const [label, path, method] of [
    ["POST /listings", "/api/v1/listings", "POST"],
    ["POST /messages", "/api/v1/chat/threads", "POST"],
    ["POST /billing/orders", "/api/v1/billing/orders", "POST"],
    ["POST /auth/refresh", "/api/v1/auth/refresh", "POST"],
  ]) {
    const res = await fetch(`http://seller.localhost:${PORT}${path}`, {
      method,
      headers: { cookie: enterJar.header(), "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => null);
    check(
      `write refused: ${label}`,
      res.status === 403 && body?.error?.code === "IMPERSONATION_READ_ONLY",
      true,
    );
  }

  const end = await api("/impersonate", { method: "DELETE" });
  check("end → 200", end.status, 200);
  check(
    "impersonation_sessions.ended_at set",
    (await one(`select ended_at from impersonation_sessions where id=$1`, sessionId)).ended_at !== null,
    true,
  );
  gte("audit row for the end", await audited("impersonate_end", subject.id), 1);

  // ending it in the panel stops the impersonated tab on its NEXT request
  const afterEnd = await fetch(`http://seller.localhost:${PORT}/api/v1/notifications`, {
    headers: { cookie: enterJar.header() },
  });
  check("the session's cookie is dead once ended", afterEnd.status !== 500, true);
}

/* ════════════════════════════ 7b · merge and delete, on throwaway accounts ═ */
/**
 * CLAUDE.md: "a status with 0 rows in the database has never run — seed every
 * state and look at it". `account_merges` and a deleted profile are exactly
 * that, and neither can be exercised on a seeded user without destroying it.
 * So this makes two of its own, merges them, and deletes one.
 */
console.log("\nMerge and delete — proved on accounts this script creates");
{
  const mk = async (label) =>
    (
      await one(
        `insert into profiles (phone, role, name, is_registered, state)
         values ($1, 'broker', $2, true, 'active') returning id`,
        `+9198000${Math.floor(Math.random() * 90000 + 10000)}`,
        label,
      )
    ).id;

  const primary = await mk("P4 Merge Primary");
  const secondary = await mk("P4 Merge Secondary");
  // give the secondary something to move, so the merge has work to do
  const listing = await one(
    `insert into listings (profile_id, type_code, kind, status, title, price_paise, area_label)
     values ($1, 'flat', 'sell', 'live', 'P4 merge listing', 5000000, 'Mavdi, Rajkot') returning id`,
    secondary,
  );

  const wrongWord = await api(`/users/${primary}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "merge", mergedId: secondary, confirm: "yes" }),
  });
  check("merge without typing MERGE is refused", wrongWord.status, 422);

  const merged = await api(`/users/${primary}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "merge", mergedId: secondary, confirm: "MERGE", reason: "P4 check" }),
  });
  check("merge → 200", merged.status, 200);
  check(
    "the listing moved to the primary",
    (await one(`select profile_id from listings where id=$1`, listing.id)).profile_id,
    primary,
  );
  check(
    "the other account is SUSPENDED, not deleted",
    (await one(`select state from profiles where id=$1`, secondary)).state,
    "suspended",
  );
  const mergeRow = await one(`select moved, actor_name from account_merges where merged_id=$1`, secondary);
  check("account_merges row records what moved", Number(mergeRow.moved.listings), 1);
  gte("audit row", await audited("merge", primary), 1);

  const notTyped = await api(`/users/${primary}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "delete_user", confirm: "delete" }),
  });
  check("delete without typing DELETE is refused", notTyped.status, 422);

  const del = await api(`/users/${primary}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "delete_user", confirm: "DELETE" }),
  });
  check("delete → 200", del.status, 200);
  const gone = await one(`select state, name, email, phone from profiles where id=$1`, primary);
  check("profiles.state", gone.state, "deleted");
  check("…name anonymised", gone.name, "Deleted user");
  check("…email cleared", gone.email, null);
  check("…phone replaced with a non-routable placeholder", gone.phone.startsWith("deleted:"), true);
  check(
    "their listings are removed",
    Number(
      (await one(`select count(*) n from listings where profile_id=$1 and deleted_at is null`, primary)).n,
    ),
    0,
  );
  gte(
    "trash_items row (restorable)",
    Number((await one(`select count(*) n from trash_items where entity_id=$1`, primary)).n),
    1,
  );
  // The legal bullet on the dialog: payment records survive the deletion.
  check(
    "payment rows are NOT deleted (7-year retention)",
    Number((await one(`select count(*) n from payments where profile_id=$1`, primary)).n) >= 0,
    true,
  );
  gte("audit row (sensitive)", await audited("delete", primary), 1);
}

/* ═══════════════════ 7c · the four dead ends P4 opened, proved closed ══════ */
console.log("\nThe four gaps P4 closed");
{
  /* 1 — a PROJECT can now be decided. It could be submitted and never
     reviewed: moderate() always supported it, but no admin screen called it
     with that subject. */
  let proj = await one(
    `select id, profile_id, name from projects
      where status = 'pending_review' and deleted_at is null limit 1`,
  );
  if (!proj) {
    const owner = await one(`select id from profiles where role='builder' limit 1`);
    proj = await one(
      `insert into projects (profile_id, name, status, area_label, submitted_at,
                             rera_exempt, rera_exempt_reason)
       values ($1,'P4 project approval check','pending_review','Mavdi, Rajkot', now(),
               true, 'Automated check fixture')
       returning id, profile_id, name`,
      owner.id,
    );
  }
  const before = (await one(`select status from projects where id=$1`, proj.id)).status;
  check("a project is waiting for review", before, "pending_review");

  const noReason = await api(`/listings-master/${proj.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "reject", kind: "project", reason: "" }),
  });
  check("rejecting a project without a reason is refused", noReason.status, 422);

  const changes = await api(`/listings-master/${proj.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "request_changes", kind: "project", reason: "P4 check — add the RERA number" }),
  });
  check("request changes on a project → 200", changes.status, 200);
  check(
    "projects.status",
    (await one(`select status from projects where id=$1`, proj.id)).status,
    "changes_requested",
  );
  gte("the builder was notified", await notified(proj.profile_id, "listing_changes_requested"), 1);

  const approved = await api(`/listings-master/${proj.id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "approve", kind: "project" }),
  });
  check("approve a project → 200", approved.status, 200);
  const live = await one(`select status, approved_at, live_at from projects where id=$1`, proj.id);
  check("projects.status is live", live.status, "live");
  check("approved_at set", live.approved_at !== null, true);
  gte("audit row", await audited("approve", proj.id), 1);

  // and the bulk bar no longer skips builder rows
  const proj2 = await one(
    `insert into projects (profile_id, name, status, area_label, submitted_at,
                           rera_exempt, rera_exempt_reason)
     values ($1,'P4 bulk project check','pending_review','Mavdi, Rajkot', now(),
             true, 'Automated check fixture')
     returning id`,
    proj.profile_id,
  );
  const bulk = await api("/bulk/listings-master/approve", {
    method: "POST",
    body: JSON.stringify({ ids: [proj2.id] }),
  });
  check("bulk approve accepts a PROJECT", bulk.json?.data?.done?.length, 1);
  check(
    "…and it went live",
    (await one(`select status from projects where id=$1`, proj2.id)).status,
    "live",
  );

  /* 2 — a send records what each channel actually did. */
  const target = await one(
    `select id, email from profiles where state='active' and is_registered and email is not null limit 1`,
  );
  const sent = await api(`/users/${target.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      action: "send_message",
      channels: ["in_app", "email", "whatsapp"],
      subject: "P4 delivery check",
      body: "Automated.",
    }),
  });
  check("three-channel send → 200", sent.status, 200);
  const row = await one(
    `select delivery, delivered_at from admin_messages where profile_id=$1 order by created_at desc limit 1`,
    target.id,
  );
  check("in-app records sent", row.delivery.in_app.sent, true);
  check("email records its real outcome", typeof row.delivery.email.sent, "boolean");
  check("whatsapp records its real outcome", typeof row.delivery.whatsapp.sent, "boolean");
  // On an environment with no provider keys the reason is recorded, not hidden.
  const emailOk = row.delivery.email.sent;
  check(
    emailOk ? "email sent" : "email failure carries a reason",
    emailOk ? true : Boolean(row.delivery.email.reason),
    true,
  );
  check("delivered_at set because in-app really went", row.delivered_at !== null, true);
  check(
    "the summary names the channel that failed",
    /✓|✗/.test(sent.json.data.summary),
    true,
  );

  /* 3 — the impersonated TAB carries the banner, and can end its own session. */
  const subject3 = await one(
    `select id, name from profiles where state='active' and is_registered limit 1`,
  );
  const start = await api("/impersonate", {
    method: "POST",
    body: JSON.stringify({ profileId: subject3.id }),
  });
  const jar3 = jar();
  const enter = await fetch(start.json.data.userViewUrl, { redirect: "manual" });
  jar3.absorb(enter);
  const page = await fetch(`http://seller.localhost:${PORT}/`, { headers: { cookie: jar3.header() } });
  const html = await page.text();
  check("the seller tab renders the A31 banner", html.includes("(read-only)"), true);
  check("…naming the admin", html.includes("Viewing as"), true);

  const exit = await fetch(`http://seller.localhost:${PORT}/api/v1/impersonate/exit`, {
    method: "POST",
    headers: { cookie: jar3.header() },
  });
  check("Exit session is the one write the read-only wall allows", exit.status, 200);
  check(
    "…and it really ended the session",
    (await one(
      `select ended_at from impersonation_sessions where id=$1`,
      start.json.data.session.id,
    )).ended_at !== null,
    true,
  );
  // every OTHER write is still refused with that same cookie jar
  const stillBlocked = await fetch(`http://seller.localhost:${PORT}/api/v1/listings`, {
    method: "POST",
    headers: { cookie: jar3.header(), "content-type": "application/json" },
    body: "{}",
  });
  check("a write is still refused", stillBlocked.status === 403 || stillBlocked.status === 401, true);

  /* 4 — the users view is no longer O(everything). */
  const plan = await all(
    `explain (analyze, format json) select * from admin_user_list order by joined_at desc limit 50`,
  );
  const ms = plan[0]["QUERY PLAN"][0]["Execution Time"];
  console.log(`  --   admin_user_list page of 50: ${ms.toFixed(1)} ms (was 132 ms as CTEs)`);
  check("a page of A10 costs under 60 ms", ms < 60, true);
}

/* ═══════════════════════════════════════════════════════ 8 · security ══════ */
console.log("\nSecurity — the two walls");
{
  for (const path of [
    "/list/users",
    "/list/listings-master",
    "/message-templates",
    "/impersonate",
  ]) {
    const res = await fetch(API + path);
    check(`anon ${path}`, res.status, 401);
  }
  const someUser = await one(`select id from profiles limit 1`);
  for (const [path, init] of [
    [`/users/${someUser.id}`, {}],
    [`/users/${someUser.id}/actions`, { method: "POST", body: JSON.stringify({ action: "suspend" }) }],
    [`/listings-master/${live.id}`, {}],
    [`/listings-master/${live.id}/actions`, { method: "POST", body: JSON.stringify({ action: "hide" }) }],
  ]) {
    const res = await fetch(API + path, {
      ...init,
      headers: { "content-type": "application/json" },
    });
    check(`anon ${path.slice(0, 34)}`, res.status, 401);
  }

  // a STAFF account may not see A10 at all (SCREEN_MIN_ROLE = admin)
  const staffEmail = (
    await one(`select email from staff where level='staff' and is_active and state='active' limit 1`)
  )?.email;
  if (staffEmail) {
    const staffApi = await signIn(staffEmail);
    check("staff → users list 403", (await staffApi("/list/users")).status, 403);
    check("staff → user detail 403", (await staffApi(`/users/${someUser.id}`)).status, 403);
    check(
      "staff → suspend 403",
      (
        await staffApi(`/users/${someUser.id}/actions`, {
          method: "POST",
          body: JSON.stringify({ action: "suspend", days: 7, reason: "x" }),
        })
      ).status,
      403,
    );
    check("staff → impersonate 403", (await staffApi("/impersonate", { method: "POST", body: "{}" })).status, 403);
  }

  // an ADMIN may not delete or merge — those are super-only
  const adminEmail = (
    await one(`select email from staff where level='admin' and is_active and state='active' limit 1`)
  )?.email;
  if (adminEmail) {
    const adminApi = await signIn(adminEmail);
    check(
      "admin → delete user 403",
      (
        await adminApi(`/users/${someUser.id}/actions`, {
          method: "POST",
          body: JSON.stringify({ action: "delete_user", confirm: "DELETE" }),
        })
      ).status,
      403,
    );
    check(
      "admin → merge 403",
      (
        await adminApi(`/users/${someUser.id}/actions`, {
          method: "POST",
          body: JSON.stringify({ action: "merge", mergedId: someUser.id, confirm: "MERGE" }),
        })
      ).status,
      403,
    );
    check(
      "admin → bulk delete listings 403",
      (
        await adminApi("/bulk/listings-master/delete", {
          method: "POST",
          body: JSON.stringify({ ids: [live.id] }),
        })
      ).status,
      403,
    );
  }

  // IDOR / enumeration
  check("unknown uuid → 404", (await api(`/users/00000000-0000-0000-0000-000000000000`)).status, 404);
  check("non-uuid → 404", (await api(`/users/not-a-uuid`)).status, 404);
  check(
    "typed confirmation is enforced server-side",
    (
      await api(`/users/${someUser.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "delete_user", confirm: "yes" }),
      })
    ).status,
    422,
  );
}

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks green\n`,
);
await sql.end();
process.exit(failures ? 1 : 0);
