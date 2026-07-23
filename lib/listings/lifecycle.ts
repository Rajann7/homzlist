import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

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
    .select("id");
  // The notification fan-out is the notifications module's job; it reads the
  // same flag, so marking here is safe to run before that lands.
  return (data ?? []).length;
}

/** Step 2 — no answer within 15 days → auto-hide. */
async function autoHide(): Promise<number> {
  const { data } = await db()
    .from("listings")
    .update({ status: "hidden", hidden_at: new Date().toISOString() })
    .eq("status", "live")
    .lt("still_available_asked_at", ago(15))
    .select("id");
  return (data ?? []).length;
}

/** Step 3 — hidden for a month → soft-delete (recoverable from trash). */
async function autoSoftDelete(): Promise<number> {
  const { data } = await db()
    .from("listings")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("status", "hidden")
    .lt("hidden_at", ago(30))
    .select("id");
  return (data ?? []).length;
}

/**
 * Step 4 — purge trash after 30 days. The listing row goes; the SLOT stays
 * consumed, because deleting a listing never refunds its slot (Doc2 §5.4).
 */
async function purgeTrash(): Promise<number> {
  const { data } = await db().from("listings").delete().eq("status", "deleted").lt("deleted_at", ago(30)).select("id");
  return (data ?? []).length;
}

/** Projects run the same cycle on a 1-year clock (Doc2 §6). */
async function expireProjects(): Promise<number> {
  const { data } = await db()
    .from("projects")
    .update({ status: "archived" })
    .eq("status", "live")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return (data ?? []).length;
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
    purged: await purgeTrash(),
    projectsExpired: await expireProjects(),
    draftsExpired: await expireDrafts(),
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
    await db()
      .from("boosts")
      .update({ status: "stopped", stopped_reason: "Listing marked as sold · boost stopped automatically" })
      .eq("listing_id", listingId)
      .in("status", ["active", "pending_approval"]);
  }
  return true;
}
