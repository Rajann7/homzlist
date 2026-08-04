/**
 * Seed the all-India location master from the India Post / GeoNames directory.
 *
 *   node scripts/seed-india-locations.mjs [--file path/to/IN.txt] [--dry]
 *
 * The dump is downloaded from https://download.geonames.org/export/zip/IN.zip
 * (CC-BY 4.0) when no --file is given.
 *
 * This is ADDITIVE and re-runnable. Existing rows are matched by
 * (parent, level, normalised name) and keep their ids, because listings,
 * requirements, boosts and saved searches point at them — re-seeding must never
 * orphan a live row. `is_launched` is never touched on a row that already
 * exists, so the launched-city set stays a product decision rather than a side
 * effect of a data import.
 *
 * New cities land as is_launched = false: the city is now selectable everywhere
 * a location is picked, but SEO landing pages, sitemaps and the "we're not in
 * your city yet" screen keep working off the launched set.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import zlib from "node:zlib";
import pg from "pg";
import { parseDump, buildTree, countTree } from "./lib/india-locations.mjs";
import { connect as dbConnect } from "./lib/dbx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DUMP_URL = "https://download.geonames.org/export/zip/IN.zip";

const args = process.argv.slice(2);
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry");

// ---- env -------------------------------------------------------------------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---- 1. the dump -----------------------------------------------------------
async function loadDump() {
  const given = argOf("--file");
  if (given) return fs.readFileSync(given, "utf8");

  const cached = path.join(os.tmpdir(), "homzlist-IN.txt");
  if (fs.existsSync(cached)) {
    console.log(`using cached dump ${cached}`);
    return fs.readFileSync(cached, "utf8");
  }

  console.log(`downloading ${DUMP_URL} …`);
  const res = await fetch(DUMP_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());

  // The archive holds IN.txt and readme.txt. Rather than pull in a zip
  // dependency, walk the central directory and inflate the one entry we want.
  const text = extractFromZip(zip, "IN.txt");
  fs.writeFileSync(cached, text);
  console.log(`cached to ${cached} (${(text.length / 1e6).toFixed(1)} MB)`);
  return text;
}

/** Minimal ZIP reader: find `name`'s local header and inflate it. */
function extractFromZip(buf, name) {
  const target = Buffer.from(name);
  for (let i = 0; i < buf.length - 30; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;      // local file header
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const start = i + 30;
    if (!buf.subarray(start, start + nameLen).equals(target)) continue;
    const dataStart = start + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    return (method === 0 ? data : zlib.inflateRawSync(data)).toString("utf8");
  }
  throw new Error(`${name} not found in archive`);
}

// ---- 2. flatten the tree into rows we can insert ---------------------------
/**
 * Walk the tree depth-first, assigning ids. Existing rows are looked up by
 * (parent id, level, normalised name) and reused, so a re-run inserts only
 * what's genuinely new.
 */
function flatten(tree, existing, citySlugs, scopeSlugs) {
  const nodes = [];   // { id, parentId, level, name, slug, pincode, isNew }
  const pins = [];    // { locationId, pincode }

  const idFor = (parentId, level, name) => {
    const key = `${parentId ?? "root"}|${level}|${norm(name)}`;
    const hit = existing.get(key);
    return hit ?? null;
  };

  const emit = (parentId, level, name, pincodes) => {
    const found = idFor(parentId, level, name);
    const id = found ?? randomUUID();
    const primary = pincodes && pincodes.size ? [...pincodes].sort()[0] : null;

    // Two uniqueness rules apply. `locations_slug_scope_uidx` makes a slug
    // unique among its siblings — and "M Songel" and "M. Songel" are different
    // names that slugify the same. `locations_city_slug_uidx` additionally
    // makes CITY slugs unique across all of India, where hundreds of villages
    // are called Rampur. Both are resolved by suffixing, never by colliding.
    const base = slugify(name);
    const scope = `${level}|${parentId ?? "root"}`;
    let slug = base;
    let n = 2;
    const taken = (s) =>
      (scopeSlugs.get(scope)?.get(s) ?? id) !== id ||
      (level === "city" && (citySlugs.get(s) ?? id) !== id);
    while (taken(slug)) slug = `${base}-${n++}`;
    if (!scopeSlugs.has(scope)) scopeSlugs.set(scope, new Map());
    scopeSlugs.get(scope).set(slug, id);
    if (level === "city") citySlugs.set(slug, id);

    nodes.push({ id, parentId, level, name, slug, pincode: primary, isNew: !found });
    for (const p of pincodes ?? []) pins.push({ locationId: id, pincode: p });
    return id;
  };

  for (const state of tree.values()) {
    const stateId = emit(null, "state", state.name, null);
    for (const district of state.districts.values()) {
      const districtId = emit(stateId, "district", district.name, null);
      for (const taluka of district.talukas.values()) {
        const talukaId = emit(districtId, "taluka", taluka.name, null);
        for (const city of taluka.cities.values()) {
          const cityId = emit(talukaId, "city", city.name, city.pincodes);
          for (const area of city.areas.values()) {
            emit(cityId, "area", area.name, area.pincodes);
          }
        }
      }
    }
  }
  return { nodes, pins };
}

