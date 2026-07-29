import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { stopBoostsForSubject, pauseBoostsForSubject } from "@/lib/billing/boost";
import { notify } from "@/lib/notifications/service";
import { deleteObject } from "@/lib/storage";
import { purgeSubjectStorage, LISTING_PHOTOS, PROJECT_PHOTOS } from "./photos";

/**
 * Listing lifecycle crons (Doc2 §5.4, Doc7 §21 items 1-4, 18).
 *
 * The chain, all at 2AM IST:
 *   live 2 months        → ask "Still available?" (inline Yes/No)
 *   no answer for 15d    → auto-hide
 *   hidden for 1 month   → soft-delete
 *   deleted for 30d      → purge
 *   projects             → same, on a 1-year cycle
 *
 * Every step is idempotent, so a double-run or a retry after a crash can't skip
 * or double-apply a stage. Each returns counts so the job can be watchdogged.
 */

const db = () => createServiceClient();
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

export interface LifecycleReport {
  asked: number;
  hidden: number;
  softDeleted: number;
  purged: number;
  projectsExpired: number;
  draftsExpired: number;
  /** Storage objects whose delete had failed and has now succeeded (0080). */
  storageCleared: number;
}

/** Step 1 — 2-month "Still available?" prompt (Doc2 §5.4). */
async function askStillAvailable(): Promise<number> {
  const { data } = await db()
    .from("listings")
    .update({ still_available_asked_at: new Date().toISOString() })
    .eq("status", "live")
    .eq("availability", "available")
    .lt("live_at", ago(60))
    .is("still_available_asked_at", null)
    .select("id,profile_id,title,area_label,cover_url");

  const rows = (data ?? []) as { id: string; profile_id: string; title: string; area_label: string; cover_url: string | null }[];
  // The ASK is the notification — designs/P11 S7 carries it with inline
  // Yes / "No, it's sold". Setting the flag without telling anyone was a
  // 15-day countdown to auto-hide that the owner never saw start.
  for (const l of rows) {
    const name = [l.title, l.area_label].filter(Boolean).join(", ") || "your listing";
    await notify({
      profileId: l.profile_id,
      type: "still_available",
      title: `Is **${name}** still available? Listings are checked every 2 months.`,
      body: "Answer to keep it live — no answer hides it in 15 days.",
      thumbUrl: l.cover_url,
      entityKind: "listing", entityId: l.id,
      data: { listingId: l.id },
    });
  }
  return rows.length;
}

/** Step 2 — no answer within 15 days → auto-hide. */
async function autoHide(): Promise<number> {
  const { data } = await db()
    .from("listings")
    .update({ status: "hidden", hidden_at: new Date().toISOString() })
    .eq("status", "live")
    .lt("still_available_asked_at", ago(15))
    .select("id");
  const rows = (data ?? []) as { id: string }[];
  // A hidden listing is placed nowhere, so its boost must not keep burning days
  // in the background. Pausing (not stopping) means the days come back if the
  // owner answers and it goes live again.
  for (const r of rows) await pauseBoostsForSubject(r.id, "Listing hidden — boost paused");
  return rows.length;
}

/** Step 3 — hidden for a month → soft-delete (recoverable from trash). */
async function autoSoftDelete(): Promise<number> {
  const { data } = await db()
    .from("listings")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("status", "hidden")
    .lt("hidden_at", ago(30))
    .select("id");
  const rows = (data ?? []) as { id: string }[];
  // Past the point of coming back — a paused boost here would sit forever, so
  // it ends (and one still awaiting approval is refunded).
  for (const r of rows) await stopBoostsForSubject(r.id, "Listing deleted · boost stopped");
  return rows.length;
}

/**
 * Step 4 — purge trash after 30 days. The listing row goes; the SLOT stays
 * consumed, because deleting a listing never refunds its slot (Doc2 §5.4).
 */
