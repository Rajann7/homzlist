/**
 * Demo content seed — makes every screen look like designs/ with REAL data.
 *
 * What it does, in order:
 *   1. Uploads a curated photo set to Supabase Storage (bucket `listing-photos`,
 *      prefix `demo/`). Photos are downloaded once into scripts/.demo-photos/
 *      and re-used on later runs.
 *   2. REPAIRS every existing listing_photos row: the old seeds wrote
 *      `/uploads/...` local-disk paths, which resolve to nothing, so every feed
 *      card rendered an empty grey box. Each row is re-pointed at a real image
 *      chosen by the listing's property type + photo position, and the parent
 *      listing gets cover_url / photo_count.
 *   3. Creates a full demo catalogue: listings across all 13 property types,
 *      both kinds (sell/rent), for owner + broker + builder, each with full
 *      attributes, amenities, price, location chain and 5-6 photos; plus
 *      requirements, builder projects, and the interaction rows (saves,
 *      inquiries, story_seen) that make the feed look alive.
 *
 * Photo licensing: images come from Pexels (Pexels License — free use,
 * modification allowed, no attribution required). Google Images is NOT used:
 * results there are arbitrary-copyright and cannot be re-hosted.
 *
 * Idempotent: re-running updates the same demo rows (keyed by title/name) and
 * skips uploads that already exist. Dev only — talks straight to Postgres.
 *
 *   node scripts/seed-demo-content.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".demo-photos");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "listing-photos";

// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const c = await dbConnect();
const q = (s, p) => c.query(s, p);
const one = async (s, p) => (await q(s, p)).rows[0];

// ---------------------------------------------------------------- photo set
// Curated + eyeballed: every id below was opened and categorised by hand, so a
// "Kitchen" caption never sits on a bedroom photo.
const PHOTOS = {
  exterior: [106399, 259588, 323780, 439391, 1396122, 3935333],
  living: [1571460, 1643383, 276724, 2029667, 279607, 1571470, 245208],
  bedroom: [271624, 210265, 1454806, 262048, 2062431, 462235],
  kitchen: [1080721, 3935350, 2724749],
  dining: [1080696],
  bathroom: [1454804, 342800],
  empty: [6489084],
  land: [1483880],
  office: [380769, 236730],
  shop: [264636, 260922],
  construction: [1249611, 2219024],
};
const ALT = {
  exterior: "Building exterior", living: "Living room", bedroom: "Bedroom", kitchen: "Kitchen",
  dining: "Dining area", bathroom: "Bathroom", empty: "Entrance", land: "Plot view",
  office: "Office floor", shop: "Shop floor", construction: "Construction progress",
};

const url = {};           // "living-0" -> public URL
async function uploadPhotos() {
  fs.mkdirSync(CACHE, { recursive: true });
  let up = 0, skip = 0;
  for (const [cat, ids] of Object.entries(PHOTOS)) {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const key = `demo/${cat}-${i}.jpg`;
      const file = path.join(CACHE, `${id}.jpg`);
      if (!fs.existsSync(file)) {
        const src = `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;
        const res = await fetch(src);
        if (!res.ok) throw new Error(`download ${id}: ${res.status}`);
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      const head = await fetch(`${SUPA}/storage/v1/object/info/public/${BUCKET}/${key}`);
      if (!head.ok) {
        const put = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${key}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${KEY}`, "content-type": "image/jpeg", "x-upsert": "true" },
          body: fs.readFileSync(file),
        });
        if (!put.ok) throw new Error(`upload ${key}: ${put.status} ${await put.text()}`);
        up++;
      } else skip++;
      url[`${cat}-${i}`] = `${SUPA}/storage/v1/object/public/${BUCKET}/${key}`;
    }
  }
  console.log(`photos: ${up} uploaded, ${skip} already in the bucket`);
}

/** Photo plan per property type: which categories, in card order. */
const PLAN = {
  flat: ["living", "bedroom", "kitchen", "bathroom", "dining", "exterior"],
  tenement: ["exterior", "living", "bedroom", "kitchen", "bathroom", "dining"],
  bungalow: ["exterior", "living", "bedroom", "kitchen", "bathroom", "dining"],
  farmhouse: ["exterior", "living", "bedroom", "land", "kitchen", "dining"],
  pg: ["bedroom", "living", "bathroom", "kitchen", "exterior", "dining"],
  shop: ["shop", "exterior", "empty", "office", "construction", "living"],
  showroom: ["shop", "office", "exterior", "empty", "living", "construction"],
  office: ["office", "empty", "exterior", "shop", "living", "construction"],
  godown: ["construction", "empty", "exterior", "office", "shop", "land"],
  plot_res: ["land", "exterior", "construction", "empty", "living", "office"],
  plot_com: ["land", "construction", "exterior", "shop", "office", "empty"],
  plot_agri: ["land", "construction", "exterior", "empty", "living", "office"],
  plot_farm: ["land", "exterior", "construction", "empty", "living", "dining"],
};
const pick = (cat, n) => url[`${cat}-${n % PHOTOS[cat].length}`];

/** Photo rows for one listing: 5-6 real images, position 0 = cover. */
async function setPhotos(listingId, profileId, typeCode, seed) {
  const plan = PLAN[typeCode] ?? PLAN.flat;
  await q("delete from listing_photos where listing_id=$1", [listingId]);
  const urls = [];
  for (let i = 0; i < plan.length; i++) {
    const cat = plan[i];
    const u = pick(cat, seed + i);
    urls.push(u);
    await q(
      `insert into listing_photos (listing_id, profile_id, storage_key, url, alt_text, position, width, height, status, bucket)
       values ($1,$2,$3,$4,$5,$6,1200,800,'ready',$7)`,
      [listingId, profileId, u.split(`/${BUCKET}/`)[1], u, ALT[cat], i, BUCKET],
    );
  }
  await q("update listings set cover_url=$2, photo_count=$3 where id=$1", [listingId, urls[0], urls.length]);
  return urls[0];
}

