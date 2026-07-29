import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { publicUrlFor, deleteObjectOrRecord, readObject, BUCKET } from "@/lib/storage";
import { validateImage } from "@/lib/image-pipeline";

/**
 * Photos for a listing OR a project (Doc2 §5.2, Doc7 §48-49).
 *
 * Caps are enforced server-side: Owner/Broker 10, Builder unlimited. The client
 * grid also stops at the cap, but that's courtesy — this is the control.
 *
 * Processing (WebP variants, EXIF strip, watermark) is a queued job so the API
 * returns instantly (Doc8 §0). When Redis isn't available — the dev default in
 * this repo — the photo is marked ready with its direct URL instead of being
 * left stuck in `processing` forever.
 *
 * ---------------------------------------------------------------------------
 * ONE implementation, two subjects (migration 0075)
 * ---------------------------------------------------------------------------
 * Projects had no gallery at all: one `cover_url`, a detail hero handed
 * `photos={[]}`, and a project form promising a photo screen that did not
 * exist. Rather than a second copy of presign → commit → magic-byte gate →
 * reorder → cover, every function here takes a `Subject` — which table holds
 * the rows, which column points at the parent, and which key prefix an upload
 * is allowed to land under. The security properties (server-minted keys, byte
 * verification before anything is served, ownership-scoped writes) are
 * therefore identical for both by construction, not by remembering to copy
 * them.
 */

const db = () => createServiceClient();

/** Where one kind of photo lives. Not user input — chosen by the route. */
export interface PhotoSubject {
  table: "listing_photos" | "project_photos";
  column: "listing_id" | "project_id";
  parent: "listings" | "projects";
  /** Upload keys must start with `${prefix}/${id}/` — checked at commit. */
  prefix: "listings" | "projects";
}

export const LISTING_PHOTOS: PhotoSubject = {
  table: "listing_photos", column: "listing_id", parent: "listings", prefix: "listings",
};
export const PROJECT_PHOTOS: PhotoSubject = {
  table: "project_photos", column: "project_id", parent: "projects", prefix: "projects",
};

/**
 * Delete every stored object belonging to these subjects (migration 0080).
 *
 * Call this BEFORE the parent rows are deleted — the photo rows cascade with
 * their parent, and once they are gone nothing in the database knows the keys
 * any more. That is exactly what "Delete now" and the 31st-day purge cron were
 * doing: the row vanished, the row's photos vanished, and the files stayed in
 * the bucket forever, unreferenced and unfindable.
 *
 * Every failure is recorded rather than swallowed, so the sweep can retry it.
 * Returns how many objects were removed and how many were queued for retry.
 */
export async function purgeSubjectStorage(
  subjectIds: string[],
  subject: PhotoSubject,
  reason: string,
): Promise<{ deleted: number; queued: number }> {
  if (!subjectIds.length) return { deleted: 0, queued: 0 };

  const { data } = await db()
    .from(subject.table)
    .select("storage_key,bucket")
    .in(subject.column, subjectIds);

  let deleted = 0;
  let queued = 0;
  for (const row of (data ?? []) as { storage_key: string; bucket: string }[]) {
    if (!row.storage_key) continue;
    if (await deleteObjectOrRecord(row.storage_key, row.bucket ?? BUCKET.public, reason)) deleted++;
    else queued++;
  }

  // A project also carries a BROCHURE, in the private bucket. It is a column on
  // the parent rather than a photo row, so the cascade never touched it and a
  // purged project left a private PDF behind with no owner.
  if (subject.parent === "projects") {
    const { data: brochures } = await db()
      .from("projects")
      .select("brochure_key,brochure_bucket")
      .in("id", subjectIds)
      .not("brochure_key", "is", null);
    for (const b of (brochures ?? []) as { brochure_key: string; brochure_bucket: string | null }[]) {
      if (await deleteObjectOrRecord(b.brochure_key, b.brochure_bucket ?? BUCKET.private, reason)) deleted++;
      else queued++;
    }
  }

  return { deleted, queued };
}

const ROLE_CAPS: Record<string, number | null> = {
  owner: 10,
  broker: 10,
  builder: null, // unlimited (+ bulk upload)
};

export async function photoCapacity(profileId: string, subjectId: string, subject: PhotoSubject = LISTING_PHOTOS) {
  const [{ data: profile }, { count }] = await Promise.all([
    db().from("profiles").select("role").eq("id", profileId).single(),
    db().from(subject.table).select("id", { count: "exact", head: true }).eq(subject.column, subjectId),
  ]);
  const role = (profile as { role: string | null } | null)?.role ?? "owner";
  // `ROLE_CAPS[role] ?? 10` looked right and was wrong: a Builder's cap IS
  // null, and `null ?? 10` is 10 — so the one role Doc2 §5.2 gives unlimited
  // photos to was silently held to the same ten as everyone else, both in the
  // "6 / 10" counter and at presign. Ask whether the role is known instead.
  const max = role in ROLE_CAPS ? ROLE_CAPS[role] : 10;
  const used = count ?? 0;
  return { max, used, remaining: max === null ? null : Math.max(0, max - used) };
}

