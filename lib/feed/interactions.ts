import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Feed interactions (Doc2 §9-11) — Save, Inquiry, Report, Not-interested. Each
 * persists to a real table (0026); the feed never fakes a toast. Ownership and
 * self-action rules are enforced HERE, not in the browser.
 */

const db = () => createServiceClient();

/** Toggle the wishlist heart. Returns the new saved state. */
export async function toggleSave(profileId: string, listingId: string): Promise<{ saved: boolean }> {
  const { data: existing } = await db().from("saves").select("id").eq("profile_id", profileId).eq("listing_id", listingId).maybeSingle();
  if (existing) {
    await db().from("saves").delete().eq("id", (existing as { id: string }).id);
    return { saved: false };
  }
  // The listing must be a real live listing — never save an arbitrary id.
  const { data: live } = await db().from("listings").select("id,profile_id,price_paise").eq("id", listingId).eq("status", "live").maybeSingle();
  if (!live) return { saved: false };
  // You cannot save your own listing. The owner already has it on their profile
  // and in My Listings, and a self-save would inflate the Saves metric the
  // owner reads on P9 S5 with their own tap. `profile_id` was already being
  // selected here and simply never compared — the UI hides the control, this is
  // the wall behind it.
  if ((live as { profile_id: string }).profile_id === profileId) return { saved: false };
  // Snapshot the price at save time so the P10 Saved screen can tell a real drop
  // from the price simply being what it always was (migration 0053).
  await db().from("saves").insert({
    profile_id: profileId,
    listing_id: listingId,
    saved_price_paise: (live as { price_paise: number | null }).price_paise,
  });
  return { saved: true };
}

/**
 * Inquiries moved out of this module when chat was removed.
 *
 * A connection is no longer "a message that grows a thread": it is a structured
 * intent (what / how / when) that becomes a lead. That lives in
 * `lib/inquiry/service.ts` — this file keeps only the feed-card interactions
 * (save, report, badges, not-interested).
 */

const REPORT_REASONS = new Set(["fake", "sold", "wrong_price", "wrong_photos", "abusive", "duplicate"]);

/**
 * Report a listing/project/requirement (Doc2 §15). One open report per reporter
 * per subject (the unique index makes a re-report a no-op). Feeds the P11 queue.
 */
export async function report(
  reporterId: string,
  subjectType: "listing" | "project" | "requirement",
  subjectId: string,
  reason: string,
  note: string | null,
): Promise<{ ok: boolean }> {
  if (!REPORT_REASONS.has(reason)) return { ok: false };
  // The subject must exist and not be the reporter's own (can't report yourself).
  const table = subjectType === "listing" ? "listings" : subjectType === "project" ? "projects" : "requirements";
  const { data: subj } = await db().from(table).select("id,profile_id").eq("id", subjectId).maybeSingle();
  if (!subj || (subj as { profile_id: string }).profile_id === reporterId) return { ok: false };

  const { error } = await db().from("reports").insert({
    reporter_id: reporterId, subject_type: subjectType, subject_id: subjectId, reason, note: note?.slice(0, 1000) || null,
  });
  // Unique violation = already reported → still a success from the user's view.
  if (error && (error as { code?: string }).code !== "23505") return { ok: false };
  return { ok: true };
}

/**
 * Header badge counts (P2 header: bell + message icons).
 *
 * `messages` is REAL: inquiries sent to me that I haven't acted on yet
 * (`status='sent'`) — the same set P7's "Requests" tab will own. Module 6 built
 * the `inquiries` table, so this count exists today and is not a placeholder.
 *
 * `notifications` is deliberately NULL, not 0: the notifications table is
 * Module 10 and does not exist, so there is no number to report. NULL means
 * "no source yet" and the header renders no badge — a hardcoded 0 or a made-up
 * "3" would both be DB-lock violations (CLAUDE.md rule 12).
 */
export async function headerBadges(profileId: string): Promise<{ messages: number; notifications: number | null }> {
  // The fourth nav slot is Leads now, so its badge counts leads nobody has
  // opened yet — unseen, which is a per-viewer fact, NOT the pipeline stage
  // (a lead the owner read and left on "New" is not unread).
  const { countUnseenLeads } = await import("@/lib/leads/service");
  const { unreadCount } = await import("@/lib/notifications/inbox");
  const [leads, notifications] = await Promise.all([
    countUnseenLeads(profileId),
    // Module 10 owns the notifications table now, so the bell badge is a real
    // unread count instead of the `null` placeholder it shipped with.
    unreadCount(profileId),
  ]);
  // The key stays `messages` so every existing caller keeps working; what it
  // counts is what changed.
  return { messages: leads, notifications };
}

/** Down-rank a type or an area for this user (Doc7 §82). */
export async function notInterested(profileId: string, target: { typeCode?: string | null; areaId?: string | null }): Promise<{ ok: boolean }> {
  if (!target.typeCode && !target.areaId) return { ok: false };
  const { error } = await db().from("feed_not_interested").insert({
    profile_id: profileId, type_code: target.typeCode ?? null, area_id: target.areaId ?? null,
  });
  return { ok: !error };
}
