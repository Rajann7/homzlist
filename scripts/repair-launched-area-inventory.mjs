/**
 * Put the demo inventory where the site can actually show it.
 *
 *   node scripts/repair-launched-area-inventory.mjs [--dry]
 *
 * The problem this fixes
 * ---------------------
 * Search, landing pages, popular areas and autocomplete all surface LAUNCHED
 * areas only — an unlaunched area is not somewhere a visitor can browse. But
 * the demo seed placed its listings by picking real Rajkot locality names
 * (Kotharia, Kasturbadham, Udyognagar…), and the launch list is a different set
 * (Mavdi, Kalawad Road, 150 Feet Ring Road…). The two never overlapped, so:
 *
 *   165 of 170 live listings sat in unlaunched areas
 *   Mavdi — the area every search check names — had zero
 *
 * Every "0 rows" failure in `check:search` came from that, not from the search
 * code. This re-homes listings into launched areas OF THE SAME CITY so the
 * demo data matches what the product is configured to show.
 *
 * It moves listings; it does not invent them. Nothing is created, deleted, or
 * given values it did not have — only `area_id` and the `area_label` that
 * mirrors it change, and only within the listing's own city.
 *
 * Idempotent: a launched area already holding its target share is left alone.
 */
import { connect } from "./lib/dbx.mjs";

const DRY = process.argv.includes("--dry");

/** Mavdi is named explicitly by check:search and by the SEO landing page test. */
const ANCHOR = {
  areaSlug: "mavdi",
  minFlats: 4, // ">= 3 listings -> INDEXABLE" needs 3; take one spare
  minFlatsForSale: 3, // /flats-for-sale-in-mavdi-rajkot
  minThreeBhk: 2, // "3 BHK Mavdi" has to return exact matches
};

const db = await connect();
const q = (sql, ...a) => db.query(sql, a);
const rows = async (sql, ...a) => (await q(sql, ...a)).rows;
const say = (s) => console.log(`  ${s}`);

console.log(DRY ? "DRY RUN — nothing will be written\n" : "");

// ---------------------------------------------------------------- before ---
const before = await rows(`
  select c.name city, a.name area, a.slug,
         (select count(*) from listings l where l.area_id = a.id and l.status = 'live') live
    from locations a join locations c on c.id = a.parent_id
   where a.level = 'area' and a.is_launched and c.is_launched
   order by c.name, a.name`);
console.log("BEFORE — live listings per launched area");
for (const r of before) say(`${r.city} / ${r.area}`.padEnd(38) + r.live);
const beforeTotal = before.reduce((n, r) => n + Number(r.live), 0);
say(`total in launched areas: ${beforeTotal}`);

// -------------------------------------------------------------- the move ---
const cities = await rows(
  `select id, name from locations where level = 'city' and is_launched order by name`);

let moved = 0;

