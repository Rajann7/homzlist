/**
 * Seeds Module 9 (Boost placement) so every boost state, every targeting scope
 * and every subject kind is a real row that can be looked at on screen:
 *
 *   • all 8 statuses — pending_approval, active, paused, expired, rejected,
 *     stopped, cancelled (and one pending_payment, which the status screen must
 *     NOT show);
 *   • all 4 targeting scopes with RESOLVED location ids, including a
 *     cross-city case (a Rajkot-city boost that must not top a Surat feed, and a
 *     Surat state/All-India boost that must reach a Rajkot viewer);
 *   • all 3 subject kinds — listing, project and requirement (the requirement one
 *     is the "locked-but-top" case);
 *   • across owner / broker / builder, so each role has something on its screen;
 *   • one active boost ending inside 24h, so the "ends tomorrow · Renew in 1 tap"
 *     banner and the expiry-reminder job both have a subject.
 *
 * Every boost is attached to a REAL paid order + payment (cloned from an existing
 * successful one) so the refund paths have something to refund and the queue's
 * "Payment verified" check is honest rather than decorative.
 *
 * Idempotent: re-running deletes only the rows tagged `m9-seed` in
 * `stopped_reason`/`reject_reason` or recorded in boost_reviews. Dev only.
 *
 *   node scripts/seed-module9.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const c = await dbConnect();
const q = (s, p) => c.query(s, p);
const one = async (s, p) => (await q(s, p)).rows[0];
const TAG = "m9-seed";

console.log("Module 9 seed — boost placement\n");

// ---------------------------------------------------------------------------
// 0. Clean up what a previous run made
// ---------------------------------------------------------------------------
// Identified by the tagged Razorpay order id — NOT by the reason text, because the
// P11 Past cards render `stopped_reason`/`reject_reason` verbatim and a seed marker
// in there shows up on the seller's screen. Every seeded boost therefore gets an
// order, including the pending_payment one.
const oldIds = (await q(
  `select b.id, b.order_id
     from boosts b
     left join orders o on o.id = b.order_id
    where o.razorpay_order_id like 'order_' || $1 || '%'`,
  [TAG],
)).rows;
if (oldIds.length) {
  await q(`delete from boost_reminders where boost_id = any($1)`, [oldIds.map((b) => b.id)]);
  await q(`delete from boost_reviews  where boost_id = any($1)`, [oldIds.map((b) => b.id)]);
  await q(`delete from boosts         where id       = any($1)`, [oldIds.map((b) => b.id)]);
  const orders = oldIds.map((b) => b.order_id).filter(Boolean);
  if (orders.length) {
    await q(`delete from invoices where order_id = any($1)`, [orders]);
    await q(`delete from payments where order_id = any($1)`, [orders]);
    await q(`delete from orders   where id       = any($1)`, [orders]);
  }
  console.log(`cleared ${oldIds.length} boost(s) from a previous run`);
}

// ---------------------------------------------------------------------------
// 1. Handles: locations, catalog rates, and one seller per role
// ---------------------------------------------------------------------------
const cities = Object.fromEntries(
  (await q(`select id, name from locations where level='city'`)).rows.map((r) => [r.name, r.id]),
);
const states = Object.fromEntries(
  (await q(`select id, name from locations where level='state'`)).rows.map((r) => [r.name, r.id]),
);
console.log(`cities: ${Object.keys(cities).join(", ")}`);

const rates = Object.fromEntries(
  (await q(`select code, price_paise, period_days from plan_catalog where kind='boost'`)).rows
    .map((r) => [r.code, r]),
);
if (!rates.boost7 || !rates.boost30) throw new Error("boost catalog rows missing — run migrations first");

/**
 * A seller of each role who actually has live inventory to boost.
 *
 * Builders are matched on PROJECTS. They do not post listings — the product
 * routes them to projects (and to requirements through a project), so demanding
 * "a builder with a live listing" asked for something that cannot exist, and
 * this seed threw before writing a single row. The boosts schema has allowed
 * subject_kind = project all along; until now nothing had ever created one.
 */
