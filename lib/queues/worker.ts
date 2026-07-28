import "server-only";
import { Worker, type Job } from "bullmq";
import { bullConnection } from "@/lib/redis";
import { QUEUE_NAMES } from "@/lib/queues";

/**
 * BullMQ workers — run as a SEPARATE process from the web tier (Doc8 §2.2):
 *   npm run worker
 *
 * Module 0 ships stubs that acknowledge jobs and log; each module fills in real
 * logic (image processing, FCM fan-out, matching cascade, Resend email). Workers
 * scale independently of web, absorbing all heavy work off the request path.
 */

const concurrency = {
  [QUEUE_NAMES.image]: 4, // high — scales on upload bursts (Doc8 §3.1)
  [QUEUE_NAMES.notification]: 8, // high priority fan-out
  [QUEUE_NAMES.matching]: 2, // medium
  [QUEUE_NAMES.email]: 2, // medium
} as const;

function log(queue: string, job: Job) {
  // Structured, no PII (Doc9 §19). Detail-only, never surfaced to users.
  console.log(`[worker:${queue}] job ${job.id} (${job.name}) received`, {
    attemptsMade: job.attemptsMade,
  });
}

/**
 * Image optimisation (Doc6 §6, Doc8 §3.1).
 *
 * SECURITY NOTE: this is NOT the validation gate. `commitPhotos` already
 * downloads every committed object and magic-byte validates it before the photo
 * is usable, precisely because a presigned upload bypasses our API and this
 * worker may not be running. What happens here is quality and bandwidth:
 * EXIF-correct rotation, WebP variants, and a smaller stored footprint.
 *
 * Idempotent: a photo already carrying variants is skipped, so a retried job
 * never re-encodes or double-charges storage.
 */
async function imageProcessor(job: Job) {
  log(QUEUE_NAMES.image, job);

  const { photoId, table } = (job.data ?? {}) as { photoId?: string; table?: string };
  if (!photoId) return;
  // Which table the row lives in — projects got their own in migration 0075.
  const photoTable = table === "project_photos" ? "project_photos" : "listing_photos";

  const { createServiceClient } = await import("@/lib/supabase/server");
  const { readObject, putObject, publicUrlFor, BUCKET } = await import("@/lib/storage");
  const { processToVariants, IMAGE_VARIANTS } = await import("@/lib/image-pipeline");

  const db = createServiceClient();
  const { data } = await db
    .from(photoTable)
    .select("id, storage_key, bucket, variants, status")
    .eq("id", photoId)
    .maybeSingle();

  const photo = data as
    | { id: string; storage_key: string; bucket: string | null; variants: unknown; status: string }
    | null;
  if (!photo || !photo.storage_key) return;
  if (photo.variants) return; // already processed — nothing to redo

  const bucket = photo.bucket ?? BUCKET.public;
  const source = await readObject(photo.storage_key, bucket);
  if (!source) return;

  const variants = await processToVariants(source);
  const urls: Record<string, string> = {};

  for (const name of Object.keys(IMAGE_VARIANTS) as (keyof typeof IMAGE_VARIANTS)[]) {
    const key = `${photo.storage_key}.${name}.webp`;
    await putObject(key, variants[name], "image/webp", bucket);
    urls[name] = publicUrlFor(key, bucket);
  }

  await db
    .from(photoTable)
    .update({ variants: urls, status: "ready" })
    .eq("id", photo.id);
}

async function notificationProcessor(job: Job) {
  log(QUEUE_NAMES.notification, job);
  // TODO(notifications module): FCM push + in-app fan-out + batch/dedup + quiet hours.
}

async function matchingProcessor(job: Job) {
  log(QUEUE_NAMES.matching, job);
  // TODO(requirements module): cascade match (exact→adjacent→city, ±20% budget).
}

async function emailProcessor(job: Job) {
  log(QUEUE_NAMES.email, job);
  // TODO(payments module): Resend transactional (invoice, receipts).
}

function start() {
  const workers = [
    new Worker(QUEUE_NAMES.image, imageProcessor, {
      connection: bullConnection,
      concurrency: concurrency[QUEUE_NAMES.image],
    }),
    new Worker(QUEUE_NAMES.notification, notificationProcessor, {
      connection: bullConnection,
      concurrency: concurrency[QUEUE_NAMES.notification],
    }),
    new Worker(QUEUE_NAMES.matching, matchingProcessor, {
      connection: bullConnection,
      concurrency: concurrency[QUEUE_NAMES.matching],
    }),
    new Worker(QUEUE_NAMES.email, emailProcessor, {
      connection: bullConnection,
      concurrency: concurrency[QUEUE_NAMES.email],
    }),
  ];

  for (const w of workers) {
    // Watchdog hook (Doc8 §3.2) — a real deploy alerts admin on failure.
    w.on("failed", (job, err) =>
      console.error(`[worker:${w.name}] job ${job?.id} failed:`, err.message),
    );
    w.on("error", (err) => console.error(`[worker:${w.name}] error:`, err.message));
  }

  console.log("HomzList workers started:", Object.values(QUEUE_NAMES).join(", "));

  const shutdown = async () => {
    console.log("Shutting down workers…");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start();
