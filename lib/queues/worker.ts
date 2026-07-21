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

async function imageProcessor(job: Job) {
  log(QUEUE_NAMES.image, job);
  // TODO(storage module): validateImage → processToVariants → upload R2 →
  // watermark → CDN URLs → mark photo ready / per-tile retry on failure.
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
