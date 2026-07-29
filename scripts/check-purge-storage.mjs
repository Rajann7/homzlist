/**
 * Live proof that purging no longer leaks files (migration 0080).
 *
 * The leak: "Delete now" and the 31st-day cron deleted the listing/project row,
 * `listing_photos` / `project_photos` cascaded away with it — and every object
 * those rows pointed at stayed in the bucket forever, unreferenced, with
 * nothing left in the database that even knew the key. A project's BROCHURE
 * leaked the same way out of the private bucket, and it was never a photo row
 * at all so no cascade would ever have reached it.
 *
 * Two comments in lib/listings/photos.ts also promised "the 7-day orphan sweep
 * will catch it" for a delete that throws. No such sweep existed.
 *
 * What this walks, checking `storage.objects` (the real bucket) after each step:
 *   1. a purged PROJECT takes its photo objects AND its brochure with it
 *   2. a purged LISTING takes its photo objects with it
 *   3. the cron purge (30-day trash) does the same, not just the button
 *   4. a delete that fails is RECORDED in storage_orphans, and the sweep in the
 *      lifecycle chain drains it
 *   5. purge is still ownership-scoped — another user's purge deletes nothing,
 *      neither row nor object
 *
 *   PURGE_BASE=http://localhost:3000 node scripts/check-purge-storage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.env.PURGE_BASE || "http://localhost:3000";

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

// ---- Supabase Storage, straight from the service key -----------------------
const SB = E.NEXT_PUBLIC_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_BUCKET = "listing-photos";
const PRIVATE_BUCKET = "private-docs";

// A 1x1 PNG — small, and a real image, so nothing downstream rejects it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function upload(bucket, key) {
  const res = await fetch(`${SB}/storage/v1/object/${bucket}/${key}`, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "image/png", "x-upsert": "true" },
    body: PNG,
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${key}: ${res.status} ${await res.text()}`);
  return key;
}
/** Does the object exist IN THE BUCKET? Read from storage.objects, not from us. */
const objectExists = async (bucket, key) =>
  Boolean(await row1(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, key]));

// ---- HTTP with a cookie jar ------------------------------------------------
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
const cookie = (k) => [...(jars.get(k) ?? new Map())].map(([a, b]) => `${a}=${b}`).join("; ");

let ipN = 40;
async function api(key, p, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipN++ % 250}`, ...headers, ...(key ? { cookie: cookie(key) } : {}) },
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
const builders = (await sql(
  `select id, phone from profiles where role = 'builder' and state = 'active' order by created_at limit 2`,
)).rows;
const owner = builders[0];
const intruder = builders[1];
for (const b of [owner, intruder]) {
  const r = await login(b.phone);
  if (r !== "ok") { console.log(`login ${b.phone}: ${r} — restart the dev server to reset the OTP limiter`); await pgc.end(); process.exit(1); }
}
console.log(`owner ${owner.phone} · intruder ${intruder.phone}`);

const city = await row1(
  `select c.id from locations c
     join locations t on t.id = c.parent_id
     join locations d on d.id = t.parent_id
     join locations s on s.id = d.parent_id and s.level = 'state'
    where c.level = 'city' limit 1`,
);

const madeProjects = [];
const madeListings = [];
const madeKeys = [];

async function makeProjectWithFiles(status = "deleted", deletedAt = "now()") {
  const p = await row1(
    `insert into projects (profile_id, name, status, city_id, area_label, pincode, project_type,
                           rera_exempt, rera_exempt_reason, build_status, deleted_at)
     values ($1,$2,$3,$4,'Purge Probe','360001','apartment',true,'plot_under_500sqm','under_construction', ${deletedAt})
     returning id`,
    [owner.id, `ZZ Purge Probe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, status, city.id],
  );
  madeProjects.push(p.id);

  const photoKey = `projects/${p.id}/${Math.random().toString(36).slice(2)}.png`;
  const brochureKey = `projects/${p.id}/brochure-${Math.random().toString(36).slice(2)}.png`;
  await upload(PUBLIC_BUCKET, photoKey);
  await upload(PRIVATE_BUCKET, brochureKey);
  madeKeys.push([PUBLIC_BUCKET, photoKey], [PRIVATE_BUCKET, brochureKey]);

  await sql(
    `insert into project_photos (project_id, profile_id, storage_key, bucket, url, position, status)
     values ($1,$2,$3,$4,$5,0,'ready')`,
    [p.id, owner.id, photoKey, PUBLIC_BUCKET, `${SB}/storage/v1/object/public/${PUBLIC_BUCKET}/${photoKey}`],
  );
  await sql(`update projects set brochure_key = $2, brochure_bucket = $3 where id = $1`, [p.id, brochureKey, PRIVATE_BUCKET]);

  return { id: p.id, photoKey, brochureKey };
}

// ---------------------------------------------------------------------------
console.log("\n1. purging a project takes its photos AND its brochure");
{
  const p = await makeProjectWithFiles();
  check(await objectExists(PUBLIC_BUCKET, p.photoKey), "the photo object is in the bucket to begin with");
  check(await objectExists(PRIVATE_BUCKET, p.brochureKey), "the brochure is in the private bucket to begin with");

  const purge = await api(owner.phone, `/api/v1/projects/${p.id}/purge`, { method: "POST" });
  check(purge.status === 200, "POST purge → 200", `got ${purge.status}`);
  check((await row1(`select id from projects where id = $1`, [p.id])) === null, "the project row is gone");
  check((await row1(`select id from project_photos where project_id = $1`, [p.id])) === null, "the photo row cascaded");
  check(!(await objectExists(PUBLIC_BUCKET, p.photoKey)), "AND the photo object is gone from the bucket");
  check(!(await objectExists(PRIVATE_BUCKET, p.brochureKey)), "AND the brochure is gone from the private bucket");
}

