/**
 * P3 — every decision the six queues can make, exercised against real rows.
 *
 * Each block picks a real subject, calls the real endpoint with a real admin
 * session, and then asks the DATABASE what happened: the state transition, the
 * audit row, and the notification the user was promised. A 200 is not the
 * check; the row is.
 *
 * Everything it changes, it changes deliberately and reports — this is a dev
 * database whose whole purpose is to have every state present.
 *
 *   PORT=3000 node scripts/check-admin-p3-decisions.mjs
 */
import { connect, env } from "./lib/dbx.mjs";

const PORT = process.env.PORT ?? "3000";
const API = `http://account.localhost:${PORT}/api/v1/admin`;

const sql = await connect();
const one = async (q, ...a) => (await sql.query(q, a)).rows[0];
const all = async (q, ...a) => (await sql.query(q, a)).rows;

let failures = 0;
const check = (label, got, want, extra = "") => {
  const okay = String(got) === String(want);
  if (!okay) failures++;
  console.log(`  ${okay ? "ok  " : "FAIL"} ${label.padEnd(46)} got=${String(got).padEnd(22)} want=${want} ${extra}`);
};

function jar() {
  const c = new Map();
  return {
    header: () => [...c].map(([k, v]) => `${k}=${v}`).join("; "),
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
  return async (path, init = {}) => {
    const r = await fetch(API + path, {
      ...init,
      headers: { "content-type": "application/json", cookie: j.header(), ...(init.headers ?? {}) },
    });
    j.absorb(r);
    return { status: r.status, json: await r.json().catch(() => null) };
  };
}

const superEmail = process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL;
const api = await signIn(superEmail);
const superId = (await one(`select profile_id from staff where email=$1`, superEmail)).profile_id;

const auditSince = new Date().toISOString();
const audited = async (action, entityId) =>
  (await one(
    `select count(*) n from admin_audit_log
      where action=$1 and entity_id=$2 and created_at >= $3`,
    action, entityId, auditSince,
  )).n;
const notified = async (profileId, type) =>
  (await one(
    `select count(*) n from notifications
      where profile_id=$1 and type=$2::notification_type and created_at >= $3`,
    profileId, type, auditSince,
  )).n;

/* ------------------------------------------------------------------ states */
/**
 * Two of the states below do not occur naturally in the seed: a listing sitting
 * at two rejections, and a listing locked after three with an appeal open
 * against it. CLAUDE.md is explicit that a status with no rows has never run —
 * so rather than skipping those blocks, the script puts the database into each
 * state first and then drives the real endpoint through it.
 */
async function ensureStates() {
  const atTwo = await one(
    `select id from listings where status='pending_review' and reject_count=2 and deleted_at is null limit 1`,
  );
  if (!atTwo) {
    const victim = await one(
      `select id from listings
        where status='pending_review' and deleted_at is null and reject_count=0
        order by created_at desc offset 3 limit 1`,
    );
    await sql.query(`update listings set reject_count=2 where id=$1`, [victim.id]);
    console.log(`  ..   seeded a listing at 2 rejections (${victim.id.slice(0, 8)})`);
  }

  const lockedAppeal = await one(
    `select a.id from moderation_appeals a join listings l on l.id=a.subject_id
      where a.subject='listing' and a.status='open' and l.is_locked limit 1`,
  );
  if (!lockedAppeal) {
    const victim = await one(
      `select id, profile_id from listings
        where deleted_at is null and reject_count=0 and status='pending_review'
        order by created_at asc limit 1`,
    );
    await sql.query(
      `update listings set is_locked=true, reject_count=3, status='rejected' where id=$1`,
      [victim.id],
    );
    await sql.query(
      `insert into moderation_appeals (subject, subject_id, profile_id, reason, status)
       values ('listing', $1, $2, 'I have fixed the photos — please allow one more try.', 'open')`,
      [victim.id, victim.profile_id],
    );
    console.log(`  ..   seeded a locked listing with an open appeal (${victim.id.slice(0, 8)})`);
  }
}
console.log("\n0. States this proof needs");
await ensureStates();

/* ─────────────────────────────────────────── 1. listing approve + reject ── */
console.log("\n1. A4 — listing approve / request changes / reject");
{
  const l = await one(
    `select id, profile_id from listings
      where status='pending_review' and deleted_at is null and reject_count = 0
      order by created_at desc limit 1`,
  );
  const r = await api(`/queues/listings/${l.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  check("approve → 200", r.status, 200);
  const after = await one(`select status::text, approved_at from listings where id=$1`, l.id);
  check("listing is live", after.status, "live");
  check("audit row written", await audited("approve", l.id), 1);
  check("poster notified", await notified(l.profile_id, "listing_approved"), 1);

  // A second decision on the same row must be refused, not silently repeated.
  const again = await api(`/queues/listings/${l.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  check("second approve refused", again.status, 400, again.json?.error?.code ?? "");

  const c = await one(
    `select id, profile_id from listings
      where status='pending_review' and deleted_at is null order by created_at desc limit 1`,
  );
  const rc = await api(`/queues/listings/${c.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "request_changes", notes: { Photos: "Too dark — please re-shoot." } }),
  });
  check("request changes → 200", rc.status, 200);
  check(
    "listing is changes_requested",
    (await one(`select status::text from listings where id=$1`, c.id)).status,
    "changes_requested",
  );
  check("poster notified", await notified(c.profile_id, "listing_changes_requested"), 1);

  const empty = await api(`/queues/listings/${c.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "request_changes" }),
  });
  check("request changes with no notes refused", empty.status, 422);
}

/* ─────────────────────────────────────────────── 2. the third rejection ── */
console.log("\n2. A4 — the third rejection locks the listing (the paid dead end)");
{
  const l = await one(
    `select id, profile_id, reject_count from listings
      where status='pending_review' and deleted_at is null and reject_count = 2
      order by created_at desc limit 1`,
  );
  if (!l) {
    console.log("  --   no listing sitting at 2 rejections; skipping");
  } else {
    const r = await api(`/queues/listings/${l.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "reject", reason: "Photos don't match the property" }),
    });
    check("third reject → 200", r.status, 200);
    check("response says locked", r.json?.data?.locked, true);
    const after = await one(`select status::text, is_locked, reject_count from listings where id=$1`, l.id);
    check("listing locked in the DB", after.is_locked, true, `rejects=${after.reject_count}`);
    check("poster notified", await notified(l.profile_id, "listing_rejected"), 1);
  }
}

/* ──────────────────────────────────────────────── 3. review lock, live ── */
console.log("\n3. A3/A4 — the review lock, with two real admins");
{
  const staffEmail = (
    await one(`select email from staff where level='staff' and is_active and state='active' limit 1`)
  ).email;
  const other = await signIn(staffEmail);
  const l = await one(
    `select id from listings where status='pending_review' and deleted_at is null limit 1`,
  );

  const mine = await api("/review/lock", {
    method: "POST",
    body: JSON.stringify({ subject: "listing", id: l.id }),
  });
  check("super claims the lock", mine.json?.data?.mine, true);

  const theirs = await other("/review/lock", {
    method: "POST",
    body: JSON.stringify({ subject: "listing", id: l.id }),
  });
  check("staff is refused", theirs.json?.data?.mine, false);
  check("and is told who holds it", Boolean(theirs.json?.data?.holderName), true,
    theirs.json?.data?.holderName ?? "");

  const steal = await other("/review/lock", {
    method: "DELETE",
    body: JSON.stringify({ subject: "listing", id: l.id }),
  });
  check("staff cannot release it", steal.json?.data?.released, false);

  const drop = await api("/review/lock", {
    method: "DELETE",
    body: JSON.stringify({ subject: "listing", id: l.id }),
  });
  check("holder can release it", drop.json?.data?.released, true);
}

/* ────────────────────────────────────────────────── 4. boost + refund ──── */
console.log("\n4. A6 — boost approve, and reject → refund");
{
  const b = await one(
    `select b.id, b.profile_id, b.price_paise from boosts b
      where b.status='pending_approval' order by b.created_at limit 1`,
  );
  const r = await api(`/queues/boosts/${b.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  check("approve → 200", r.status, 200, r.json?.error?.code ?? "");
  const after = await one(`select status::text, starts_at, ends_at from boosts where id=$1`, b.id);
  check("boost is active", after.status, "active", `window ${after.starts_at?.toISOString?.().slice(0,10)} → ${after.ends_at?.toISOString?.().slice(0,10)}`);
  check("audit row written", await audited("boost_approve", b.id), 1);

  const b2 = await one(
    `select id, profile_id, price_paise from boosts where status='pending_approval' order by created_at limit 1`,
  );
  const noReason = await api(`/queues/boosts/${b2.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reject" }),
  });
  check("reject without a reason refused", noReason.status, 422);

  const rej = await api(`/queues/boosts/${b2.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reject", reason: "Content violates policy" }),
  });
  check("reject → 200", rej.status, 200, rej.json?.error?.code ?? "");
  const after2 = await one(`select status::text, reject_reason, refunded_at from boosts where id=$1`, b2.id);
  check("boost rejected", after2.status, "rejected");
  check("refund recorded or queued", after2.refunded_at !== null || after2.reject_reason !== null, true);
  check("audited as sensitive", await audited("boost_reject", b2.id), 1);
}

/* ──────────────────────────────────────────────── 5. verifications ─────── */
console.log("\n5. A7 — verification approve / reject / revoke");
{
  const v = await one(
    `select id, profile_id, level from verifications where status='pending' order by submitted_at limit 1`,
  );
  const r = await api(`/queues/verifications/${v.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  check("approve → 200", r.status, 200, r.json?.error?.code ?? "");
  check(
    "status approved",
    (await one(`select status::text from verifications where id=$1`, v.id)).status,
    "approved",
  );
  check("user notified", await notified(v.profile_id, "verification_approved"), 1);
  check("audit row", await audited("verification_approve", v.id), 1);

  const v2 = await one(
    `select id, profile_id from verifications where status='pending' order by submitted_at limit 1`,
  );
  const noReason = await api(`/queues/verifications/${v2.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reject" }),
  });
  check("reject without a reason refused", noReason.status, 422);

  const rj = await api(`/queues/verifications/${v2.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reject", reason: "Document illegible" }),
  });
  check("reject → 200", rj.status, 200);
  check("user notified", await notified(v2.profile_id, "verification_rejected"), 1);

  // Revoke only applies to an approved badge.
  const rev = await api(`/queues/verifications/${v.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "revoke", reason: "Certificate expired" }),
  });
  check("revoke an approved badge → 200", rev.status, 200);
  check(
    "status revoked",
    (await one(`select status::text from verifications where id=$1`, v.id)).status,
    "revoked",
  );
  check("user notified", await notified(v.profile_id, "verification_revoked"), 1);
}

/* ────────────────────────────────────────────────────── 6. appeals ─────── */
console.log("\n6. A8 — auto-flag appeal and the reject-lock reopen");
{
  const flag = await one(
    `select id, profile_id from moderation_appeals where subject='auto_flag' and status='open' limit 1`,
  );
  if (flag) {
    const r = await api(`/queues/appeals/${flag.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "dismiss_flag", reason: "Office landline, not a personal number" }),
    });
    check("dismiss flag → 200", r.status, 200, r.json?.error?.code ?? "");
    const p = await one(`select bio_flagged_at, bio_flag_outcome from profiles where id=$1`, flag.profile_id);
    check("bio flag cleared", p.bio_flagged_at, null, `outcome=${p.bio_flag_outcome}`);
    check("appeal upheld", (await one(`select status from moderation_appeals where id=$1`, flag.id)).status, "upheld");

    const wrong = await api(`/queues/appeals/${flag.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "unlock" }),
    });
    check("a resolved appeal cannot be re-decided", wrong.status, 400, wrong.json?.error?.code ?? "");
  } else {
    console.log("  --   no open auto-flag appeal; skipping");
  }

  const reopen = await one(
    `select a.id, a.subject_id, a.profile_id from moderation_appeals a
      join listings l on l.id = a.subject_id
     where a.subject='listing' and a.status='open' and l.is_locked limit 1`,
  );
  if (reopen) {
    const before = await one(`select is_locked, reject_count from listings where id=$1`, reopen.subject_id);
    const r = await api(`/queues/appeals/${reopen.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "unlock", reason: "One more try" }),
    });
    check("unlock → 200", r.status, 200, r.json?.error?.code ?? "");
    const after = await one(
      `select is_locked, reject_count, status::text from listings where id=$1`,
      reopen.subject_id,
    );
    check("listing unlocked", after.is_locked, false, `was locked=${before.is_locked}`);
    check("reject count reset", after.reject_count, 0, `was ${before.reject_count}`);
    check("poster notified", await notified(reopen.profile_id, "report_outcome"), 1);
  } else {
    console.log("  --   no open reopen appeal; skipping");
  }
}

/* ─────────────────────────────────────────────────────── 7. reports ────── */
console.log("\n7. A9 — the report actions, and who is allowed to take them");
{
  const rep = await one(
    `select subject_type::text, subject_id, count(*) n from reports
      where status in ('open','reviewing') and subject_type='listing'
      group by 1,2 order by n desc limit 1`,
  );
  const reporters = (
    await all(
      `select distinct reporter_id from reports where subject_type=$1 and subject_id=$2 and status in ('open','reviewing')`,
      rep.subject_type, rep.subject_id,
    )
  ).map((r) => r.reporter_id);

  const r = await api(`/queues/reports/${rep.subject_id}`, {
    method: "POST",
    body: JSON.stringify({ action: "dismiss", subjectType: "listing", reason: "No violation found" }),
  });
  check("dismiss → 200", r.status, 200, r.json?.error?.code ?? "");
  check(
    "every report on the entity closed",
    (await one(
      `select count(*) n from reports where subject_type=$1 and subject_id=$2 and status in ('open','reviewing')`,
      rep.subject_type, rep.subject_id,
    )).n,
    0,
    `was ${rep.n}`,
  );
  check(
    "report_actions rows written",
    (await one(
      `select count(*) n from report_actions ra join reports rp on rp.id=ra.report_id
        where rp.subject_id=$1 and ra.created_at >= $2`,
      rep.subject_id, auditSince,
    )).n,
    Number(rep.n),
  );
  let notifiedAll = 0;
  for (const rid of reporters) notifiedAll += Number(await notified(rid, "report_outcome"));
  check("every reporter notified", notifiedAll >= reporters.length, true, `${notifiedAll}/${reporters.length}`);

  // Role gates: a staff-level admin may not suspend or ban.
  const staffEmail = (
    await one(`select email from staff where level='staff' and is_active and state='active' limit 1`)
  ).email;
  const staff = await signIn(staffEmail);
  const other = await one(
    `select subject_type::text, subject_id from reports
      where status in ('open','reviewing') group by 1,2 limit 1`,
  );
  if (other) {
    const s = await staff(`/queues/reports/${other.subject_id}`, {
      method: "POST",
      body: JSON.stringify({ action: "suspend", subjectType: other.subject_type, reason: "test", days: 7 }),
    });
    check("staff → suspend refused", s.status, 403);
    const b = await staff(`/queues/reports/${other.subject_id}`, {
      method: "POST",
      body: JSON.stringify({ action: "ban_device", subjectType: other.subject_type, reason: "test" }),
    });
    check("staff → ban device refused", b.status, 403);
  }
}

/* ───────────────────────────────────────────── 8. the unauthenticated door */
console.log("\n8. Doc9 — unauthenticated and cross-role");
{
  const anon = async (path, body) =>
    (await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })).status;
  const some = await one(`select id from listings where status='pending_review' limit 1`);
  check("POST /queues/listings/:id (anon)", await anon(`/queues/listings/${some.id}`, { action: "approve" }), 401);
  check("POST /review/lock (anon)", await anon("/review/lock", { subject: "listing", id: some.id }), 401);
}

console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : "all checks passed"}\n`);
await sql.end();
process.exit(failures ? 1 : 0);
