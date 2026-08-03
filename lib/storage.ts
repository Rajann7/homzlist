import "server-only";
import { serverEnv, publicEnv } from "@/lib/env";
import { generateImageKey } from "@/lib/image-pipeline";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Object storage — Doc8 §4, Doc9 §9.
 *
 * Three drivers, picked automatically by which credentials exist. Callers never
 * choose; they just ask for an upload grant and get one:
 *
 *   r2       — Cloudflare R2 presigned PUT. The eventual production target.
 *   supabase — Supabase Storage signed upload URL. The CURRENT store, so media
 *              lives off the dev machine and survives deploys while we wait on
 *              R2 credentials.
 *   local    — dev-only disk sink. Only when neither of the above is set up.
 *
 * Switching to R2 later is a config change plus an object migration; no call
 * site changes (see docs/PENDING-INTEGRATIONS.md).
 *
 * Security properties held by ALL drivers:
 *   - storage keys are SERVER-generated random values, never derived from the
 *     user's filename (path-traversal-proof),
 *   - the browser is authorised for exactly ONE server-chosen key per grant —
 *     it never gets a broad write token,
 *   - private objects are never publicly readable; they're served only through
 *     short-lived signed GETs.
 */

export type StorageDriver = "r2" | "supabase" | "local";

/** Public bucket for listing imagery; private bucket for proofs/brochures. */
export const BUCKET = {
  public: "listing-photos",
  private: "private-docs",
  /** Admin exports (0092). Private, and kept separate from `private-docs` so
   *  accepting spreadsheets here never loosens the mime guard on the bucket
   *  holding user-uploaded ownership proofs and ID scans. */
  adminExports: "admin-exports",
  /** A user's own DPDP data export (0113). Private, and separate from
   *  `admin-exports` so a user download path can never be pointed at an
   *  operator's export of everybody. */
  userExports: "user-exports",
} as const;

export function storageDriver(): StorageDriver {
  const { r2 } = serverEnv();
  if (r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucket) return "r2";
  if (publicEnv.supabaseUrl && serverEnv().supabaseServiceRoleKey) return "supabase";
  return "local";
}

function r2Client() {
  const { r2 } = serverEnv();
  // Lazy require keeps the AWS SDK out of any accidental client bundle path.
  const { S3Client } = require("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
  });
}

export interface UploadGrant {
  /** Where the browser PUTs the bytes. */
  url: string;
  /** Opaque server-generated key to send back on commit. */
  key: string;
  /** Headers the client MUST send so the grant is accepted. */
  headers: Record<string, string>;
  driver: StorageDriver;
  /** Public URL once the object exists (null for private objects). */
  publicUrl: string | null;
  /** Which bucket the key lives in — needed to resolve/delete it later. */
  bucket: string;
}

/**
 * Mint a short-lived, single-object upload grant. `contentType` is pinned so a
 * client that promised an image cannot then upload something else.
 */
export async function createUploadGrant(args: {
  prefix: string;
  contentType: string;
  isPrivate?: boolean;
  expiresInSec?: number;
}): Promise<UploadGrant> {
  const key = generateImageKey(args.prefix);
  const driver = storageDriver();
  const bucket = args.isPrivate ? BUCKET.private : BUCKET.public;

  if (driver === "supabase") {
    const db = createServiceClient();
    const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`storage: could not sign upload (${error?.message ?? "unknown"})`);
    return {
      // Supabase returns a fully-signed URL; the token is embedded in it.
      url: data.signedUrl.startsWith("http") ? data.signedUrl : `${publicEnv.supabaseUrl}${data.signedUrl}`,
      key,
      headers: { "Content-Type": args.contentType, "x-upsert": "false" },
      driver,
      publicUrl: args.isPrivate ? null : publicUrlFor(key, bucket),
      bucket,
    };
  }

  if (driver === "local") {
    if (process.env.NODE_ENV === "production") throw new Error("No object storage is configured");
    return {
      url: `/api/v1/uploads/local?key=${encodeURIComponent(key)}`,
      key,
      headers: { "Content-Type": args.contentType },
      driver,
      publicUrl: args.isPrivate ? null : `/uploads/${key}`,
      bucket,
    };
  }

  // ---- r2 ----
  const { r2 } = serverEnv();
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const url = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: args.contentType }),
    { expiresIn: args.expiresInSec ?? 300 },
  );
  return {
    url,
    key,
    headers: { "Content-Type": args.contentType },
    driver,
    publicUrl: args.isPrivate ? null : `${r2.publicCdnUrl}/${key}`,
    bucket: r2.bucket,
  };
}