async function sellerWithLiveListing(role, need = 1) {
  if (role === "builder") {
    return one(
      `select p.id, p.name, p.role, p.city_id
         from profiles p
        where p.role = $1
          and (select count(*) from projects pr
                where pr.profile_id = p.id and pr.status = 'live' and pr.deleted_at is null) >= $2
        order by (select count(*) from projects pr2
                   where pr2.profile_id = p.id and pr2.status = 'live' and pr2.deleted_at is null) desc
        limit 1`,
      [role, need],
    );
  }
  // Rank by the count of listings this seed can actually USE. Ordering by the
  // profile's total listing count picked someone with plenty of drafts and
  // sold rows but only one live one, and the fixtures below index into
  // ownerListings[1] / brokerListings[4] — so the seed died on an undefined.
  return one(
    `select p.id, p.name, p.role, p.city_id
       from profiles p
      where p.role = $1
        and (select count(*) from listings l
              where l.profile_id = p.id and l.status='live' and l.availability='available') >= $2
      order by (select count(*) from listings l2
                 where l2.profile_id = p.id and l2.status='live' and l2.availability='available') desc
      limit 1`,
    [role, need],
  );
}
/**
 * Put a seller's own listings back into a boostable state.
 *
 * check-boost-live.mjs exercises "owner marks a listing sold while its boost is
 * pending approval" and the moderation paths, and it does not put those
 * listings back. So every run left fewer live listings than the one before, and
 * by the third run the seed's own fixtures were pointing at sold and
 * changes_requested rows — the boost queue then refused to approve them
 * (LISTING_STATE_LOCKED) and the check failed on state it had itself created.
 *
 * Only this seller's own rows are touched, and only into the state the fixtures
 * need. Other sellers keep their draft / changes_requested / sold listings, so
 * those screens still have something to show.
 */
async function ensureBoostableInventory(profileId, want) {
  const live = async () => Number((await one(
    `select count(*) n from listings
      where profile_id=$1 and status='live' and availability='available'`, [profileId])).n);
  if (await live() >= want) return;
  const spare = (await q(
    `select id from listings
      where profile_id=$1 and deleted_at is null
        and (status <> 'live' or availability <> 'available')
      order by (status = 'changes_requested') desc, (status = 'draft') desc, updated_at desc
      limit $2`, [profileId, want])).rows;
  for (const r of spare) {
    if (await live() >= want) break;
    await q(
      `update listings
          set status='live', availability='available',
              live_at = coalesce(live_at, now()), approved_at = coalesce(approved_at, now()),
              sold_at = null, updated_at = now()
        where id=$1`, [r.id]);
  }
}

const sellers = {
  // One usable subject is enough — liveListings() cycles to fill the fixtures.
  owner: await sellerWithLiveListing("owner", 1),
  broker: await sellerWithLiveListing("broker", 1),
  builder: await sellerWithLiveListing("builder", 1),
};
// The counts the fixture list below indexes into.
if (sellers.owner) await ensureBoostableInventory(sellers.owner.id, 4);
if (sellers.broker) await ensureBoostableInventory(sellers.broker.id, 5);
for (const [role, s] of Object.entries(sellers)) {
  if (!s) throw new Error(`no ${role} with a live listing — run the earlier module seeds first`);
  console.log(`${role.padEnd(8)} ${s.name}`);
}

/**
 * n subjects to hang fixtures on, CYCLING when the seller has fewer.
 *
 * The fixture list below indexes brokerListings[4], but no broker in the demo
 * data has five live+available listings — the best has three — so a plain
 * LIMIT returned a short array and the seed died on an undefined id. A boost is
 * a row per purchase, not a property of the listing, so pointing two fixtures
 * at the same subject is a fair demo; failing to seed anything is not.
 */
async function liveListings(profileId, n) {
  const rows = (await q(
    `select id, title, area_id, city_id, state_id from listings
      where profile_id=$1 and status='live' and availability='available'
      order by live_at desc nulls last`,
    [profileId],
  )).rows;
  if (!rows.length) return [];
  return Array.from({ length: n }, (_, i) => rows[i % rows.length]);
}