export interface PhotoRow {
  id: string;
  storage_key: string;
  url: string | null;
  alt_text: string | null;
  position: number;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string | null;
}

export async function listPhotos(subjectId: string, subject: PhotoSubject = LISTING_PHOTOS) {
  const { data } = await db()
    .from(subject.table)
    .select("id,storage_key,url,alt_text,position,status,error")
    .eq(subject.column, subjectId)
    .order("position");
  return ((data ?? []) as PhotoRow[]).map((p) => ({
    id: p.id,
    url: p.url,
    altText: p.alt_text,
    position: p.position,
    status: p.status,
    error: p.error,
    isCover: p.position === 0, // first photo IS the cover (Doc2 §5.2)
  }));
}

/** Attach uploaded objects and kick off processing. */
export async function commitPhotos(
  profileId: string,
  subjectId: string,
  keys: string[],
  altTexts: string[],
  subject: PhotoSubject = LISTING_PHOTOS,
) {
  const cap = await photoCapacity(profileId, subjectId, subject);
  const accepted = cap.remaining === null ? keys : keys.slice(0, cap.remaining);
  if (!accepted.length) return { queued: false, added: 0, rejected: [] as string[] };

  const { data: existing } = await db()
    .from(subject.table)
    .select("position")
    .eq(subject.column, subjectId)
    .order("position", { ascending: false })
    .limit(1);
  let next = ((existing ?? [])[0] as { position: number } | undefined)?.position ?? -1;

  const rows = accepted.map((key, i) => ({
    [subject.column]: subjectId,
    profile_id: profileId,
    storage_key: key,
    url: publicUrlFor(key),
    bucket: BUCKET.public,
    alt_text: typeof altTexts[i] === "string" ? altTexts[i].slice(0, 120) : null,
    position: ++next,
    status: "processing" as const,
  }));

  const { data: inserted, error } = await db().from(subject.table).insert(rows).select("id,storage_key,bucket");
  if (error) throw error;
  const insertedRows = (inserted ?? []) as { id: string; storage_key: string; bucket: string }[];

  // MAGIC-BYTE GATE. Uploads go browser → bucket directly, so this is the first
  // moment the server can see the bytes. Anything that isn't really a decodable
  // image is deleted and marked failed HERE — we never wait for the worker,
  // because the object is already publicly reachable the instant it lands
  // (Doc9 §9). A file that claims image/png but carries a script dies here.
  const verified = await verifyUploadedBytes(insertedRows, subject);

  const queued = verified.ok.length
    ? await enqueueProcessing(profileId, subjectId, verified.ok, subject)
    : false;

  await refreshCover(subjectId, subject);
  return { queued, added: verified.ok.length, rejected: verified.bad };
}

/**
 * Download each freshly-committed object and confirm it really decodes as an
 * allowed image. Returns the survivors; rejects are deleted from storage and
 * flagged so the grid can show a per-tile error.
 */
async function verifyUploadedBytes(
  rows: { id: string; storage_key: string; bucket: string }[],
  subject: PhotoSubject,
) {
  const ok: { id: string; storage_key: string }[] = [];
  const bad: string[] = [];

  await Promise.all(
    rows.map(async (r) => {
      let reason = "Could not read the uploaded file";
      try {
        const bytes = await readObject(r.storage_key, r.bucket);
        if (bytes) {
          const check = await validateImage(bytes);
          if (check.ok) {
            ok.push({ id: r.id, storage_key: r.storage_key });
            await db().from(subject.table).update({ width: check.width, height: check.height }).eq("id", r.id);
            return;
          }
          reason = check.reason === "FILE_TOO_LARGE" ? "File is over 25MB" : "That file isn't a valid image";
        }
      } catch {
        /* fall through to rejection */
      }

      bad.push(r.id);
      await db().from(subject.table).update({ status: "failed", error: reason }).eq("id", r.id);
      // Don't leave an unvalidated object sitting in a public bucket. A failed
      // delete is RECORDED for the sweep to retry — this used to point at a
      // "7-day orphan sweep" that had never been written, so the object was
      // simply lost in the bucket (migration 0080).
      await deleteObjectOrRecord(r.storage_key, r.bucket, "rejected upload");
    }),
  );

  return { ok, bad };
}

