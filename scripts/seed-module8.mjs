/**
 * Seeds Module 8 (P3 Search & SEO) so every screen and every state is real:
 *
 *   • enough live Rajkot inventory that several landing pages clear the
 *     indexability floor (≥3 live listings) — AND at least one that does not,
 *     so the noindex + requirement-CTA branch is visible too;
 *   • an un-launched city (Coming-soon screen has something to point at);
 *   • recent searches + a saved search for the demo viewer;
 *   • a city interest request, so the "Notify me" table is not empty;
 *   • an active boost, so the Explore grid's 2×2 "Promoted" hero renders.
 *
 * New listings are CLONED from existing live rows so they carry a valid slot,
 * photo set and location chain — the payment-first invariant (Doc9 §11) is
 * respected rather than bypassed with a bare insert.
 *
 * Idempotent: re-running replaces only rows this script tags. Dev only.
 *   node scripts/seed-module8.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const q = (s, p) => c.query(s, p);
const one = async (s, p) => (await q(s, p)).rows[0];

const SEED_TAG = "m8-seed";
console.log("Module 8 seed — search & SEO\n");

// ---------------------------------------------------------------------------
// 0. Clean up anything this script created before (idempotency)
// ---------------------------------------------------------------------------
await q(`delete from listing_photos where listing_id in (select id from listings where flagged_reason=$1)`, [SEED_TAG]);
await q(`delete from listings where flagged_reason=$1`, [SEED_TAG]);

// ---------------------------------------------------------------------------
// 1. Location handles
// ---------------------------------------------------------------------------
const rajkot = await one(`select id, slug from locations where level='city' and name='Rajkot'`);
const areas = (await q(
  `select id, name, slug from locations where level='area' and parent_id=$1 order by name`, [rajkot.id],
)).rows;
const areaBy = Object.fromEntries(areas.map((a) => [a.name, a]));
console.log(`Rajkot areas: ${areas.map((a) => a.name).join(", ")}`);

// ---------------------------------------------------------------------------
// 2. Un-launched city for the Coming-soon screen
// ---------------------------------------------------------------------------
// Mumbai exists in master data but has no areas and no inventory, so it is the
// honest "we haven't opened here" case rather than a city we actually serve.
await q(`update locations set is_launched=false where level='city' and name='Mumbai'`);
const mumbai = await one(`select id, name, slug, is_launched from locations where level='city' and name='Mumbai'`);
console.log(`Un-launched city: ${mumbai.name} (is_launched=${mumbai.is_launched})`);

// ---------------------------------------------------------------------------
// 3. Extra live inventory
// ---------------------------------------------------------------------------
// Target shape, chosen so BOTH indexability branches are demonstrable:
//   Mavdi flats for sale        → well over 3  (indexable landing)
//   Mavdi 3-BHK flats for sale  → over 3       (indexable BHK landing)
//   University Road flats rent  → over 3       (indexable rent landing)
//   Kalawad Road flats for sale → over 3       (indexable)
//   Raiya Road flats for sale   → exactly 2    (BELOW the floor → noindex)
const PLAN = [
  { area: "Mavdi",           type: "flat",     kind: "sell", bhk: "3", n: 4, price: [7500000, 11500000], sqft: [1350, 1750] },
  { area: "Mavdi",           type: "flat",     kind: "sell", bhk: "2", n: 3, price: [4800000, 6800000],  sqft: [1000, 1250] },
  { area: "Mavdi",           type: "flat",     kind: "rent", bhk: "2", n: 3, price: [14000, 22000],      sqft: [1000, 1200] },
  { area: "University Road", type: "flat",     kind: "rent", bhk: "3", n: 4, price: [18000, 32000],      sqft: [1250, 1600] },
  { area: "University Road", type: "flat",     kind: "sell", bhk: "3", n: 3, price: [6800000, 9500000],  sqft: [1300, 1600] },
  { area: "Kalawad Road",    type: "flat",     kind: "sell", bhk: "4", n: 4, price: [12000000, 19000000],sqft: [1900, 2600] },
  { area: "Kalawad Road",    type: "shop",     kind: "rent", bhk: null, n: 3, price: [35000, 90000],     sqft: [400, 1100] },
  { area: "150 Feet Ring Road", type: "plot_res", kind: "sell", bhk: null, n: 4, price: [3500000, 9000000], sqft: [1200, 3600] },
  { area: "Kuvadva Road",    type: "plot_agri",kind: "sell", bhk: null, n: 3, price: [2500000, 6000000], sqft: [5000, 20000] },
  { area: "University Road", type: "pg",       kind: "rent", bhk: null, n: 3, price: [6500, 12000],      sqft: [180, 320] },
  // Deliberately only 2 → stays BELOW the ≥3 indexability floor.
  { area: "Raiya Road",      type: "flat",     kind: "sell", bhk: "3", n: 2, price: [7000000, 8200000],  sqft: [1300, 1500] },
];

const FURNISH = ["unfurnished", "semi", "full"];
const FACING = ["East", "West", "North", "South", "North-East", "South-West"];
const AMENITY_SETS = [
  ["lift", "covered_parking", "security"],
  ["lift", "power_backup", "water_24", "gym"],
  ["security", "garden", "cctv"],
  ["lift", "covered_parking", "security", "garden", "water_24"],
];
const SOCIETIES = ["Shree Residency", "Green Valley Heights", "Skyline Elegance", "Shivalik Sky", "Royal Palms", "Amrapali Heights"];

const pickN = (arr, i) => arr[i % arr.length];
const rand = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo));

// A donor row per (type, kind) gives us a valid slot + owner + location chain.
async function donorFor(typeCode, kind) {
  return (
    await one(
      `select * from listings where status='live' and type_code=$1 and kind=$2 and flagged_reason is distinct from $3 limit 1`,
      [typeCode, kind, SEED_TAG],
    )
  ) ?? await one(
    `select * from listings where status='live' and flagged_reason is distinct from $1 limit 1`, [SEED_TAG],
  );
}

// Spread ownership across owner / broker / builder so the Brokers & Builders
// tab has real, differentiated rows to show.
const sellers = (await q(
  `select id, role from profiles where role in ('owner','broker','builder') and state='active' order by role, created_at limit 9`,
)).rows;

let made = 0;
for (const [pi, plan] of PLAN.entries()) {
  const area = areaBy[plan.area];
  if (!area) { console.log(`  ! no area ${plan.area}, skipped`); continue; }
  const donor = await donorFor(plan.type, plan.kind);
  if (!donor) { console.log(`  ! no donor for ${plan.type}/${plan.kind}, skipped`); continue; }

  for (let i = 0; i < plan.n; i++) {
    const seller = sellers[(pi + i) % sellers.length];
    const sqft = rand(plan.sqft);
    const price = rand(plan.price) * 100; // paise
    const typeLabel = (await one(`select label from property_types where code=$1`, [plan.type])).label;
    const title = plan.bhk
      ? `${plan.bhk} BHK ${typeLabel} in ${pickN(SOCIETIES, pi + i)}, ${plan.area}`
      : `${typeLabel} in ${plan.area}, Rajkot`;

    const attributes = {
      ...(donor.attributes ?? {}),
      ...(plan.bhk ? { bhk: plan.bhk, bathrooms: String(Math.min(Number(plan.bhk), 3)) } : {}),
      furnishing: pickN(FURNISH, pi + i),
      facing: pickN(FACING, pi + i * 2),
      society_name: pickN(SOCIETIES, pi + i),
      possession: i % 3 === 0 ? "ready" : "under_construction",
      construction_status: i % 2 === 0 ? "new" : "resale",
      ...(plan.type.startsWith("plot") ? { road_width: String([20, 30, 40][i % 3]), corner_plot: i % 2 === 0 ? "true" : "false", land_area: String(sqft) } : {}),
      ...(plan.type === "pg" ? { pg_for: i % 2 === 0 ? "boys" : "girls", meals: i % 2 === 0 ? "true" : "false" } : {}),
      ...(plan.type === "shop" ? { carpet_area: String(sqft), washrooms: String(1 + (i % 2)) } : {}),
    };

    const row = await one(
      `insert into listings (
         profile_id, slot_id, type_code, kind, status, availability,
         title, description, price_paise, is_negotiable,
         state_id, district_id, taluka_id, city_id, area_id, area_label,
         attributes, amenities, area_sqft, cover_url, photo_count,
         contact_public, flagged_reason,
         submitted_at, approved_at, live_at, created_at, updated_at
       )
       select $1, l.slot_id, $2, $3::listing_kind, 'live', 'available',
              $4, $5, $6, $7,
              l.state_id, l.district_id, l.taluka_id, $8, $9, $10,
              $11::jsonb, $12::text[], $13, l.cover_url, coalesce(l.photo_count, 0),
              l.contact_public, $14,
              now() - interval '9 days', now() - interval '8 days',
              now() - ($15 || ' hours')::interval, now() - interval '9 days', now()
         from listings l where l.id = $16
       returning id`,
      [
        seller.id, plan.type, plan.kind,
        title,
        `${title}. Well-maintained property in ${plan.area}, Rajkot with ${sqft.toLocaleString("en-IN")} sqft of space. Contact the ${seller.role} directly through HomzList — no brokerage from our side, no spam calls.`,
        price, i % 3 === 0,
        rajkot.id, area.id, `${plan.area}, Rajkot`,
        JSON.stringify(attributes), pickN(AMENITY_SETS, pi + i), sqft,
        SEED_TAG,
        String(made * 3 + 2),
        donor.id,
      ],
    );

    // Clone the donor's photo set so cards, the Explore grid and the photo-count
    // badge all have real images rather than grey boxes.
    await q(
      `insert into listing_photos (listing_id, profile_id, url, storage_key, bucket, position, status, width, height)
       select $1, $3, url, storage_key, bucket, position, status, width, height from listing_photos
        where listing_id = $2 and status='ready' order by position limit 6`,
      [row.id, donor.id, seller.id],
    );
    await q(
      `update listings set photo_count = (select count(*) from listing_photos where listing_id=$1 and status='ready'),
                           cover_url = coalesce((select url from listing_photos where listing_id=$1 and status='ready' order by position limit 1), cover_url)
        where id=$1`, [row.id],
    );
    made++;
  }
  console.log(`  + ${plan.n} × ${plan.type}/${plan.kind}${plan.bhk ? ` ${plan.bhk}BHK` : ""} in ${plan.area}`);
}
console.log(`\nCreated ${made} live listings.\n`);

// ---------------------------------------------------------------------------
// 4. Boost one of them → the Explore grid's 2×2 "Promoted" hero
// ---------------------------------------------------------------------------
const boostTarget = await one(
  `select id, profile_id from listings where flagged_reason=$1 and city_id=$2 order by live_at desc limit 1`,
  [SEED_TAG, rajkot.id],
);
if (boostTarget) {
  const tpl = await one(`select catalog_code, price_paise from boosts order by created_at desc limit 1`);
  if (tpl) {
    await q(`delete from boosts where listing_id=$1`, [boostTarget.id]);
    await q(
      `insert into boosts (profile_id, listing_id, catalog_code, duration_days, targeting, target_label, price_paise, status, starts_at, ends_at)
       values ($1,$2,$3,7,'city','Rajkot',$4,'active', now() - interval '2 hours', now() + interval '6 days')`,
      [boostTarget.profile_id, boostTarget.id, tpl.catalog_code, tpl.price_paise],
    );
    console.log(`Boosted listing ${boostTarget.id} (Explore 2×2 hero).`);
  } else {
    console.log("! no boost template row to copy — Explore hero will render as a plain tile.");
  }
}

// ---------------------------------------------------------------------------
// 5. Recents + saved search + city interest for the demo viewer
// ---------------------------------------------------------------------------
const viewer = await one(`select id, phone, name from profiles where phone='+919999000007'`);
if (viewer) {
  await q(`update profiles set city_id=$2 where id=$1`, [viewer.id, rajkot.id]);
  await q(`delete from search_recents where profile_id=$1`, [viewer.id]);

  const RECENTS = [
    ["3 BHK Mavdi", "text", null],
    ["Flats under 50 lakh", "text", null],
    ["Shree Residency", "text", null],
    ["Plots Kuvadva Road", "text", null],
    ["University Road", "area", areaBy["University Road"]?.slug ?? null],
  ];
  for (const [i, [query, kind, slug]] of RECENTS.entries()) {
    await q(
      `insert into search_recents (profile_id, mode, query, target_kind, target_slug, created_at)
       values ($1,'property',$2,$3,$4, now() - ($5 || ' minutes')::interval)`,
      [viewer.id, query, kind, slug, String(i * 7)],
    );
  }
  console.log(`Recents seeded for ${viewer.name ?? viewer.phone}: ${RECENTS.length}`);

  await q(`delete from saved_searches where profile_id=$1`, [viewer.id]);
  await q(
    `insert into saved_searches (profile_id, mode, label, params, alerts_enabled, last_match_count)
     values ($1,'property','3 BHK in Mavdi under ₹1 Cr', $2::jsonb, true, 0)`,
    [viewer.id, JSON.stringify({ q: "3 BHK Mavdi", intent: "sell", types: ["flat"], budgetMax: 100, attrs: { bhk: ["3"] } })],
  );
  console.log("Saved search seeded (alerts on).");

  await q(`delete from city_interest_requests where profile_id=$1`, [viewer.id]);
  await q(
    `insert into city_interest_requests (city_id, city_name, profile_id) values ($1,$2,$3)`,
    [mumbai.id, mumbai.name, viewer.id],
  );
  console.log("City interest seeded (Mumbai).");
}

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------
console.log("\n--- live inventory by area / type / intent (Rajkot) ---");
const summary = await q(
  `select l2.name as area, l.type_code, l.kind, l.attributes->>'bhk' as bhk, count(*)::int as n
     from listings l join locations l2 on l2.id = l.area_id
    where l.status='live' and l.availability='available' and l.city_id=$1
    group by 1,2,3,4 order by 5 desc, 1`, [rajkot.id],
);
console.table(summary.rows);

await c.end();
console.log("\nModule 8 seed done.");