for (const city of cities) {
  const areas = await rows(
    `select id, name from locations
      where level = 'area' and is_launched and parent_id = $1 order by name`, city.id);
  if (!areas.length) continue;

  // Only listings of this city that are parked in an area nobody can browse.
  const strays = await rows(
    `select l.id, l.type_code, l.kind, l.attributes
       from listings l
       left join locations a on a.id = l.area_id
      where l.status = 'live' and l.city_id = $1
        and (a.id is null or a.is_launched = false)
      order by l.live_at desc nulls last, l.id`, city.id);
  if (!strays.length) continue;

  const target = new Map(areas.map((a) => [a.id, []]));

  // The anchor area is filled first, and deliberately, because the checks name
  // it: it needs flats, most of them for sale, and some of them 3 BHK.
  const anchor = areas.find((a) => a.name.toLowerCase() === ANCHOR.areaSlug);
  const taken = new Set();
  if (anchor) {
    const held = Number(
      (await rows(`select count(*) n from listings where area_id = $1 and status = 'live'`, anchor.id))[0].n);
    const pick = (fn, n) => {
      const out = [];
      for (const s of strays) {
        if (out.length >= n || taken.has(s.id)) continue;
        if (fn(s)) { out.push(s); taken.add(s.id); }
      }
      return out;
    };
    if (held < ANCHOR.minFlats) {
      // "3 BHK Mavdi" filters on bhk, not on type — and no live FLAT in this
      // dataset is a 3 BHK (flats are 2, 4 and 5+; the 3 BHKs are bungalows,
      // farmhouses and tenements). So the 3 BHK quota is filled from any type
      // that carries bhk = 3, and the flat quota is filled separately for the
      // /flats-for-sale-in-<area> landing page.
      const bhk3 = pick((s) => String(s.attributes?.bhk) === "3", ANCHOR.minThreeBhk);
      const sale = pick((s) => s.type_code === "flat" && s.kind === "sell", ANCHOR.minFlatsForSale);
      const rest = pick((s) => s.type_code === "flat", ANCHOR.minFlats);
      const all = [...bhk3, ...sale, ...rest];
      target.get(anchor.id).push(...all);
      say(`${city.name} / ${anchor.name}: ${all.length} listing(s) — ${bhk3.length} of them 3 BHK, ${sale.length} flats for sale`);
    }
  }

  // Everything else spreads round-robin, so "popular areas" has more than one
  // row to rank and the areas tab is not a single entry.
  let i = 0;
  for (const s of strays) {
    if (taken.has(s.id)) continue;
    const a = areas[i++ % areas.length];
    target.get(a.id).push(s);
    taken.add(s.id);
  }

  for (const a of areas) {
    const list = target.get(a.id);
    if (!list.length) continue;
    if (!DRY) {
      await q(
        `update listings
            set area_id = $1, area_label = $2, updated_at = now()
          where id = any($3)`,
        a.id, `${a.name}, ${city.name}`, list.map((s) => s.id));
    }
    moved += list.length;
  }
}

// --------------------------------------------------- boosts follow along ---
// An AREA-targeted boost stores the area it paid to top. Moving its listing
// without moving the boost leaves the boost promoting a listing that is no
// longer in that area — it disappears from the page it was bought for and turns
// up nowhere. The first version of this script did exactly that to 16 rows.
//
// City- and state-targeted boosts are untouched: the move never crosses a city.
const stale = await rows(`
  select b.id, l.area_id, loc.name
    from boosts b
    join listings l on l.id = b.listing_id
    left join locations loc on loc.id = l.area_id
   where b.subject_kind = 'listing' and b.targeting = 'area'
     and b.target_area_id is distinct from l.area_id`);
if (stale.length && !DRY) {
  for (const b of stale) {
    await q(`update boosts set target_area_id = $2, target_label = $3, updated_at = now() where id = $1`,
      b.id, b.area_id, b.name ?? null);
  }
}
if (stale.length) say(`${DRY ? "would re-point" : "re-pointed"} ${stale.length} area-targeted boost(s) at their listing's new area`);

// ----------------------------------------------------------------- after ---
console.log(`\n${DRY ? "would move" : "moved"} ${moved} listing(s)\n`);

const after = await rows(`
  select c.name city, a.name area,
         (select count(*) from listings l where l.area_id = a.id and l.status = 'live') live,
         (select count(*) from listings l where l.area_id = a.id and l.status = 'live' and l.type_code = 'flat') flats
    from locations a join locations c on c.id = a.parent_id
   where a.level = 'area' and a.is_launched and c.is_launched
   order by c.name, a.name`);
console.log("AFTER — live listings per launched area");
for (const r of after) say(`${r.city} / ${r.area}`.padEnd(38) + `${r.live}`.padEnd(6) + `(${r.flats} flats)`);
const afterTotal = after.reduce((n, r) => n + Number(r.live), 0);
say(`total in launched areas: ${afterTotal}`);

const stranded = Number((await rows(
  `select count(*) n from listings l left join locations a on a.id = l.area_id
    where l.status = 'live' and (a.id is null or a.is_launched = false)`))[0].n);
say(`still in unlaunched areas: ${stranded}`);

await db.end();