/**
 * Enqueue the image job (WebP variants, watermark). Validation already happened
 * in `verifyUploadedBytes`, so anything reaching here is a confirmed image —
 * the queue only does optimisation, never security.
 *
 * If the queue is unreachable (no Redis in dev) the photo is marked ready and
 * served as its validated original. That's a quality trade-off, not a safety
 * one: the bytes were checked before this point.
 */
async function enqueueProcessing(
  ownerId: string,
  subjectId: string,
  photos: { id: string; storage_key: string }[],
  subject: PhotoSubject,
): Promise<boolean> {
  if (!photos.length) return false;
  try {
    const { enqueueImage } = await import("@/lib/queues");
    // BullMQ requires `maxRetriesPerRequest: null` on its connection, which
    // means a command issued while Redis is unreachable NEVER rejects — it
    // queues offline and retries forever. Without a deadline the `catch` below
    // is unreachable, the documented "mark ready" fallback never runs, and the
    // request hangs until the client gives up (observed: the dev server stops
    // serving entirely after a few photo commits with Redis down).
    await Promise.race([
      Promise.all(
        photos.map((p, i) =>
          enqueueImage({
            kind: "process",
            sourceKey: p.storage_key,
            ownerId,
            // The worker looks the row up by id and updates THAT table — it was
            // being sent no `photoId` at all, so `imageProcessor` returned on
            // its first line and no photo has ever been given variants.
            photoId: p.id,
            table: subject.table,
            [subject.column === "project_id" ? "projectId" : "listingId"]: subjectId,
            isCover: i === 0,
          }),
        ),
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enqueue timed out")), ENQUEUE_TIMEOUT_MS)),
    ]);
    return true;
  } catch {
    await db().from(subject.table).update({ status: "ready" }).in("id", photos.map((p) => p.id));
    return false;
  }
}

/** How long a photo commit will wait for the image queue before falling back. */
const ENQUEUE_TIMEOUT_MS = 3000;

/** Cover = photo at position 0; kept denormalised on the parent for cards. */
export async function refreshCover(subjectId: string, subject: PhotoSubject = LISTING_PHOTOS) {
  const { data } = await db()
    .from(subject.table)
    .select("url")
    .eq(subject.column, subjectId)
    .order("position")
    .limit(1);
  const cover = ((data ?? [])[0] as { url: string | null } | undefined)?.url ?? null;
  const { count } = await db().from(subject.table).select("id", { count: "exact", head: true }).eq(subject.column, subjectId);
  await db().from(subject.parent).update({ cover_url: cover, photo_count: count ?? 0 }).eq("id", subjectId);
}

/** Reorder; index 0 becomes the cover. Ownership-scoped per row. */
export async function reorderPhotos(
  profileId: string,
  subjectId: string,
  orderedIds: string[],
  subject: PhotoSubject = LISTING_PHOTOS,
) {
  for (let i = 0; i < orderedIds.length; i++) {
    await db()
      .from(subject.table)
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq(subject.column, subjectId)
      .eq("profile_id", profileId);
  }
  await refreshCover(subjectId, subject);
}

/**
 * Set (or clear) a photo's label — the "Add label" action on the tile sheet.
 * Scoped by profile AND parent so a crafted photoId from another listing
 * matches no row rather than being relabelled.
 */
export async function setPhotoLabel(
  profileId: string,
  subjectId: string,
  photoId: string,
  label: string | null,
  subject: PhotoSubject = LISTING_PHOTOS,
) {
  await db()
    .from(subject.table)
    .update({ alt_text: label })
    .eq("id", photoId)
    .eq(subject.column, subjectId)
    .eq("profile_id", profileId);
}

export async function deletePhoto(
  profileId: string,
  subjectId: string,
  photoId: string,
  subject: PhotoSubject = LISTING_PHOTOS,
) {
  const { data } = await db()
    .from(subject.table)
    .delete()
    .eq("id", photoId)
    .eq(subject.column, subjectId)
    .eq("profile_id", profileId)
    .select("storage_key,bucket")
    .maybeSingle();
  if (!data) return false;

  // The row is already gone, so a delete that throws here would lose the key
  // for good. It is recorded for the sweep instead of being swallowed — the
  // "7-day orphan sweep" this comment used to name did not exist (0080).
  const row = data as { storage_key: string; bucket: string };
  await deleteObjectOrRecord(row.storage_key, row.bucket, "photo removed");

  // Close the gap so positions stay contiguous and a cover always exists.
  const remaining = await listPhotos(subjectId, subject);
  await reorderPhotos(profileId, subjectId, remaining.map((p) => p.id), subject);
  return true;
}