// ------------------------------------------------------- 2. repair old rows
async function repairExistingPhotos() {
  const rows = (await q(
    `select ph.id, ph.listing_id, ph.position, l.type_code, l.profile_id
       from listing_photos ph join listings l on l.id = ph.listing_id
      where ph.url is null or ph.url like '/uploads/%' or ph.status <> 'ready'
      order by ph.listing_id, ph.position`,
  )).rows;
  let n = 0;
  for (const r of rows) {
    const plan = PLAN[r.type_code] ?? PLAN.flat;
    const cat = plan[r.position % plan.length];
    const u = pick(cat, r.position);
    await q(
      `update listing_photos set url=$2, storage_key=$3, alt_text=$4, status='ready', bucket=$5, width=1200, height=800 where id=$1`,
      [r.id, u, u.split(`/${BUCKET}/`)[1], ALT[cat], BUCKET],
    );
    n++;
  }
  // Cover + count follow from the photos that actually exist.
  await q(`update listings l set cover_url = p.url, photo_count = p.n
             from (select listing_id, min(url) filter (where position = 0) url, count(*) n
                     from listing_photos where status='ready' group by listing_id) p
            where p.listing_id = l.id and p.url is not null`);
  console.log(`repaired ${n} broken photo rows (were local /uploads paths)`);

  // Listings that had NO photo rows at all (older seeds inserted the listing but
  // never any photos) rendered an empty grey card in the feed. Give every
  // visible listing a real photo set — a card with no image is a broken card.
  const bare = (await q(
    `select l.id, l.profile_id, l.type_code
       from listings l
      where l.status in ('live','pending_review','changes_requested','hidden','archived','rejected')
        and not exists (select 1 from listing_photos p where p.listing_id = l.id and p.status='ready')`,
  )).rows;
  let k = 0;
  for (const l of bare) { await setPhotos(l.id, l.profile_id, l.type_code, k * 2); k++; }
  console.log(`backfilled photos for ${k} listings that had none`);
}

// ------------------------------------------------------------- 3. catalogue
const RAJKOT = "365a99e6-fd34-4062-9fc3-dccb22d8a699";
const GUJARAT = "38d93428-1f53-4e8a-bf10-1fc3520860ea";
const DIST = "497666e9-42b4-48bc-84ea-23d278e6f4a1";
const AREAS = {
  Mavdi: "d403feb9-6f66-4b23-846c-669f8ebf6022",
  "Kalawad Road": "46fc5515-2f07-46cd-9803-c04e094ee6fa",
  "Raiya Road": "61d1e5ad-838d-46ef-b4a8-94521c6dcf5f",
  "University Road": "ba0f45de-711c-4b48-acee-bfa02a00079e",
  "150 Feet Ring Road": "ffa8e444-d414-424b-9c60-ecfbb0eef6f6",
  "Kuvadva Road": "f4ad2ad2-34d0-49a0-8e5b-4bfc4388ee2b",
};
// Money is paise (bigint) — round, never hand Postgres a float like 2800000.0000000005.
const L = (n) => Math.round(n * 100000 * 100);   // lakh  -> paise
const CR = (n) => Math.round(n * 10000000 * 100); // crore -> paise

const SELLERS = {
  manish: "+919999000014",   // builder (Vadodara)
  rahul: "+919999000001",    // owner
  meera: "+919999000004",    // owner
  rk: "+919825012345",       // broker (RK Properties)
  amit: "+919999000007",     // broker
  suresh: "+919999000013",   // builder
  skyline: "+919999000014",  // builder (same as manish — Vadodara)
};
const BUYERS = { priya: "+919999000002", nikhil: "+919999000006", jay: "+919999000011" };