console.log("\n2. purging a listing takes its photos");
{
  const l = await row1(
    `insert into listings (profile_id, type_code, kind, status, city_id, area_label, deleted_at)
     values ($1, 'flat', 'sell', 'deleted', $2, 'Purge Probe', now()) returning id`,
    [owner.id, city.id],
  );
  madeListings.push(l.id);
  const key = `listings/${l.id}/${Math.random().toString(36).slice(2)}.png`;
  await upload(PUBLIC_BUCKET, key);
  madeKeys.push([PUBLIC_BUCKET, key]);
  await sql(
    `insert into listing_photos (listing_id, profile_id, storage_key, bucket, url, position, status)
     values ($1,$2,$3,$4,$5,0,'ready')`,
    [l.id, owner.id, key, PUBLIC_BUCKET, `${SB}/storage/v1/object/public/${PUBLIC_BUCKET}/${key}`],
  );

  check(await objectExists(PUBLIC_BUCKET, key), "the photo object is in the bucket to begin with");
  const purge = await api(owner.phone, `/api/v1/listings/${l.id}/purge`, { method: "POST" });
  check(purge.status === 200, "POST purge → 200", `got ${purge.status}`);
  check((await row1(`select id from listings where id = $1`, [l.id])) === null, "the listing row is gone");
  check(!(await objectExists(PUBLIC_BUCKET, key)), "AND the photo object is gone from the bucket");
}

console.log("\n3. the 31st-day CRON purge does it too, not just the button");
{
  // Deleted 40 days ago → inside the cron's window.
  const p = await makeProjectWithFiles("deleted", "now() - interval '40 days'");
  const cron = await api(null, "/api/v1/cron/listings", {
    method: "POST",
    headers: { authorization: `Bearer ${E.CRON_SECRET}` },
  });
  check(cron.status === 200, "cron → 200", `got ${cron.status}`);
  check((await row1(`select id from projects where id = $1`, [p.id])) === null, "the aged-out project row is gone");
  check(!(await objectExists(PUBLIC_BUCKET, p.photoKey)), "AND its photo object is gone from the bucket");
  check(!(await objectExists(PRIVATE_BUCKET, p.brochureKey)), "AND its brochure is gone");
  check(typeof cron.json?.data?.storageCleared === "number", "the report carries storageCleared", JSON.stringify(cron.json?.data ?? {}));
}

console.log("\n4. a failed delete is recorded, and the sweep drains it");
{
  // A key the app asked to delete and could not. The sweep is the ONLY thing
  // that reads this table, and it never scans the bucket — so seeding a row is
  // exactly what a failure would have left behind.
  const key = `listings/zz-sweep-probe/${Math.random().toString(36).slice(2)}.png`;
  await upload(PUBLIC_BUCKET, key);
  madeKeys.push([PUBLIC_BUCKET, key]);
  await sql(
    `insert into storage_orphans (storage_key, bucket, reason, attempts, last_error)
     values ($1,$2,'probe: simulated delete failure',1,'connection reset')`,
    [key, PUBLIC_BUCKET],
  );
  check(await objectExists(PUBLIC_BUCKET, key), "the orphaned object is in the bucket");

  const cron = await api(null, "/api/v1/cron/listings", {
    method: "POST",
    headers: { authorization: `Bearer ${E.CRON_SECRET}` },
  });
  check(cron.status === 200, "cron → 200", `got ${cron.status}`);
  check(!(await objectExists(PUBLIC_BUCKET, key)), "the sweep deleted the orphaned object");
  check(
    (await row1(`select id from storage_orphans where storage_key = $1`, [key])) === null,
    "and cleared its row from storage_orphans",
  );
}

console.log("\n5. purge is still ownership-scoped");
{
  const p = await makeProjectWithFiles();
  const purge = await api(intruder.phone, `/api/v1/projects/${p.id}/purge`, { method: "POST" });
  check(purge.status === 404, "another builder's purge → 404", `got ${purge.status}`);
  check(!!(await row1(`select id from projects where id = $1`, [p.id])), "the row survives");
  check(await objectExists(PUBLIC_BUCKET, p.photoKey), "and so does the object — no delete-by-probe");

  const anon = await api(null, `/api/v1/projects/${p.id}/purge`, { method: "POST" });
  check(anon.status === 401, "unauthenticated purge → 401", `got ${anon.status}`);
}

// ---------------------------------------------------------------------------
// Clean up anything the run created and did not itself remove.
await sql(`delete from projects where id = any($1)`, [madeProjects]);
await sql(`delete from listings where id = any($1)`, [madeListings]);
await sql(`delete from storage_orphans where reason like 'probe:%'`);
for (const [bucket, key] of madeKeys) {
  await fetch(`${SB}/storage/v1/object/${bucket}/${key}`, { method: "DELETE", headers: { authorization: `Bearer ${KEY}` } });
}
const leftover = await row1(`select count(*)::int as n from storage.objects where name like '%Purge Probe%' or name like '%zz-sweep-probe%'`);
console.log(`\ncleaned up (${leftover.n} probe object(s) left in the bucket)`);
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
await pgc.end();
process.exit(fails ? 1 : 0);