// A live project (builder) and a live requirement (any role) so all three
// subject kinds are exercised.
const project = await one(
  `select id, name, profile_id, area_id, city_id, state_id from projects
    where status='live' and deleted_at is null order by live_at desc nulls last limit 1`,
);
// Must have a resolvable location, or its boost would target nothing: some live
// rows carry a null city_id and an empty area_ids.
const requirement = await one(
  `select r.id, r.profile_id, r.area_ids, r.city_id from requirements r
    where r.status='live' and r.is_active = true and r.deleted_at is null
      and r.city_id is not null and coalesce(array_length(r.area_ids,1),0) > 0
    order by r.created_at desc limit 1`,
);
console.log(`project: ${project ? project.name : "(none live)"}`);
console.log(`requirement: ${requirement ? requirement.id.slice(0, 8) : "(none live)"}\n`);

// ---------------------------------------------------------------------------
// 2. A real paid order + payment per boost
// ---------------------------------------------------------------------------
// Cloned from the catalog exactly as `createOrderRow` would, so the amount, the
// terms snapshot and the payment row are all consistent — the boost queue's
// "Payment verified" check reads the payment, and the refund sweep reads it too.
async function paidOrder(profileId, code) {
  const rate = rates[code];
  const terms = await one(`select row_to_json(pc) as t from plan_catalog pc where code=$1`, [code]);
  const gst = Math.round((rate.price_paise * 1800) / 10000 / (1 + 1800 / 10000)); // inclusive 18%
  const taxable = rate.price_paise - gst;
  const order = await one(
    `insert into orders (profile_id, kind, catalog_code, terms_snapshot, base_paise, discount_paise,
                         taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, currency,
                         place_of_supply, razorpay_order_id, status)
     values ($1,'boost',$2,$3,$4,0,$5,$6,$7,0,$8,'INR','GJ',$9,'paid')
     returning id`,
    [profileId, code, terms.t, rate.price_paise, taxable, Math.round(gst / 2), gst - Math.round(gst / 2),
     rate.price_paise, `order_${TAG}_${Math.random().toString(36).slice(2, 12)}`],
  );
  // `razorpay_payment_id` is deliberately NULL: this payment never went through
  // Razorpay. A fake `pay_...` id here made the refund sweep call the live
  // Razorpay API with an id it has never seen — the call failed, the compensating
  // path released the claim, and the refund retried forever, so `refunded_at`
  // never got set and the money half looked broken when it wasn't. With no id,
  // `refundRejectedBoosts` takes its dev branch and the refund completes locally.
  await q(
    `insert into payments (order_id, profile_id, razorpay_payment_id, amount_paise, currency, status,
                           method, method_detail)
     values ($1,$2,null,$3,'INR','success','upi','UPI · PhonePe')`,
    [order.id, profileId, rate.price_paise],
  );
  return order.id;
}

/**
 * The label the app itself would store (lib/billing/boost.ts · resolveTarget),
 * read from the locations table. Hardcoding these in the seed is how a "Rajkot"
 * label ended up on a Surat boost.
 */
const nameOf = async (id) => (id ? (await one(`select name from locations where id=$1`, [id]))?.name ?? null : null);
async function labelFor(targeting, geo) {
  if (targeting === "india") return "All India";
  if (targeting === "state") return (await nameOf(geo.stateId)) ?? "All India";
  if (targeting === "city") return (await nameOf(geo.cityId)) ?? "All India";
  const area = await nameOf(geo.areaId);
  const city = await nameOf(geo.cityId);
  return [area, city].filter(Boolean).join(", ") || "This area";
}

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

let made = 0;
/**
 * One boost row. `targeting` decides which of the resolved ids are set — exactly
 * what `resolveTarget` does in lib/billing/boost.ts, so the seeded rows and the
 * app's own rows are indistinguishable to placement.
 */