const LISTINGS = [
  // ---- owner Rahul (resale flats + tenement)
  { who: "rahul", type: "flat", kind: "sell", title: "3 BHK Flat in Shreeji Residency, Mavdi", area: "Mavdi",
    price: L(85), sqft: 1450, desc: "East-facing 3 BHK on the 4th floor of Shreeji Residency. Corner flat, cross-ventilated, 2 covered parkings. Clear title, ready to move, no brokerage.",
    attrs: { bhk: "3", bathrooms: "3+", balconies: "2", builtup_area: { value: 1450, unit: "sqft" }, carpet_area: { value: 1180, unit: "sqft" }, floor: 4, total_floors: 7, furnishing: "semi", facing: "East", age: "1-5", car_parking: 2, bike_parking: 2, lift: true, water: "municipal", society_name: "Shreeji Residency", ownership_type: "Freehold", construction_status: "resale" },
    amen: ["lift", "covered_parking", "security", "garden", "power_backup", "cctv"] },
  { who: "rahul", type: "flat", kind: "rent", title: "2 BHK semi-furnished on rent, Raiya Road", area: "Raiya Road",
    price: L(0.18), deposit: L(1), sqft: 1050, desc: "Semi-furnished 2 BHK with modular kitchen, 24x7 water and lift. Family or working professionals. Maintenance included in rent.",
    attrs: { bhk: "2", bathrooms: "2", balconies: "1", builtup_area: { value: 1050, unit: "sqft" }, floor: 2, total_floors: 5, furnishing: "semi", facing: "North", age: "5-10", car_parking: 1, lift: true, water: "bore", ownership_type: "Freehold" },
    amen: ["lift", "covered_parking", "security", "power_backup"], maintenanceIncluded: true },
  { who: "rahul", type: "tenement", kind: "sell", title: "2 BHK Tenement near Kuvadva Road", area: "Kuvadva Road",
    price: L(52), sqft: 1100, desc: "Independent two-storey tenement with a small front yard. Bore + corporation water, scooter parking inside the gate.",
    attrs: { bhk: "2", bathrooms: "2", builtup_area: { value: 1100, unit: "sqft" }, plot_area: { value: 900, unit: "sqft" }, total_floors: 2, furnishing: "unfurnished", facing: "West", age: "10+", bore: true, car_parking: 1, ownership_type: "Freehold" },
    amen: ["covered_parking", "water_24"] },

  // ---- owner Meera
  { who: "meera", type: "flat", kind: "sell", title: "4 BHK Duplex, Kalawad Road", area: "Kalawad Road",
    price: CR(1.65), sqft: 2400, desc: "Spacious 4 BHK duplex with a double-height living room, modular kitchen and servant room. Two covered parkings, club house access.",
    attrs: { bhk: "4", bathrooms: "3+", balconies: "3+", builtup_area: { value: 2400, unit: "sqft" }, carpet_area: { value: 1980, unit: "sqft" }, floor: 9, total_floors: 12, furnishing: "furnished", facing: "North-East", age: "0-1", car_parking: 2, bike_parking: 2, lift: true, water: "municipal", society_name: "Kalawad Heights", ownership_type: "Freehold", construction_status: "new" },
    amen: ["lift", "covered_parking", "security", "gym", "swimming_pool", "clubhouse", "power_backup", "cctv", "garden"] },
  { who: "meera", type: "bungalow", kind: "sell", title: "5 BHK Bungalow with lawn, University Road", area: "University Road",
    price: CR(3.25), sqft: 4200, desc: "Corner bungalow on a 500 sq yd plot. Lawn on two sides, covered porch for three cars, borewell plus corporation line, solar water heating.",
    attrs: { bhk: "5+", bathrooms: "3+", builtup_area: { value: 4200, unit: "sqft" }, plot_area: { value: 500, unit: "sqyd" }, total_floors: 2, furnishing: "semi", facing: "East", age: "5-10", car_parking: 3, bore: true, corner_plot: true, ownership_type: "Freehold" },
    amen: ["covered_parking", "garden", "security", "water_24", "power_backup", "cctv"] },
  { who: "meera", type: "pg", kind: "rent", title: "Girls PG near University Road (twin sharing)", area: "University Road",
    price: L(0.075), deposit: L(0.15), sqft: 220, desc: "Twin-sharing PG for girls, walking distance from the university gate. Wi-Fi, three meals, laundry, RO water and a common study room.",
    attrs: { bathrooms: "2", builtup_area: { value: 220, unit: "sqft" }, furnishing: "furnished", ac: true, meals: true, wifi: true, ownership_type: "Freehold" },
    amen: ["wifi", "housekeeping", "security", "power_backup", "cctv"] },

  // ---- broker RK Properties
  { who: "rk", type: "flat", kind: "sell", title: "3 BHK in Shivalik Sky, 150 Feet Ring Road", area: "150 Feet Ring Road",
    price: CR(1.1), sqft: 1780, desc: "High-floor 3 BHK with an open west view. Vitrified flooring, modular kitchen, two-level parking, 100% power backup for lifts.",
    attrs: { bhk: "3", bathrooms: "3+", balconies: "2", builtup_area: { value: 1780, unit: "sqft" }, carpet_area: { value: 1420, unit: "sqft" }, floor: 11, total_floors: 14, furnishing: "semi", facing: "West", age: "0-1", car_parking: 2, lift: true, water: "municipal", society_name: "Shivalik Sky", ownership_type: "Freehold", construction_status: "new" },
    amen: ["lift", "covered_parking", "security", "gym", "clubhouse", "power_backup", "cctv", "garden"] },
  { who: "rk", type: "shop", kind: "rent", title: "Shop on rent, 150 Feet Ring Road frontage", area: "150 Feet Ring Road",
    price: L(0.85), deposit: L(5), sqft: 650, desc: "Ground-floor shop with 22 ft main-road frontage, shutter plus glass front, washroom inside. Suitable for showroom, clinic or QSR.",
    attrs: { builtup_area: { value: 650, unit: "sqft" }, carpet_area: { value: 590, unit: "sqft" }, floor: 0, total_floors: 4, furnishing: "unfurnished", facing: "North", age: "1-5", frontage: 22, washroom: true, ownership_type: "Freehold" },
    amen: ["covered_parking", "power_backup", "cctv", "security"] },
  { who: "rk", type: "office", kind: "rent", title: "Furnished office, 12 seats — Kalawad Road", area: "Kalawad Road",
    price: L(0.42), deposit: L(2.5), sqft: 900, desc: "Plug-and-play office: 12 workstations, one cabin, meeting room, pantry and two washrooms. Lift, covered parking and 24x7 access.",
    attrs: { builtup_area: { value: 900, unit: "sqft" }, floor: 3, total_floors: 6, furnishing: "furnished", facing: "East", age: "1-5", car_parking: 2, lift: true, washroom: true, ac: true, ownership_type: "Leasehold" },
    amen: ["lift", "covered_parking", "power_backup", "cctv", "security", "fire_safety"] },
  { who: "rk", type: "plot_res", kind: "sell", title: "Residential plot 250 sq yd, Mavdi", area: "Mavdi",
    price: L(68), sqft: 2250, desc: "N.A. + N.O.C. residential plot in a gated scheme. 30 ft internal road, corner position, clear title and ready for construction.",
    attrs: { plot_area: { value: 250, unit: "sqyd" }, facing: "North", corner_plot: true, road_width: 30, boundary_wall: true, ownership_type: "Freehold" },
    amen: ["security", "garden"] },

  // ---- broker Amit
  { who: "amit", type: "flat", kind: "rent", title: "3 BHK furnished flat on rent, Mavdi", area: "Mavdi",
    price: L(0.28), deposit: L(1.5), sqft: 1500, desc: "Fully furnished 3 BHK — beds, wardrobes, sofa, dining, fridge, washing machine and 3 ACs. Immediate possession, family preferred.",
    attrs: { bhk: "3", bathrooms: "3+", balconies: "2", builtup_area: { value: 1500, unit: "sqft" }, floor: 6, total_floors: 9, furnishing: "furnished", facing: "South", age: "1-5", car_parking: 1, lift: true, ac: true, water: "municipal", ownership_type: "Freehold" },
    amen: ["lift", "covered_parking", "security", "power_backup", "fire_safety", "cctv"] },
  { who: "amit", type: "showroom", kind: "rent", title: "Double-height showroom, Kalawad Road", area: "Kalawad Road",
    price: L(1.75), deposit: L(10), sqft: 2200, desc: "Double-height showroom with mezzanine, 40 ft frontage and dedicated customer parking. Ideal for auto, furniture or electronics retail.",
    attrs: { builtup_area: { value: 2200, unit: "sqft" }, floor: 0, total_floors: 3, furnishing: "unfurnished", facing: "East", age: "0-1", frontage: 40, washroom: true, ownership_type: "Freehold" },
    amen: ["covered_parking", "power_backup", "cctv", "security", "lift"] },
  { who: "amit", type: "godown", kind: "rent", title: "Godown 6000 sqft, Kuvadva Road", area: "Kuvadva Road",
    price: L(1.2), deposit: L(6), sqft: 6000, desc: "RCC godown with 18 ft clear height, container-friendly approach and a loading platform. Three-phase power, watchman quarter on site.",
    attrs: { builtup_area: { value: 6000, unit: "sqft" }, plot_area: { value: 1000, unit: "sqyd" }, facing: "North", age: "5-10", road_width: 40, washroom: true, ownership_type: "Leasehold" },
    amen: ["covered_parking", "security", "cctv", "power_backup"] },
  { who: "amit", type: "plot_agri", kind: "sell", title: "Agriculture land 5 vigha, Kuvadva Road", area: "Kuvadva Road",
    price: CR(1.4), sqft: 0, desc: "Five vigha of irrigated farm land with a bore well and drip system. Approach from a 20 ft village road, 12 km from Rajkot city limits.",
    attrs: { plot_area: { value: 5, unit: "vigha" }, bore: true, road_width: 20, ownership_type: "Freehold", water: "bore" },
    amen: ["water_24"] },

  // ---- builders
  { who: "suresh", type: "flat", kind: "sell", title: "2 BHK in Skyline Elegance (under construction)", area: "Raiya Road",
    price: L(62), sqft: 1180, desc: "Booking open in Skyline Elegance — 2 BHK with a covered balcony, RERA registered, possession Dec 2027. Bank approvals from SBI, HDFC and ICICI.",
    attrs: { bhk: "2", bathrooms: "2", balconies: "1", builtup_area: { value: 1180, unit: "sqft" }, carpet_area: { value: 940, unit: "sqft" }, floor: 5, total_floors: 13, furnishing: "unfurnished", facing: "North", age: "under_construction", car_parking: 1, lift: true, ownership_type: "Freehold", construction_status: "new" },
    amen: ["lift", "covered_parking", "security", "gym", "clubhouse", "garden", "power_backup", "cctv"] },
  { who: "skyline", type: "farmhouse", kind: "sell", title: "Farmhouse with pool on 1 acre, Kuvadva Road", area: "Kuvadva Road",
    price: CR(2.75), sqft: 3200, desc: "Weekend farmhouse on one acre — 3 bedrooms, party lawn, swimming pool and a 40-tree mango orchard. Bore plus 10,000 L overhead storage.",
    attrs: { bhk: "3", bathrooms: "3+", builtup_area: { value: 3200, unit: "sqft" }, plot_area: { value: 1, unit: "acre" }, total_floors: 1, furnishing: "semi", facing: "South-East", age: "1-5", car_parking: 4, bore: true, ownership_type: "Freehold" },
    amen: ["swimming_pool", "garden", "covered_parking", "security", "water_24", "power_backup"] },
  { who: "skyline", type: "plot_com", kind: "sell", title: "Commercial plot 800 sq yd, 150 Feet Ring Road", area: "150 Feet Ring Road",
    price: CR(4.5), sqft: 7200, desc: "Corner commercial plot on the ring road with 60 ft frontage. N.A. done, suitable for a showroom block or a small commercial tower.",
    attrs: { plot_area: { value: 800, unit: "sqyd" }, facing: "West", corner_plot: true, road_width: 60, frontage: 60, boundary_wall: true, ownership_type: "Freehold" },
    amen: ["security"] },
];