// ---- 3. run ----------------------------------------------------------------
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const client = await dbConnect();
// This dump is large; the per-statement timeout has to come off for it.
await client.query("set statement_timeout = 0");

const text = await loadDump();
const rows = parseDump(text);
const tree = buildTree(rows);
console.log("parsed:", rows.length, "offices →", countTree(tree));

try {
  // Existing rows keep their ids — listings point at them.
  const { rows: current } = await client.query("select id, parent_id, level, name, slug from locations");
  const existing = new Map();
  for (const r of current) existing.set(`${r.parent_id ?? "root"}|${r.level}|${norm(r.name)}`, r.id);
  const citySlugs = new Map();
  const scopeSlugs = new Map();
  for (const r of current) {
    if (r.level === "city") citySlugs.set(r.slug, r.id);
    const scope = `${r.level}|${r.parent_id ?? "root"}`;
    if (!scopeSlugs.has(scope)) scopeSlugs.set(scope, new Map());
    scopeSlugs.get(scope).set(r.slug, r.id);
  }
  console.log(`existing rows: ${current.length}`);

  const { nodes, pins } = flatten(tree, existing, citySlugs, scopeSlugs);
  const fresh = nodes.filter((n) => n.isNew);
  console.log(`nodes: ${nodes.length} (${fresh.length} new, ${nodes.length - fresh.length} reused)`);
  console.log(`pincode links: ${pins.length}`);

  if (DRY) { console.log("--dry: nothing written"); process.exit(0); }

  // Insert parents before children: the tree walk already emits in that order.
  const CHUNK = 2000;
  let done = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const batch = fresh.slice(i, i + CHUNK);
    await client.query(
      `insert into locations (id, parent_id, level, name, slug, pincode, is_launched)
       select * from unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[])
       on conflict (id) do nothing`,
      [
        batch.map((n) => n.id),
        batch.map((n) => n.parentId),
        batch.map((n) => n.level),
        batch.map((n) => n.name),
        batch.map((n) => n.slug),
        batch.map((n) => n.pincode),
        // New cities are selectable but not "launched" — launching a city is a
        // product decision (SEO pages, coming-soon screen), not an import.
        batch.map(() => false),
      ],
    );
    done += batch.length;
    if (done % 20000 < CHUNK) console.log(`  … ${done}/${fresh.length} nodes`);
  }

  // Primary pincode for rows that had none (including pre-existing ones).
  const withPin = nodes.filter((n) => n.pincode);
  for (let i = 0; i < withPin.length; i += CHUNK) {
    const batch = withPin.slice(i, i + CHUNK);
    await client.query(
      `update locations l set pincode = v.pincode
         from (select * from unnest($1::uuid[], $2::text[]) as t(id, pincode)) v
        where l.id = v.id and l.pincode is null`,
      [batch.map((n) => n.id), batch.map((n) => n.pincode)],
    );
  }

  let pdone = 0;
  for (let i = 0; i < pins.length; i += CHUNK) {
    const batch = pins.slice(i, i + CHUNK);
    await client.query(
      `insert into location_pincodes (location_id, pincode)
       select * from unnest($1::uuid[], $2::text[])
       on conflict do nothing`,
      [batch.map((p) => p.locationId), batch.map((p) => p.pincode)],
    );
    pdone += batch.length;
    if (pdone % 40000 < CHUNK) console.log(`  … ${pdone}/${pins.length} pincode links`);
  }

  const report = await client.query(`
    select level, count(*)::int as n from locations group by level
    union all select 'pincode_links', count(*)::int from location_pincodes
    union all select 'distinct_pincodes', count(distinct pincode)::int from location_pincodes
    order by 1`);
  console.table(report.rows);
} finally {
  await client.end();
}