async function boost({
  profileId, subjectKind, subjectId, code, targeting, geo, label = null,
  status, startsAt = null, endsAt = null, approvedAt = null, pausedAt = null,
  rejectReason = null, stoppedReason = null, refundedAt = null, withOrder = true,
}) {
  const orderId = withOrder ? await paidOrder(profileId, code) : null;
  label = label ?? (await labelFor(targeting, geo));
  const target = {
    area:  { area: geo.areaId, city: geo.cityId, state: geo.stateId },
    city:  { area: null,       city: geo.cityId, state: geo.stateId },
    state: { area: null,       city: null,       state: geo.stateId },
    india: { area: null,       city: null,       state: null },
  }[targeting];

  const row = await one(
    `insert into boosts (profile_id, listing_id, subject_kind, order_id, catalog_code, duration_days,
                         targeting, target_label, target_area_id, target_city_id, target_state_id,
                         price_paise, status, approved_at, starts_at, ends_at, paused_at,
                         reject_reason, stopped_reason, refunded_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     returning id, status, targeting, subject_kind`,
    [profileId, subjectId, subjectKind, orderId, code, rates[code].period_days,
     targeting, label, target.area, target.city, target.state,
     rates[code].price_paise, status, approvedAt, startsAt, endsAt, pausedAt,
     rejectReason, stoppedReason, refundedAt],
  );
  made++;
  return row;
}

// ---------------------------------------------------------------------------
// 3. The states
// ---------------------------------------------------------------------------
const rajkot = cities.Rajkot;
const surat = cities.Surat;
const gujarat = states.Gujarat;

const ownerListings = await liveListings(sellers.owner.id, 4);
const brokerListings = await liveListings(sellers.broker.id, 5);
const builderProjectRows = (await q(
  `select id, name, area_id, city_id, state_id from projects
    where profile_id=$1 and status='live' and deleted_at is null
    order by live_at desc nulls last`,
  [sellers.builder.id],
)).rows;
const builderProjects = builderProjectRows.length
  ? Array.from({ length: 2 }, (_, i) => builderProjectRows[i % builderProjectRows.length])
  : [];

const geoOf = (l) => ({ areaId: l.area_id, cityId: l.city_id, stateId: l.state_id ?? gujarat });

// --- ACTIVE, area-targeted (the plain top-of-feed case) --------------------
await boost({
  profileId: sellers.broker.id, subjectKind: "listing", subjectId: brokerListings[0].id,
  code: "boost30", targeting: "area", geo: geoOf(brokerListings[0]),
  status: "active",
  startsAt: iso(now - 6 * DAY), endsAt: iso(now + 24 * DAY), approvedAt: iso(now - 6 * DAY),
  stoppedReason: null,
});

// --- ACTIVE, city-targeted, ENDS TOMORROW → renew banner + reminder job ----
await boost({
  profileId: sellers.owner.id, subjectKind: "listing", subjectId: ownerListings[0].id,
  code: "boost7", targeting: "city", geo: geoOf(ownerListings[0]),
  status: "active",
  startsAt: iso(now - 6 * DAY), endsAt: iso(now + 0.6 * DAY), approvedAt: iso(now - 6 * DAY),
});

// --- ACTIVE, state-targeted: an OUT-OF-RAJKOT listing that must reach Rajkot -
// This is the case that proved wider targeting did nothing before Module 9 — a
// city-scoped feed can never return it, so placement has to inject it.
//
// It used to insist on a SURAT listing, and by 8 Aug 2026 the fixtures had none
// live, so the seed printed a warning, created no such boost, and
// `check:boost`'s wide-targeting assertion had been failing on missing fixture
// data rather than on the rule. Surat is still preferred (the check's Surat
// viewer makes the "and is absent for the other city" half readable), but ANY
// live listing outside Rajkot proves the same rule — so it falls back to one.
const suratListing =
  (await one(
    `select l.id, l.profile_id, l.area_id, l.city_id, l.state_id, l.title
       from listings l where l.status='live' and l.availability='available' and l.city_id=$1
       order by l.live_at desc nulls last limit 1`,
    [surat],
  )) ??
  (await one(
    `select l.id, l.profile_id, l.area_id, l.city_id, l.state_id, l.title
       from listings l where l.status='live' and l.availability='available'
         and l.city_id is not null and l.city_id <> $1
       order by l.live_at desc nulls last limit 1`,
    [rajkot],
  ));