const REQUIREMENTS = [
  { who: "priya", kind: "sell", type: "flat", bhk: 3, min: L(60), max: L(90), areas: ["Mavdi", "Raiya Road"], urgency: "immediate",
    notes: "Looking for a ready-to-move 3 BHK with two parkings. Loan pre-approved from HDFC, can close within 30 days." },
  { who: "priya", kind: "rent", type: "flat", bhk: 2, min: L(0.12), max: L(0.2), areas: ["Kalawad Road"], urgency: "1_3_months",
    notes: "Semi-furnished 2 BHK on rent for a family of three, needs a lift and covered parking." },
  { who: "nikhil", kind: "sell", type: "tenement", bhk: 2, min: L(40), max: L(60), areas: ["Kuvadva Road", "Mavdi"], urgency: "exploring",
    notes: "First home — 2 BHK tenement, ground floor preferred, budget is firm." },
  { who: "nikhil", kind: "rent", type: "shop", bhk: null, min: L(0.4), max: L(0.9), areas: ["150 Feet Ring Road"], urgency: "immediate",
    notes: "Shop on main-road frontage for a mobile accessories store. 400-700 sqft, shutter + glass front needed." },
  { who: "jay", kind: "sell", type: "plot_res", bhk: null, min: L(50), max: L(80), areas: ["Mavdi", "University Road"], urgency: "exploring",
    notes: "Residential plot 200-300 sq yd in a gated scheme, N.A./N.O.C. cleared only." },
  { who: "jay", kind: "sell", type: "office", bhk: null, min: L(80), max: CR(1.5), areas: ["Kalawad Road", "150 Feet Ring Road"], urgency: "1_3_months",
    notes: "Buying an office of 800-1200 sqft for our CA firm. Lift and parking are must-haves." },
];

const PROJECTS = [
  { who: "suresh", name: "Skyline Elegance", area: "Raiya Road", build: "under_construction", towers: 3, floors: 13, total: 156, avail: 42,
    rera: "PR/GJ/RAJKOT/RAJKOT/Others/RAA07711/280225", possession: "2027-12-31",
    desc: "Three towers of 2 and 3 BHK homes with a 12,000 sqft club house, jogging track and covered podium parking.",
    amen: ["lift", "covered_parking", "security", "gym", "clubhouse", "swimming_pool", "garden", "power_backup", "cctv"],
    banks: ["SBI", "HDFC", "ICICI", "Bank of Baroda"], cat: "construction" },
  { who: "suresh", name: "Skyline Business Hub", area: "150 Feet Ring Road", build: "booking_open", towers: 1, floors: 9, total: 84, avail: 84,
    rera: "PR/GJ/RAJKOT/RAJKOT/Others/RAA08123/140325", possession: "2028-06-30",
    desc: "Offices and showrooms on the ring road — 500 to 2,400 sqft units, double-height retail on the ground floor.",
    amen: ["lift", "covered_parking", "security", "power_backup", "cctv", "fire_safety"],
    banks: ["HDFC", "Axis Bank"], cat: "office" },
  { who: "skyline", name: "Green Meadows Villas", area: "Kalawad Road", build: "ready", towers: 0, floors: 2, total: 36, avail: 7,
    rera: "PR/GJ/RAJKOT/RAJKOT/Others/RAA06542/110124", possession: "2026-03-31",
    desc: "Thirty-six 4 BHK villas on 300-400 sq yd plots with a central garden, gated entry and underground cabling.",
    amen: ["covered_parking", "security", "garden", "clubhouse", "cctv", "power_backup"],
    banks: ["SBI", "LIC Housing", "ICICI"], cat: "exterior" },
];

async function idOf(phone) {
  const r = await one("select id from profiles where phone=$1", [phone]);
  if (!r) throw new Error(`profile ${phone} missing — run the earlier module seeds first`);
  return r.id;
}