/** Short-lived signed GET for a PRIVATE object (ownership proof, brochure). */
export async function signedReadUrl(key: string, expiresInSec = 120): Promise<string | null> {
  const driver = storageDriver();

  if (driver === "supabase") {
    const db = createServiceClient();
    const { data } = await db.storage.from(BUCKET.private).createSignedUrl(key, expiresInSec);
    return data?.signedUrl ?? null;
  }
  if (driver === "local") return `/uploads/${key}`;

  const { r2 } = serverEnv();
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: r2.bucket, Key: key }), { expiresIn: expiresInSec });
}

/** Public URL for an already-uploaded object in the public bucket. */
export function publicUrlFor(key: string, bucket: string = BUCKET.public): string {
  const driver = storageDriver();
  if (driver === "supabase") return `${publicEnv.supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
  if (driver === "local") return `/uploads/${key}`;
  return `${serverEnv().r2.publicCdnUrl}/${key}`;
}

/**
 * Reverse of `publicUrlFor` for the public prefixes we mint. Lets a caller that
 * only has a stored profile URL delete the object it points at (avatar/logo
 * replacement). Returns null for anything that isn't one of our own keys.
 */
export function keyFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:^|\/)((?:avatars|logos|chat)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)(?:[?#]|$)/.exec(url);
  return m ? m[1] : null;
}

export async function deleteObject(key: string, bucket: string = BUCKET.public): Promise<void> {
  const driver = storageDriver();

  if (driver === "supabase") {
    const db = createServiceClient();
    await db.storage.from(bucket).remove([key]);
    return;
  }
  if (driver === "local") return;

  const { r2 } = serverEnv();
  const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
  await r2Client().send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
}

/**
 * Delete an object, and if that fails, WRITE THE KEY DOWN (migration 0080).
 *
 * `deleteObject` throwing used to mean the key was gone from the database and
 * the object was still in the bucket, with nothing left that knew about it —
 * two comments in lib/listings/photos.ts pointed at a "7-day orphan sweep"
 * that was never built. `storage_orphans` is that sweep's queue, and
 * `lifecycle.sweepStorageOrphans` drains it.
 *
 * Use this wherever the row that holds the key is about to disappear. Never
 * throws: losing an object is a cost, but failing a user's delete because the
 * bucket was briefly unreachable is worse.
 */
export async function deleteObjectOrRecord(key: string, bucket: string, reason: string): Promise<boolean> {
  try {
    await deleteObject(key, bucket);
    return true;
  } catch (e) {
    try {
      await createServiceClient()
        .from("storage_orphans")
        .upsert(
          {
            storage_key: key,
            bucket,
            reason: reason.slice(0, 200),
            last_error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "storage_key,bucket" },
        );
    } catch {
      // If we cannot even record it, there is nothing further to try here —
      // and the caller's delete must still succeed.
    }
    return false;
  }
}

/** Fetch an object's bytes server-side (used by the image worker + migration). */
export async function readObject(key: string, bucket: string = BUCKET.public): Promise<Buffer | null> {
  const driver = storageDriver();

  if (driver === "supabase") {
    const db = createServiceClient();
    const { data, error } = await db.storage.from(bucket).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  if (driver === "local") {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    try {
      return await readFile(path.join(process.cwd(), "public", "uploads", key));
    } catch {
      return null;
    }
  }

  const { r2 } = serverEnv();
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const res = await r2Client().send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
  const chunks: Buffer[] = [];
  for await (const c of res.Body as AsyncIterable<Buffer>) chunks.push(c);
  return Buffer.concat(chunks);
}

/** Upload bytes from the server (migration, worker-generated variants). */
export async function putObject(key: string, body: Buffer, contentType: string, bucket: string = BUCKET.public): Promise<void> {
  const driver = storageDriver();

  if (driver === "supabase") {
    const db = createServiceClient();
    const { error } = await db.storage.from(bucket).upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    return;
  }
  if (driver === "local") {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const dest = path.join(process.cwd(), "public", "uploads", key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
    return;
  }

  const { r2 } = serverEnv();
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  await r2Client().send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: body, ContentType: contentType }));
}