if (suratListing) {
  await boost({
    profileId: suratListing.profile_id, subjectKind: "listing", subjectId: suratListing.id,
    code: "boost30", targeting: "state", geo: geoOf(suratListing),
  status: "active",
    startsAt: iso(now - 2 * DAY), endsAt: iso(now + 28 * DAY), approvedAt: iso(now - 2 * DAY),
  });
  console.log(`state-targeted boost on an out-of-Rajkot listing: ${suratListing.title}`);
} else {
  console.log("! no live listing outside Rajkot — cross-city injection has no subject");
}

// --- ACTIVE, All-India targeted -------------------------------------------
await boost({
  profileId: sellers.broker.id, subjectKind: "listing", subjectId: brokerListings[1].id,
  code: "boost30", targeting: "india", geo: geoOf(brokerListings[1]),
  status: "active",
  startsAt: iso(now - 1 * DAY), endsAt: iso(now + 29 * DAY), approvedAt: iso(now - 1 * DAY),
});

// --- ACTIVE on a PROJECT --------------------------------------------------
if (project) {
  await boost({
    profileId: project.profile_id, subjectKind: "project", subjectId: project.id,
    code: "boost30", targeting: "city", geo: geoOf(project),
  status: "active",
    startsAt: iso(now - 3 * DAY), endsAt: iso(now + 27 * DAY), approvedAt: iso(now - 3 * DAY),
  });
}

// --- ACTIVE on a REQUIREMENT (the locked-but-top case) --------------------
if (requirement) {
  await boost({
    profileId: requirement.profile_id, subjectKind: "requirement", subjectId: requirement.id,
    code: "boost7", targeting: "city",
    geo: { areaId: (requirement.area_ids ?? [])[0] ?? null, cityId: requirement.city_id, stateId: gujarat },
  status: "active",
    startsAt: iso(now - 1 * DAY), endsAt: iso(now + 6 * DAY), approvedAt: iso(now - 1 * DAY),
  });
}

// --- PENDING APPROVAL (the admin queue + the Cancel-and-refund button) ----
await boost({
  profileId: sellers.owner.id, subjectKind: "listing", subjectId: ownerListings[1].id,
  code: "boost30", targeting: "area", geo: geoOf(ownerListings[1]),
  status: "pending_approval",
});
await boost({
  profileId: sellers.builder.id, subjectKind: "project", subjectId: builderProjects[0].id,
  code: "boost7", targeting: "state", geo: geoOf(builderProjects[0]),
  status: "pending_approval",
});

// Extra pending rows, because the live sweep CONSUMES them: it approves one,
// rejects one, sells one out from under a third and sells another before
// approval. Two fixtures meant the last assertions had nothing to run on.
if (ownerListings[3]) {
  await boost({
    profileId: sellers.owner.id, subjectKind: "listing", subjectId: ownerListings[3].id,
    code: "boost7", targeting: "city", geo: geoOf(ownerListings[3]),
    status: "pending_approval",
  });
}
if (brokerListings[4]) {
  await boost({
    profileId: sellers.broker.id, subjectKind: "listing", subjectId: brokerListings[4].id,
    code: "boost30", targeting: "india", geo: geoOf(brokerListings[4]),
    status: "pending_approval",
  });
}
if (builderProjects[1]) {
  await boost({
    profileId: sellers.builder.id, subjectKind: "project", subjectId: builderProjects[1].id,
    code: "boost7", targeting: "area", geo: geoOf(builderProjects[1]),
    status: "pending_approval",
  });
}

// --- PAUSED (admin-hide → pause/resume) ----------------------------------
await boost({
  profileId: sellers.broker.id, subjectKind: "listing", subjectId: brokerListings[2].id,
  code: "boost30", targeting: "city", geo: geoOf(brokerListings[2]),
  status: "paused",
  startsAt: iso(now - 4 * DAY), endsAt: iso(now + 26 * DAY), approvedAt: iso(now - 4 * DAY),
  pausedAt: iso(now - 1 * DAY), stoppedReason: `Paused by admin pending a report review`,
});