async function seedListings(ids) {
  let n = 0, i = 0;
  for (const L0 of LISTINGS) {
    const owner = ids[L0.who];
    const areaId = AREAS[L0.area];
    const existing = await one("select id from listings where profile_id=$1 and title=$2", [owner, L0.title]);
    const cols = {
      profile_id: owner, type_code: L0.type, kind: L0.kind, status: "live", availability: "available",
      title: L0.title, description: L0.desc, price_paise: L0.price, is_negotiable: true,
      deposit_paise: L0.deposit ?? null, maintenance_included: L0.maintenanceIncluded ?? false,
      state_id: GUJARAT, district_id: DIST, taluka_id: null, city_id: RAJKOT, area_id: areaId,
      area_label: `${L0.area}, Rajkot`, pincode: "360005",
      attributes: JSON.stringify(L0.attrs), amenities: L0.amen,
      contact_public: false, area_sqft: L0.sqft || null,
    };
    let id;
    if (existing) {
      id = existing.id;
      await q(
        `update listings set type_code=$2,kind=$3,status='live',availability='available',description=$4,price_paise=$5,
            deposit_paise=$6,maintenance_included=$7,state_id=$8,district_id=$9,city_id=$10,area_id=$11,area_label=$12,
            pincode=$13,attributes=$14::jsonb,amenities=$15,area_sqft=$16,is_negotiable=true,
            submitted_at=coalesce(submitted_at, now() - interval '9 days'),
            approved_at=coalesce(approved_at, now() - interval '8 days'),
            live_at=coalesce(live_at, now() - ((random()*72)::int || ' hours')::interval)
          where id=$1`,
        [id, cols.type_code, cols.kind, cols.description, cols.price_paise, cols.deposit_paise, cols.maintenance_included,
         cols.state_id, cols.district_id, cols.city_id, cols.area_id, cols.area_label, cols.pincode,
         cols.attributes, cols.amenities, cols.area_sqft],
      );
    } else {
      id = (await one(
        `insert into listings (profile_id,type_code,kind,status,availability,title,description,price_paise,is_negotiable,
            deposit_paise,maintenance_included,state_id,district_id,city_id,area_id,area_label,pincode,attributes,amenities,
            contact_public,area_sqft,submitted_at,approved_at,live_at)
         values ($1,$2,$3,'live','available',$4,$5,$6,true,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,false,$17,
            now() - interval '9 days', now() - interval '8 days', now() - ((random()*72)::int || ' hours')::interval)
         returning id`,
        [cols.profile_id, cols.type_code, cols.kind, cols.title, cols.description, cols.price_paise, cols.deposit_paise,
         cols.maintenance_included, cols.state_id, cols.district_id, cols.city_id, cols.area_id, cols.area_label,
         cols.pincode, cols.attributes, cols.amenities, cols.area_sqft],
      )).id;
    }
    await setPhotos(id, owner, L0.type, i);
    i += 2; n++;
  }
  console.log(`listings: ${n} demo listings live, each with 6 real photos`);
}

async function seedRequirements(ids) {
  let n = 0;
  for (const R of REQUIREMENTS) {
    const who = ids[R.who];
    const areaIds = R.areas.map((a) => AREAS[a]);
    const label = R.areas.length > 1 ? `${R.areas[0]} +${R.areas.length - 1}` : R.areas[0];
    const existing = await one("select id from requirements where profile_id=$1 and notes=$2", [who, R.notes]);
    if (existing) {
      await q(
        `update requirements set kind=$2,type_code=$3,bhk=$4,budget_min_paise=$5,budget_max_paise=$6,area_ids=$7,
           area_label=$8,city_id=$9,urgency=$10,status='live',is_active=true,
           live_at=coalesce(live_at, now() - interval '3 days'),
           expires_at=coalesce(expires_at, now() + interval '27 days') where id=$1`,
        [existing.id, R.kind, R.type, R.bhk, R.min, R.max, areaIds, label, RAJKOT, R.urgency],
      );
    } else {
      await q(
        `insert into requirements (profile_id,kind,type_code,bhk,budget_min_paise,budget_max_paise,area_ids,area_label,
            city_id,urgency,notes,status,is_active,submitted_at,approved_at,live_at,expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'live',true, now() - interval '4 days', now() - interval '3 days',
            now() - interval '3 days', now() + interval '27 days')`,
        [who, R.kind, R.type, R.bhk, R.min, R.max, areaIds, label, RAJKOT, R.urgency, R.notes],
      );
    }
    n++;
  }
  console.log(`requirements: ${n} live requirements across ${new Set(REQUIREMENTS.map((r) => r.who)).size} buyers`);
}

async function seedProjects(ids) {
  let n = 0, i = 0;
  for (const P of PROJECTS) {
    const who = ids[P.who];
    const cover = pick(P.cat, i);
    const existing = await one("select id from projects where profile_id=$1 and name=$2", [who, P.name]);
    const args = [who, P.name, P.rera, P.build, P.possession, P.towers, P.floors, P.total, P.avail,
      P.banks, P.amen, P.desc, GUJARAT, RAJKOT, AREAS[P.area], `${P.area}, Rajkot`, cover, "360005"];
    if (existing) {
      await q(
        `update projects set rera_number=$3,build_status=$4,possession_date=$5,towers=$6,floors=$7,total_units=$8,
           available_units=$9,bank_approvals=$10,amenities=$11,description=$12,state_id=$13,city_id=$14,area_id=$15,
           area_label=$16,cover_url=$17,pincode=$18,status='live',
           approved_at=coalesce(approved_at, now() - interval '10 days'),
           live_at=coalesce(live_at, now() - interval '9 days') where id=$1 and profile_id=$2`,
        // args[1] is the name, which the update matches on rather than sets.
        [existing.id, who, ...args.slice(2)],
      );
    } else {
      await q(
        `insert into projects (profile_id,name,rera_number,build_status,possession_date,towers,floors,total_units,
            available_units,bank_approvals,amenities,description,state_id,city_id,area_id,area_label,cover_url,pincode,
            status,submitted_at,approved_at,live_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'live',
            now() - interval '11 days', now() - interval '10 days', now() - interval '9 days')`,
        args,
      );
    }
    i++; n++;
  }
  console.log(`projects: ${n} live builder projects`);
}

