import "server-only";
import { Queue, type JobsOptions } from "bullmq";
import { bullConnection } from "@/lib/redis";

/**
 * BullMQ queues (Doc8 §3). Every heavy/slow operation is enqueued and the API
 * returns instantly — "never let one slow thing block everything" (Doc8 §0).
 *
 * Module 0 wires the queue definitions + typed enqueue helpers. Workers are
 * stubbed in `worker.ts`; each module fills in real job logic later.
 */

export const QUEUE_NAMES = {
  image: "image", // compress→WebP, 4 variants, EXIF strip, watermark
  notification: "notification", // FCM push, in-app fan-out, batching/dedup
  matching: "matching", // cascade match on approve/edit, builder notify
  email: "email", // Resend transactional (invoices, receipts)
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Reliability defaults (Doc8 §3.2): retry with exponential backoff, keep history bounded.
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 }, // failed jobs inspectable → dead-letter review
};

// Singletons (avoid duplicate queues under hot-reload).
declare global {
  var __homzlistQueues: Record<string, Queue> | undefined;
}

function getQueue(name: QueueName): Queue {
  globalThis.__homzlistQueues ??= {};
  globalThis.__homzlistQueues[name] ??= new Queue(name, {
    connection: bullConnection,
    defaultJobOptions,
  });
  return globalThis.__homzlistQueues[name];
}

export const imageQueue = () => getQueue(QUEUE_NAMES.image);
export const notificationQueue = () => getQueue(QUEUE_NAMES.notification);
export const matchingQueue = () => getQueue(QUEUE_NAMES.matching);
export const emailQueue = () => getQueue(QUEUE_NAMES.email);

// ---- Typed job payloads (extended per module) -----------------------------

export interface ImageJob {
  kind: "process";
  sourceKey: string; // R2 key of the uploaded original
  ownerId: string;
  listingId?: string;
  projectId?: string;
  /** The row to write the variants back to — the worker had no way to find it. */
  photoId?: string;
  /** Which table that row is in (migration 0075 added project_photos). */
  table?: "listing_photos" | "project_photos";
  isCover?: boolean;
}

export interface NotificationJob {
  kind: "push" | "in-app" | "email-digest";
  recipientId: string;
  type: string; // one of the 23 notification types (Doc7 §9)
  payload: Record<string, unknown>; // IDs only — never PII (Doc9 §26)
}

export interface MatchingJob {
  kind: "requirement" | "listing";
  entityId: string;
}

export interface EmailJob {
  template: string;
  to: string;
  vars: Record<string, unknown>;
}

/** Enqueue helpers — return instantly; workers do the work (Doc8 §3). */
export const enqueueImage = (data: ImageJob, opts?: JobsOptions) =>
  imageQueue().add("image", data, opts);
export const enqueueNotification = (data: NotificationJob, opts?: JobsOptions) =>
  notificationQueue().add("notification", data, { priority: 1, ...opts });
export const enqueueMatching = (data: MatchingJob, opts?: JobsOptions) =>
  matchingQueue().add("matching", data, opts);
export const enqueueEmail = (data: EmailJob, opts?: JobsOptions) =>
  emailQueue().add("email", data, opts);