// --- EXPIRED -------------------------------------------------------------
await boost({
  profileId: sellers.broker.id, subjectKind: "listing", subjectId: brokerListings[3].id,
  code: "boost7", targeting: "area", geo: geoOf(brokerListings[3]),
  status: "expired",
  startsAt: iso(now - 14 * DAY), endsAt: iso(now - 7 * DAY), approvedAt: iso(now - 14 * DAY),
  stoppedReason: null,
});

// --- REJECTED + REFUNDED (the admin-reject → auto-refund promise) ---------
await boost({
  profileId: sellers.owner.id, subjectKind: "listing", subjectId: ownerListings[2].id,
  code: "boost7", targeting: "area", geo: geoOf(ownerListings[2]),
  status: "rejected",
  rejectReason: `Listing was hidden during review`,
  refundedAt: iso(now - 5 * DAY),
});

// --- STOPPED (sold mid-boost → no refund for unused days) ----------------
await boost({
  profileId: sellers.owner.id, subjectKind: "listing", subjectId: ownerListings[3].id,
  code: "boost30", targeting: "city", geo: geoOf(ownerListings[3]),
  status: "stopped",
  startsAt: iso(now - 10 * DAY), endsAt: iso(now + 20 * DAY), approvedAt: iso(now - 10 * DAY),
  stoppedReason: `Listing marked as sold · boost stopped automatically`,
});

// --- CANCELLED before approval + refunded (user's own cancel) ------------
await boost({
  profileId: sellers.builder.id, subjectKind: "project", subjectId: builderProjects[1].id,
  code: "boost7", targeting: "india", geo: geoOf(builderProjects[1]),
  status: "cancelled",
  stoppedReason: `Cancelled before approval`, refundedAt: iso(now - 2 * DAY),
});

// --- PENDING_PAYMENT — must NOT appear on the status screen --------------
await boost({
  profileId: sellers.broker.id, subjectKind: "listing", subjectId: brokerListings[4].id,
  code: "boost7", targeting: "area", geo: geoOf(brokerListings[4]),
  status: "pending_payment",
  stoppedReason: "Abandoned checkout", withOrder: true,
});

// Mark the refunded payments as refunded so the past cards' "₹499 refunded on…"
// line matches what the payments ledger says.
await q(
  `update payments set status='refunded', refunded_at=b.refunded_at,
          refund_reason='Boost refund · ' || $1, refund_id='rfnd_' || $1
     from boosts b
    where payments.order_id = b.order_id
      and b.refunded_at is not null
      and exists (select 1 from orders o
                   where o.id = b.order_id and o.razorpay_order_id like 'order_' || $1 || '%')`,
  [TAG],
);

// A couple of review-trail rows, so the admin history panel is not empty.
await q(
  `insert into boost_reviews (boost_id, actor_id, action, reason)
   select b.id, (select profile_id from staff where is_active limit 1),
          case when b.status='rejected' then 'reject' when b.status='paused' then 'pause' else 'approve' end,
          case when b.status='rejected' then b.reject_reason else null end
     from boosts b
    where exists (select 1 from orders o
                   where o.id = b.order_id and o.razorpay_order_id like 'order_' || $1 || '%')
      and b.status in ('active','rejected','paused','expired','stopped')`,
  [TAG],
);

// ---------------------------------------------------------------------------
// 4. What is actually in the table now
// ---------------------------------------------------------------------------
console.log(`\ninserted ${made} boost(s)\n`);
const summary = await q(
  `select b.status, b.subject_kind, b.targeting, b.target_label,
          p.role, p.name as seller,
          to_char(b.ends_at,'DD Mon') as ends,
          (b.refunded_at is not null) as refunded
     from boosts b join profiles p on p.id = b.profile_id
    order by b.status, b.created_at`,
);
console.table(summary.rows);

const counts = await q(`select status, count(*) from boosts group by 1 order by 1`);
console.table(counts.rows);

await c.end();
console.log("Module 9 seed done.");