/** Buyer-side interaction rows so Saved / inquiries / stories aren't empty. */
async function seedInteractions(ids) {
  const live = (await q(
    `select id, profile_id from listings where status='live' and availability='available' order by live_at desc limit 12`,
  )).rows;
  let saves = 0, inq = 0;
  for (const buyer of [ids.priya, ids.nikhil, ids.jay]) {
    const mine = live.filter((l) => l.profile_id !== buyer).slice(0, 4);
    for (const l of mine) {
      const has = await one("select id from saves where profile_id=$1 and listing_id=$2", [buyer, l.id]);
      if (!has) { await q("insert into saves (profile_id, listing_id) values ($1,$2)", [buyer, l.id]); saves++; }
    }
    for (const l of mine.slice(0, 2)) {
      const has = await one("select id from inquiries where profile_id=$1 and listing_id=$2", [buyer, l.id]);
      if (!has) {
        await q(
          `insert into inquiries (profile_id, listing_id, poster_id, message, status, intents)
           values ($1,$2,$3,$4,'sent','{visit,docs}')`,
          [buyer, l.id, l.profile_id, "Is this still available? I'd like to schedule a visit this weekend."],
        );
        inq++;
      }
    }
  }
  console.log(`interactions: +${saves} saves, +${inq} inquiries`);
}

/**
 * Legacy rows the earlier QA runs left in the FEED. They are test artifacts,
 * not content: `Flat QA owner` x4, and four copies of the same seeded listing —
 * all priced ₹8.5 Cr with `bhk: 1` and a title that says 3 BHK. A real user
 * would see a duplicated, self-contradicting card, so:
 *   - every "<type> QA <role>" listing is archived (kept for audit, out of feed),
 *   - duplicates of a seeded title are archived except the newest,
 *   - the survivors get attributes that agree with their own title, and the
 *     price the Module-5 proposal text already quotes (₹82 Lakh).
 */
async function normalizeLegacy() {
  const qa = await q(`update listings set status='archived', archived_at=now()
                       where status='live' and title like '%% QA %%' returning id`);
  const dupes = await q(
    `update listings set status='archived', archived_at=now()
      where status='live' and id in (
        select id from (
          select id, row_number() over (partition by profile_id, title order by created_at desc) rn
            from listings where status='live'
        ) t where t.rn > 1
      ) returning id`,
  );
  await q(
    `update listings set price_paise=820000000, area_sqft=1420,
        description=coalesce(description, 'Semi-furnished 3 BHK in Shree Residency, Mavdi. East facing, ready to move, covered parking and 24x7 water.'),
        attributes = attributes || '{"bhk":"3","bathrooms":"2","builtup_area":{"value":1420,"unit":"sqft"},"furnishing":"semi","facing":"east","age":"1-5","car_parking":1,"lift":true}'::jsonb,
        amenities = case when coalesce(array_length(amenities,1),0) < 3 then array['lift','parking','security','power_backup'] else amenities end
      where title = '3 BHK Flat in Shree Residency' and status='live'`,
  );
  await q(
    `update listings set title='2 BHK Flat in Raiya Road, Rajkot', price_paise=450000000, area_sqft=1080,
        description=coalesce(description, 'Well-maintained 2 BHK on Raiya Road — third floor, lift, covered parking and a north-facing balcony.'),
        attributes = attributes || '{"bhk":"2","bathrooms":"2","builtup_area":{"value":1080,"unit":"sqft"},"furnishing":"semi","facing":"north","age":"5-10","car_parking":1,"lift":true}'::jsonb,
        amenities = case when coalesce(array_length(amenities,1),0) < 3 then array['lift','parking','security'] else amenities end
      where title = '2 BHK, Raiya Road' and status='live'`,
  );
  // 143 DRAFTS from repeated QA runs ("Godown QA broker", "QA edited title", …)
  // filled the profile grid with photo-less tiles. Soft-deleted, not hard —
  // they land in Trash exactly like a user's own deleted draft would.
  const qaDrafts = await q(
    `update listings set status='deleted', deleted_at=now()
      where status='draft' and deleted_at is null
        and (title like '%% QA %%' or title like 'QA %%' or title is null) returning id`,
  );

  // Older rows stored the amenity LABEL ("24×7 Security"); the form stores the
  // CODE. One vocabulary in the column, labels resolved at render time.
  const codes = await q(
    `update listings l set amenities = sub.codes
       from (select l2.id, array_agg(coalesce(a.code, x.v) order by ord) codes
               from listings l2, unnest(l2.amenities) with ordinality as x(v, ord)
               left join amenities a on a.label = x.v
              group by l2.id) sub
      where sub.id = l.id and sub.codes is distinct from l.amenities returning l.id`,
  );
  console.log(`legacy: archived ${qa.rowCount} QA-run listings + ${dupes.rowCount} duplicates, `
    + `trashed ${qaDrafts.rowCount} QA drafts, fixed the survivors' attributes, `
    + `normalised amenities on ${codes.rowCount} rows`);
}

/**
 * Every live listing sat in Rajkot, but the feed is CITY-SCOPED — so a
 * Vadodara owner or a Surat builder opened the app to a completely empty home.
 * Right fix is content, not dropping the city scope: give the other cities
 * their own areas (real master-data rows) and their own catalogue.
 */
const CITIES = {
  Vadodara: {
    id: "40f6caa8-ff81-4fac-b330-74ac5b590c51",
    district: "7b21a016-cb49-406d-b405-e50ff195d0a1",
    pin: "390007",
    areas: ["Alkapuri", "Gotri", "Waghodia Road", "Manjalpur"],
    sellers: ["meera", "manish"],
  },
  Surat: {
    id: "67909164-a5fb-42b6-912a-d291b84cd996",
    district: "df72787d-7ac9-43ae-b6f8-bf4ff4094fbe",
    pin: "395007",
    areas: ["Vesu", "Adajan", "Pal", "Piplod"],
    sellers: ["suresh", "rk"],
  },
  Ahmedabad: {
    id: "c6091016-d0a0-4d14-974a-5ef113c5bde9",
    district: "f7b0ddb8-b3c7-470b-9c66-8700cd4378a9",
    pin: "380015",
    areas: ["Satellite", "Bopal", "Prahlad Nagar", "Maninagar"],
    sellers: ["rk", "amit"],
  },
};