async function purgeTrash(): Promise<number> {
  // Find them first: the photo rows cascade with the listing, so the object
  // keys have to be read and the files removed BEFORE the row goes, or the
  // images stay in the bucket with nothing left that knows they exist
  // (migration 0080).
  const { data: doomed } = await db()
    .from("listings")
    .select("id")
    .eq("status", "deleted")
    .lt("deleted_at", ago(30));
  const ids = ((doomed ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return 0;

  await purgeSubjectStorage(ids, LISTING_PHOTOS, "listing trash purged by cron");

  const { data } = await db().from("listings").delete().in("id", ids).eq("status", "deleted").select("id");
  return (data ?? []).length;
}

/**
 * The same 31st-day sweep over PROJECTS (migration 0079).
 *
 * A project could not be deleted at all before that migration, so this had
 * nothing to do; now that trash accepts projects, the cron has to empty it or
 * the 30-day promise on the trash screen is a promise with no job behind it.
 */
async function purgeProjectTrash(): Promise<number> {
  const { data: doomed } = await db()
    .from("projects")
    .select("id")
    .eq("status", "deleted")
    .lt("deleted_at", ago(30));
  const ids = ((doomed ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return 0;

  await purgeSubjectStorage(ids, PROJECT_PHOTOS, "project trash purged by cron");

  const { data } = await db().from("projects").delete().in("id", ids).eq("status", "deleted").select("id");
  return (data ?? []).length;
}

/**
 * Retry the deletes that failed (migration 0080).
 *
 * `storage_orphans` only ever holds keys the app itself asked to delete and
 * could not — it is never populated by scanning the bucket, so this can only
 * remove objects somebody already meant to lose. A key that keeps failing is
 * given up on after 10 tries and left in the table as the record of a leak,
 * rather than being retried forever every night.
 */
const ORPHAN_MAX_ATTEMPTS = 10;

async function sweepStorageOrphans(): Promise<number> {
  const { data } = await db()
    .from("storage_orphans")
    .select("id,storage_key,bucket,attempts")
    .lt("attempts", ORPHAN_MAX_ATTEMPTS)
    .order("created_at")
    .limit(500);

  let cleared = 0;
  for (const row of (data ?? []) as { id: string; storage_key: string; bucket: string; attempts: number }[]) {
    try {
      await deleteObject(row.storage_key, row.bucket);
      await db().from("storage_orphans").delete().eq("id", row.id);
      cleared++;
    } catch (e) {
      await db()
        .from("storage_orphans")
        .update({
          attempts: row.attempts + 1,
          last_error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return cleared;
}

/** Projects run the same cycle on a 1-year clock (Doc2 §6). */
async function expireProjects(): Promise<number> {
  const { data } = await db()
    .from("projects")
    .update({ status: "archived" })
    .eq("status", "live")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  const rows = (data ?? []) as { id: string }[];
  // A project boost (Doc2 §13) can outlive its project's 1-year window; the
  // archive ends it, and one not yet approved is refunded.
  for (const r of rows) await stopBoostsForSubject(r.id, "Project archived · boost stopped");
  return rows.length;
}

/** Drafts expire at 90 days (Doc2 §5.3). */
async function expireDrafts(): Promise<number> {
  const { data } = await db().from("listing_drafts").delete().lt("expires_at", new Date().toISOString()).select("id");
  return (data ?? []).length;
}

/** Run the whole chain in order. Safe to re-run. */
export async function runListingLifecycle(): Promise<LifecycleReport> {
  return {
    asked: await askStillAvailable(),
    hidden: await autoHide(),
    softDeleted: await autoSoftDelete(),
    purged: (await purgeTrash()) + (await purgeProjectTrash()),
    projectsExpired: await expireProjects(),
    draftsExpired: await expireDrafts(),
    // Last, so it also picks up anything the two purges above just failed to
    // delete rather than making it wait a day.
    storageCleared: await sweepStorageOrphans(),
  };
}

/**
 * The owner's answer to the 2-month prompt (Doc7 §57).
 * "Yes" resets the clock; "No" marks it sold and archives it.
 */
export async function answerStillAvailable(listingId: string, profileId: string, stillAvailable: boolean) {
  const patch = stillAvailable
    ? { still_available_asked_at: null, live_at: new Date().toISOString() }
    : { availability: "sold" as const, status: "archived" as const, archived_at: new Date().toISOString(), sold_at: new Date().toISOString() };

  const { data } = await db().from("listings").update(patch).eq("id", listingId).eq("profile_id", profileId).select("id").maybeSingle();
  if (!data) return false;

  if (!stillAvailable) {
    // Shared path (lib/billing/boost.ts): a RUNNING boost stops with no refund,
    // but one still waiting for approval is cancelled + REFUNDED — it never got
    // a minute of placement. This used to mark both `stopped`, silently keeping
    // the money for a boost that never ran.
    await stopBoostsForSubject(listingId, "Listing marked as sold · boost stopped automatically");
  }
  return true;
}
