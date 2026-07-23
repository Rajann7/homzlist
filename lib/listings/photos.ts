import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { publicUrlFor, deleteObject, readObject, BUCKET } from "@/lib/storage";
import { validateImage } from "@/lib/image-pipeline";

/**
 * Listing photos (Doc2 §5.2, Doc7 §48-49).
 *
 * Caps are enforced server-side: Owner/Broker 10, Builder unlimited. The client
 * grid also stops at the cap, but that's courtesy — this is the control.
 *
 * Processing (WebP variants, EXIF strip, watermark) is a queued job so the API
 * returns instantly (Doc8 §0). When Redis isn't available — the dev default in
 * this repo — the photo is marked ready with its direct URL instead of being
 * left stuck in `processing` forever.
 */

const db = () => createServiceClient();

const ROLE_CAPS: Record<string, number | null> = {
  owner: 10,
  broker: 10,
  builder: null, // unlimited (+ bulk upload)
};

export async function photoCapacity(profileId: string, listingId: string) {
  const [{ data: profile }, { count }] = await Promise.all([
    db().from("profiles").select("role").eq("id", profileId).single(),
    db().from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", listingId),
  ]);
  const role = (profile as { role: string | null } | null)?.role ?? "owner";
  const max = ROLE_CAPS[role] ?? 10;
  const used = count ?? 0;
  return { max, used, remaining: max === null ? null : Math.max(0, max - used) };
}

export interface PhotoRow {
  id: string;
  listing_id: string;
  storage_key: string;
  url: string | null;
  alt_text: string | null;
  position: number;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string | null;
}

export async function listPhotos(listingId: string) {
  const { data } = await db()
    .from("listing_photos")
    .select("id,storage_key,url,alt_text,position,status,error")
    .eq("listing_id", listingId)
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
export async function commitPhotos(profileId: string, listingId: string, keys: string[], altTexts: string[]) {
  const cap = await photoCapacity(profileId, listingId);
  const accepted = cap.remaining === null ? keys : keys.slice(0, cap.remaining);
  if (!accepted.length) return { queued: false, added: 0, rejected: [] as string[] };

  const { data: existing } = await db()
    .from("listing_photos")
    .select("position")
    .eq("listing_id", listingId)
    .order("position", { ascending: false })
    .limit(1);
  let next = ((existing ?? [])[0] as { position: number } | undefined)?.position ?? -1;

  const rows = accepted.map((key, i) => ({
    listing_id: listingId,
    profile_id: profileId,
    storage_key: key,
    url: publicUrlFor(key),
    bucket: BUCKET.public,
    alt_text: typeof altTexts[i] === "string" ? altTexts[i].slice(0, 120) : null,
    position: ++next,
    status: "processing" as const,
  }));

  const { data: inserted, error } = await db().from("listing_photos").insert(rows).select("id,storage_key,bucket");
  if (error) throw error;
  const insertedRows = (inserted ?? []) as { id: string; storage_key: string; bucket: string }[];

  // MAGIC-BYTE GATE. Uploads go browser → bucket directly, so this is the first
  // moment the server can see the bytes. Anything that isn't really a decodable
  // image is deleted and marked failed HERE — we never wait for the worker,
  // because the object is already publicly reachable the instant it lands
  // (Doc9 §9). A file that claims image/png but carries a script dies here.
  const verified = await verifyUploadedBytes(insertedRows);

  const queued = verified.ok.length
    ? await enqueueProcessing(profileId, listingId, verified.ok.map((r) => r.id), verified.ok.map((r) => r.storage_key))
    : false;

  await refreshCover(listingId);
  return { queued, added: verified.ok.length, rejected: verified.bad };
}

/**
 * Download each freshly-committed object and confirm it really decodes as an
 * allowed image. Returns the survivors; rejects are deleted from storage and
 * flagged so the grid can show a per-tile error.
 */
async function verifyUploadedBytes(rows: { id: string; storage_key: string; bucket: string }[]) {
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
            await db().from("listing_photos").update({ width: check.width, height: check.height }).eq("id", r.id);
            return;
          }
          reason = check.reason === "FILE_TOO_LARGE" ? "File is over 25MB" : "That file isn't a valid image";
        }
      } catch {
        /* fall through to rejection */
      }

      bad.push(r.id);
      await db().from("listing_photos").update({ status: "failed", error: reason }).eq("id", r.id);
      // Don't leave an unvalidated object sitting in a public bucket.
      try {
        await deleteObject(r.storage_key, r.bucket);
      } catch {
        /* the 7-day orphan sweep will catch it */
      }
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
  listingId: string,
  photoIds: string[],
  keys: string[],
): Promise<boolean> {
  if (!photoIds.length) return false;
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
        keys.map((sourceKey, i) =>
          enqueueImage({ kind: "process", sourceKey, ownerId, listingId, isCover: i === 0 }),
        ),
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enqueue timed out")), ENQUEUE_TIMEOUT_MS)),
    ]);
    return true;
  } catch {
    await db().from("listing_photos").update({ status: "ready" }).in("id", photoIds);
    return false;
  }
}

/** How long a photo commit will wait for the image queue before falling back. */
const ENQUEUE_TIMEOUT_MS = 3000;

/** Cover = photo at position 0; kept denormalised on the listing for cards. */
export async function refreshCover(listingId: string) {
  const { data } = await db()
    .from("listing_photos")
    .select("url")
    .eq("listing_id", listingId)
    .order("position")
    .limit(1);
  const cover = ((data ?? [])[0] as { url: string | null } | undefined)?.url ?? null;
  const { count } = await db().from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
  await db().from("listings").update({ cover_url: cover, photo_count: count ?? 0 }).eq("id", listingId);
}

/** Reorder; index 0 becomes the cover. Ownership-scoped per row. */
export async function reorderPhotos(profileId: string, listingId: string, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await db()
      .from("listing_photos")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("listing_id", listingId)
      .eq("profile_id", profileId);
  }
  await refreshCover(listingId);
}

/**
 * Set (or clear) a photo's label — the "Add label" action on the tile sheet.
 * Scoped by profile AND listing so a crafted photoId from another listing
 * matches no row rather than being relabelled.
 */
export async function setPhotoLabel(profileId: string, listingId: string, photoId: string, label: string | null) {
  await db()
    .from("listing_photos")
    .update({ alt_text: label })
    .eq("id", photoId)
    .eq("listing_id", listingId)
    .eq("profile_id", profileId);
}

export async function deletePhoto(profileId: string, listingId: string, photoId: string) {
  const { data } = await db()
    .from("listing_photos")
    .delete()
    .eq("id", photoId)
    .eq("listing_id", listingId)
    .eq("profile_id", profileId)
    .select("storage_key,bucket")
    .maybeSingle();
  if (!data) return false;

  // Best-effort object cleanup; the 7-day orphan sweep catches any miss.
  try {
    const row = data as { storage_key: string; bucket: string };
    await deleteObject(row.storage_key, row.bucket);
  } catch {
    /* orphan cleanup will handle it */
  }

  // Close the gap so positions stay contiguous and a cover always exists.
  const remaining = await listPhotos(listingId);
  await reorderPhotos(profileId, listingId, remaining.map((p) => p.id));
  return true;
}