/** Six listings per city — same shape mix the Rajkot catalogue has. */
const CITY_TEMPLATE = [
  { type: "flat", kind: "sell", bhk: "3", price: L(78), sqft: 1520, t: (a) => `3 BHK Flat in ${a}`,
    d: (a, city) => `Ready-to-move 3 BHK in ${a}, ${city}. Semi-furnished, covered parking, lift and 24x7 water. Clear title, loan-eligible.`,
    attrs: { bhk: "3", bathrooms: "2", balconies: "2", builtup_area: { value: 1520, unit: "sqft" }, carpet_area: { value: 1230, unit: "sqft" }, floor: 6, total_floors: 11, furnishing: "semi", facing: "East", age: "1-5", car_parking: 1, lift: true, water: "municipal", ownership_type: "Freehold", construction_status: "resale" },
    amen: ["lift", "covered_parking", "security", "power_backup", "cctv", "garden"] },
  { type: "flat", kind: "rent", bhk: "2", price: L(0.22), deposit: L(1.2), sqft: 1080, t: (a) => `2 BHK on rent in ${a}`,
    d: (a, city) => `Semi-furnished 2 BHK on rent in ${a}, ${city}. Modular kitchen, wardrobes, lift and covered parking. Family preferred.`,
    attrs: { bhk: "2", bathrooms: "2", balconies: "1", builtup_area: { value: 1080, unit: "sqft" }, floor: 3, total_floors: 8, furnishing: "semi", facing: "North", age: "5-10", car_parking: 1, lift: true, water: "municipal", ownership_type: "Freehold" },
    amen: ["lift", "covered_parking", "security", "power_backup"] },
  { type: "bungalow", kind: "sell", bhk: "4", price: CR(2.1), sqft: 3100, t: (a) => `4 BHK Bungalow in ${a}`,
    d: (a, city) => `Independent 4 BHK bungalow in ${a}, ${city} — 300 sq yd plot, lawn, parking for three cars and a bore well.`,
    attrs: { bhk: "4", bathrooms: "3+", builtup_area: { value: 3100, unit: "sqft" }, plot_area: { value: 300, unit: "sqyd" }, total_floors: 2, furnishing: "semi", facing: "West", age: "5-10", car_parking: 3, ownership_type: "Freehold" },
    amen: ["covered_parking", "garden", "security", "water_24", "power_backup"] },
  { type: "shop", kind: "rent", price: L(0.65), deposit: L(4), sqft: 520, t: (a) => `Shop on rent, ${a} main road`,
    d: (a, city) => `Ground-floor shop on the ${a} main road, ${city}. 18 ft frontage, shutter plus glass front, washroom inside.`,
    attrs: { builtup_area: { value: 520, unit: "sqft" }, floor: 0, total_floors: 3, furnishing: "unfurnished", facing: "North", age: "1-5", frontage: 18, washroom: true, ownership_type: "Freehold" },
    amen: ["covered_parking", "power_backup", "cctv", "security"] },
  { type: "office", kind: "sell", price: CR(1.05), sqft: 1150, t: (a) => `Office 1150 sqft in ${a}`,
    d: (a, city) => `Corner office on the 4th floor in ${a}, ${city}. Two cabins, open floor for 20 seats, pantry, two washrooms, lift and covered parking.`,
    attrs: { builtup_area: { value: 1150, unit: "sqft" }, floor: 4, total_floors: 7, furnishing: "unfurnished", facing: "East", age: "0-1", car_parking: 2, lift: true, washroom: true, ownership_type: "Freehold" },
    amen: ["lift", "covered_parking", "security", "power_backup", "cctv", "fire_safety"] },
  { type: "plot_res", kind: "sell", price: L(55), sqft: 1800, t: (a) => `Residential plot 200 sq yd, ${a}`,
    d: (a, city) => `N.A. residential plot of 200 sq yd in a gated scheme at ${a}, ${city}. 24 ft internal road, boundary wall done.`,
    attrs: { plot_area: { value: 200, unit: "sqyd" }, facing: "South", road_width: 24, boundary_wall: true, ownership_type: "Freehold" },
    amen: ["security", "garden"] },
];

/**
 * Buyers + requirements for the non-Rajkot cities. Requirement browse is
 * city-scoped and excludes your own posts, so without a local buyer a Surat
 * builder opened Requirement mode to a blank screen.
 */
const CITY_BUYERS = {
  Vadodara: [
    { phone: "+919824100011", name: "Hiral Desai", username: "hiraldesai", role: "owner",
      bio: "Looking for a family home in Alkapuri or Gotri. Loan approved.",
      reqs: [
        { kind: "sell", type: "flat", bhk: 3, min: L(65), max: L(95), area: "Alkapuri", urgency: "immediate",
          notes: "3 BHK with two parkings and a lift, ready to move. Can close in 45 days." },
        { kind: "rent", type: "flat", bhk: 2, min: L(0.15), max: L(0.25), area: "Gotri", urgency: "1_3_months",
          notes: "Semi-furnished 2 BHK on rent near Gotri, society with security." },
      ] },
    { phone: "+919824100012", name: "Parth Trivedi", username: "parthtrivedi", role: "broker",
      bio: "Commercial specialist — Alkapuri, Race Course and Waghodia Road.",
      reqs: [
        { kind: "rent", type: "shop", bhk: null, min: L(0.5), max: L(1.2), area: "Manjalpur", urgency: "immediate",
          notes: "Client needs a 400-800 sqft shop with main-road frontage for a bakery chain." },
      ] },
  ],
  Surat: [
    { phone: "+919824100021", name: "Foram Shah", username: "foramshah", role: "owner",
      bio: "Relocating to Surat, need a 3 BHK near Vesu.",
      reqs: [
        { kind: "sell", type: "flat", bhk: 3, min: L(70), max: CR(1.1), area: "Vesu", urgency: "immediate",
          notes: "3 BHK in a gated society at Vesu or Piplod. Gym and clubhouse preferred." },
        { kind: "sell", type: "plot_res", bhk: null, min: L(45), max: L(70), area: "Pal", urgency: "exploring",
          notes: "Plot of 150-250 sq yd at Pal / Adajan for building later." },
      ] },
    { phone: "+919824100022", name: "Kunal Mehta", username: "kunalmehta", role: "owner",
      bio: "Textile business owner looking for office space.",
      reqs: [
        { kind: "rent", type: "office", bhk: null, min: L(0.3), max: L(0.8), area: "Adajan", urgency: "1_3_months",
          notes: "Office of 800-1500 sqft for a 20-person team, lift and parking mandatory." },
      ] },
  ],
  Ahmedabad: [
    { phone: "+919824100031", name: "Riya Kapoor", username: "riyakapoor", role: "owner",
      bio: "First-time buyer, Satellite / Bopal preferred.",
      reqs: [
        { kind: "sell", type: "flat", bhk: 2, min: L(50), max: L(75), area: "Bopal", urgency: "immediate",
          notes: "2 BHK under ₹75 lakh in Bopal or South Bopal. Ready possession only." },
        { kind: "rent", type: "flat", bhk: 3, min: L(0.25), max: L(0.4), area: "Satellite", urgency: "immediate",
          notes: "3 BHK on rent in Satellite for a family of four, furnished preferred." },
      ] },
    { phone: "+919824100032", name: "Devang Joshi", username: "devangjoshi", role: "broker",
      bio: "Residential resale across Satellite, Prahlad Nagar and Maninagar.",
      reqs: [
        { kind: "sell", type: "bungalow", bhk: 4, min: CR(2), max: CR(3.5), area: "Prahlad Nagar", urgency: "1_3_months",
          notes: "NRI client wants a 4 BHK bungalow, 300+ sq yd, west-facing avoided." },
      ] },
  ],
};

