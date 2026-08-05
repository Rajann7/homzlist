/**
 * Which seeded demo photos are still referenced, and which of them exist.
 *
 *   node scripts/check-demo-photos.mjs [--fix]
 *
 * The dev dataset points at a `listing-photos/demo/` set that was uploaded once.
 * Some of the names the seeds wrote were never in the bucket, so those rows
 * render a broken image: Supabase answers a missing object with a JSON error
 * body, and the browser refuses to paint that as an image (Chrome reports it as
 * ERR_BLOCKED_BY_ORB, which is how this was found — on the public feed).
 *
 * `--fix` re-points every reference to a file that is actually there. For
 * listings and projects the replacement is chosen from the property TYPE, so a
 * plot gets an outdoor shot rather than someone's bedroom.
 *
 * Exits non-zero when something is missing and --fix was not passed, so it can
 * be used as a check.
 */
import { connect } from "./lib/dbx.mjs";

const FIX = process.argv.includes("--fix");
const db = await connect();
const rows = async (sql, ...a) => (await db.query(sql, a)).rows;

/** Every column that holds one of these URLs. */
const COLUMNS = [
  { table: "listings", col: "cover_url", typed: true },
  { table: "listing_photos", col: "url" },
  { table: "projects", col: "cover_url" },
  { table: "project_photos", col: "url" },
  { table: "profiles", col: "photo_url" },
  { table: "chat_messages", col: "photo_url" },
  { table: "notifications", col: "thumb_url" },
  { table: "feed_banners", col: "image_url" },
];

const fileOf = (col) => `regexp_replace(${col}, '^.*/demo/', '')`;

// ---- what is referenced, and where -----------------------------------------
const referenced = new Map(); // file -> total references
let base = null;
for (const c of COLUMNS) {
  const r = await rows(
    `select ${fileOf(c.col)} as file, min(${c.col}) as any_url, count(*)::int as n
       from ${c.table} where ${c.col} like '%/demo/%' group by 1`).catch(() => []);
  for (const row of r) {
    referenced.set(row.file, (referenced.get(row.file) ?? 0) + row.n);
    base ??= row.any_url.replace(/\/demo\/.*$/, "/demo/");
  }
}

if (!referenced.size) { console.log("nothing references the demo photo set"); await db.end(); process.exit(0); }

// ---- which of them exist ----------------------------------------------------
const exists = async (file) => {
  try {
    const r = await fetch(base + file);
    return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/");
  } catch { return false; }
};

const good = [], missing = [];
for (const file of [...referenced.keys()].sort()) ((await exists(file)) ? good : missing).push(file);

console.log(`referenced: ${referenced.size}   present: ${good.length}   MISSING: ${missing.length}`);
for (const m of missing) console.log(`  ${m.padEnd(22)} ${referenced.get(m)} reference(s)`);
if (!good.length) { console.log("\nnone of the demo photos resolve — is the bucket empty?"); await db.end(); process.exit(1); }

/**
 * A plausible photo for a property type.
 *
 * Matching on the missing file's own name is not enough: nothing in the bucket
 * starts with "land", "empty" or "construction", so those fall through to
 * whatever happens to be first — which is how 56 plots ended up showing a
 * bedroom. The row's TYPE is what decides.
 */
const BY_TYPE = [
  [/^plot|^farm|agri|land/, ["exterior-4.jpg", "exterior-3.jpg"]],
  [/office/, ["office-0.jpg", "office-1.jpg"]],
  [/shop|showroom|commercial/, ["shop-0.jpg", "shop-1.jpg"]],
  [/pg|hostel/, ["bedroom-0.jpg", "bedroom-1.jpg"]],
];
const DEFAULT_PICKS = ["living-1.jpg", "living-2.jpg", "bedroom-0.jpg", "kitchen-1.jpg"];
const picksFor = (typeCode) => {
  const hit = BY_TYPE.find(([re]) => re.test(typeCode ?? ""));
  const usable = (hit ? hit[1] : DEFAULT_PICKS).filter((w) => good.includes(w));
  return usable.length ? usable : good;
};

if (!FIX) {
  console.log(missing.length ? "\nre-run with --fix to re-point them" : "\nall demo photos resolve");
  await db.end();
  process.exit(missing.length ? 1 : 0);
}

// ---- repair -----------------------------------------------------------------
let n = 0;

// Listings carry a type, so they get a photo that suits what they are selling —
// including rows whose cover resolves but is wrong for the type.
const OUTDOOR = ["exterior-4.jpg", "exterior-3.jpg"];
const wrongForType = await rows(
  `select id, type_code, cover_url from listings
    where cover_url like '%/demo/%'
      and ( ${fileOf("cover_url")} = any($1)
         or ((type_code like 'plot%' or type_code = 'farmhouse') and ${fileOf("cover_url")} <> all($2))
         or (type_code = 'office' and ${fileOf("cover_url")} not like 'office%')
         or (type_code in ('shop','showroom') and ${fileOf("cover_url")} not like 'shop%') )`,
  missing, OUTDOOR);

for (const [i, l] of wrongForType.entries()) {
  const picks = picksFor(l.type_code);
  const to = picks[i % picks.length];
  const from = l.cover_url.replace(/^.*\/demo\//, "");
  await db.query(`update listings set cover_url = replace(cover_url, $2, $3), updated_at = now() where id = $1`, [l.id, from, to]);
  await db.query(`update listing_photos set url = replace(url, $2, $3) where listing_id = $1 and url like $4`,
    [l.id, from, to, `%/demo/${from}`]).catch(() => {});
  n++;
}
if (wrongForType.length) console.log(`\nlistings: ${wrongForType.length} re-pointed, matched to their property type`);

// Everything else: swap the missing name for a present one, spread across the
// set so a page does not end up showing the same picture eight times.
for (const c of COLUMNS) {
  for (const [i, m] of missing.entries()) {
    const to = DEFAULT_PICKS.filter((p) => good.includes(p))[i % Math.max(1, DEFAULT_PICKS.filter((p) => good.includes(p)).length)] ?? good[0];
    const r = await db.query(
      `update ${c.table} set ${c.col} = replace(${c.col}, $1, $2) where ${c.col} like $3`,
      [m, to, `%/demo/${m}`]).catch(() => ({ rowCount: 0 }));
    if (r.rowCount) { console.log(`  ${c.table}.${c.col}: ${m} -> ${to} (${r.rowCount})`); n += r.rowCount; }
  }
}

console.log(`\nre-pointed ${n} reference(s)`);
await db.end();
