/**
 * Move media from Supabase Storage → Cloudflare R2.
 *
 * Run this AFTER the R2_* credentials are in .env.local. `lib/storage.ts` will
 * already have switched driver to "r2" for NEW uploads at that point; this
 * moves the objects that were written while Supabase was the store, and
 * rewrites the DB rows to point at the new URLs.
 *
 * Safe to re-run: it skips anything already marked as living in R2, and it
 * copies-then-updates-then-deletes, so a crash mid-run leaves the object
 * readable from Supabase with the DB still pointing there.
 *
 * Usage:
 *   node scripts/migrate-storage-to-r2.mjs --dry-run   # report only, no writes
 *   node scripts/migrate-storage-to-r2.mjs             # migrate
 *   node scripts/migrate-storage-to-r2.mjs --keep      # migrate, don't delete source
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const KEEP = args.includes("--keep");

const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

if (!E.R2_ACCOUNT_ID || !E.R2_ACCESS_KEY_ID || !E.R2_SECRET_ACCESS_KEY || !E.R2_BUCKET) {
  console.error("R2_* credentials are not set in .env.local — nothing to migrate to.");
  process.exit(1);
}
if (!E.R2_PUBLIC_CDN_URL) {
  console.error("R2_PUBLIC_CDN_URL is required so the rewritten URLs are correct.");
  process.exit(1);
}

const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
});

const SUPA = E.NEXT_PUBLIC_SUPABASE_URL;
const SRK = E.SUPABASE_SERVICE_ROLE_KEY;

/** Pull an object out of Supabase Storage using the service-role key. */
async function download(bucket, key) {
  const res = await fetch(`${SUPA}/storage/v1/object/${bucket}/${encodeURI(key)}`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  if (!res.ok) return null;
  return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

async function removeFromSupabase(bucket, key) {
  await fetch(`${SUPA}/storage/v1/object/${bucket}/${encodeURI(key)}`, {
    method: "DELETE",
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
}

async function main() {
  // The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const c = await dbConnect();

  // Anything still recorded as living in a Supabase bucket.
  const { rows } = await c.query(
    `select id, storage_key, bucket, url
       from listing_photos
      where bucket <> $1
      order by created_at`,
    [E.R2_BUCKET],
  );

  console.log(`${rows.length} object(s) to migrate${DRY ? " (dry run — nothing will be written)" : ""}\n`);
  if (!rows.length) { await c.end(); return; }

  let moved = 0, missing = 0, failed = 0;

  for (const r of rows) {
    process.stdout.write(`  ${r.storage_key.slice(0, 52).padEnd(54)}`);
    const obj = await download(r.bucket, r.storage_key);
    if (!obj) { console.log("SOURCE MISSING — skipped"); missing++; continue; }

    if (DRY) { console.log(`would move (${obj.body.length} bytes)`); moved++; continue; }

    try {
      // 1. copy to R2
      await s3.send(new PutObjectCommand({
        Bucket: E.R2_BUCKET, Key: r.storage_key, Body: obj.body, ContentType: obj.contentType,
      }));
      // 2. repoint the DB (only after the copy succeeded)
      await c.query("update listing_photos set bucket=$1, url=$2 where id=$3", [
        E.R2_BUCKET, `${E.R2_PUBLIC_CDN_URL}/${r.storage_key}`, r.id,
      ]);
      // 3. drop the source last, so a crash never loses the only copy
      if (!KEEP) await removeFromSupabase(r.bucket, r.storage_key);
      console.log("moved");
      moved++;
    } catch (e) {
      console.log("FAILED — " + e.message.slice(0, 60));
      failed++;
    }
  }

  // Cover URLs are denormalised onto listings — rebuild them from the photos.
  if (!DRY && moved) {
    await c.query(`
      update listings l
         set cover_url = p.url
        from (select distinct on (listing_id) listing_id, url
                from listing_photos order by listing_id, position) p
       where p.listing_id = l.id and l.cover_url is distinct from p.url
    `);
    console.log("\ncover_url rebuilt on affected listings");
  }

  console.log(`\nmoved=${moved} missing=${missing} failed=${failed}`);
  if (failed) console.log("Re-run to retry the failures — already-moved objects are skipped.");
  await c.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