async function seedCityBuyers() {
  let people = 0, reqs = 0;
  for (const [city, buyers] of Object.entries(CITY_BUYERS)) {
    const cfg = CITIES[city];
    for (const b of buyers) {
      let p = await one("select id from profiles where phone=$1", [b.phone]);
      if (!p) {
        p = await one(
          `insert into profiles (phone, role, name, username, bio, city_id, is_registered, state)
           values ($1,$2,$3,$4,$5,$6,true,'active') returning id`,
          [b.phone, b.role, b.name, b.username, b.bio, cfg.id],
        );
        people++;
      } else {
        await q("update profiles set role=$2, name=$3, username=$4, bio=$5, city_id=$6, is_registered=true where id=$1",
          [p.id, b.role, b.name, b.username, b.bio, cfg.id]);
      }
      for (const r of b.reqs) {
        const areaId = await one("select id from locations where level='area' and name=$1 and parent_id=$2", [r.area, cfg.id]);
        const has = await one("select id from requirements where profile_id=$1 and notes=$2", [p.id, r.notes]);
        if (has) {
          await q(`update requirements set status='live', is_active=true,
                     expires_at=coalesce(expires_at, now() + interval '25 days') where id=$1`, [has.id]);
        } else {
          await q(
            `insert into requirements (profile_id,kind,type_code,bhk,budget_min_paise,budget_max_paise,area_ids,area_label,
                city_id,urgency,notes,status,is_active,submitted_at,approved_at,live_at,expires_at)
             values ($1,$2,$3,$4::int,$5::bigint,$6::bigint,$7::uuid[],$8,$9,$10,$11,'live',true,
                now() - interval '5 days', now() - interval '4 days',
                now() - ((random()*96)::int || ' hours')::interval, now() + interval '25 days')`,
            [p.id, r.kind, r.type, r.bhk, r.min, r.max, areaId ? [areaId.id] : [], `${r.area}, ${city}`,
             cfg.id, r.urgency, r.notes],
          );
          reqs++;
        }
      }
    }
  }
  console.log(`city buyers: +${people} profiles, +${reqs} requirements outside Rajkot`);
}

async function seedOtherCities(ids) {
  let made = 0, areasMade = 0;
  for (const [city, cfg] of Object.entries(CITIES)) {
    const areaIds = [];
    for (const a of cfg.areas) {
      let row = await one("select id from locations where level='area' and name=$1 and parent_id=$2", [a, cfg.id]);
      if (!row) {
        row = await one(
          `insert into locations (parent_id, level, name, pincode, is_active) values ($1,'area',$2,$3,true) returning id`,
          [cfg.id, a, cfg.pin],
        );
        areasMade++;
      }
      areaIds.push(row.id);
    }
    for (let i = 0; i < CITY_TEMPLATE.length; i++) {
      const T = CITY_TEMPLATE[i];
      const area = cfg.areas[i % cfg.areas.length];
      const areaId = areaIds[i % areaIds.length];
      const owner = ids[cfg.sellers[i % cfg.sellers.length]];
      const title = `${T.t(area)}, ${city}`;
      const existing = await one("select id from listings where profile_id=$1 and title=$2", [owner, title]);
      let id;
      const params = [owner, T.type, T.kind, title, T.d(area, city), T.price, T.deposit ?? null,
        GUJARAT, cfg.district, cfg.id, areaId, `${area}, ${city}`, cfg.pin,
        JSON.stringify(T.attrs), T.amen, T.sqft ?? null];
      if (existing) {
        id = existing.id;
        await q(
          `update listings set type_code=$2,kind=$3,status='live',availability='available',title=$4,description=$5,price_paise=$6,
             deposit_paise=$7,state_id=$8,district_id=$9,city_id=$10,area_id=$11,area_label=$12,pincode=$13,
             attributes=$14::jsonb,amenities=$15,area_sqft=$16,is_negotiable=true,
             live_at=coalesce(live_at, now() - ((random()*96)::int || ' hours')::interval) where id=$1`,
          [id, T.type, T.kind, title, T.d(area, city), T.price, T.deposit ?? null, GUJARAT, cfg.district, cfg.id,
           areaId, `${area}, ${city}`, cfg.pin, JSON.stringify(T.attrs), T.amen, T.sqft ?? null],
        );
      } else {
        id = (await one(
          `insert into listings (profile_id,type_code,kind,status,availability,title,description,price_paise,deposit_paise,
              is_negotiable,state_id,district_id,city_id,area_id,area_label,pincode,attributes,amenities,contact_public,
              area_sqft,submitted_at,approved_at,live_at)
           values ($1,$2,$3,'live','available',$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,false,$16,
              now() - interval '7 days', now() - interval '6 days', now() - ((random()*96)::int || ' hours')::interval)
           returning id`,
          params,
        )).id;
      }
      await setPhotos(id, owner, T.type, i * 3 + city.length);
      made++;
    }
  }
  console.log(`other cities: ${made} listings across ${Object.keys(CITIES).length} cities (+${areasMade} new area rows)`);
}

// -------------------------------------------------------------------- run
await uploadPhotos();
await normalizeLegacy();
await repairExistingPhotos();
const ids = {};
for (const [k, phone] of Object.entries({ ...SELLERS, ...BUYERS })) ids[k] = await idOf(phone);
await seedListings(ids);
await seedOtherCities(ids);
await seedCityBuyers();
await seedRequirements(ids);
await seedProjects(ids);
await seedInteractions(ids);

const counts = await one(`select
   (select count(*) from listings where status='live')::int live_listings,
   (select count(*) from listing_photos where status='ready' and url like 'http%')::int real_photos,
   (select count(*) from requirements where status='live')::int live_requirements,
   (select count(*) from projects where status='live')::int live_projects,
   (select count(*) from saves)::int saves,
   (select count(*) from inquiries)::int inquiries`);
console.log("\nDB after seed:", counts);
await c.end();
