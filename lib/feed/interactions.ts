import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { ensureInquiryThread } from "@/lib/chat/service";

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
  const { data: live } = await db().from("listings").select("id,profile_id").eq("id", listingId).eq("status", "live").maybeSingle();
  if (!live) return { saved: false };
  await db().from("saves").insert({ profile_id: profileId, listing_id: listingId });
  return { saved: true };
}

export type InquiryResult =
  | { ok: true; alreadySent: boolean }
  | { ok: false; reason: "self" | "not_found" };

const INTENTS = new Set(["site_visit", "negotiable", "documents", "loan"]);

/**
 * Send an inquiry (Doc2 §10.1). Self-inquiry is blocked; one inquiry per
 * (buyer, listing) — a re-inquiry updates the same row (thread revival). This is
 * the seed a chat thread will grow from in Module 7.
 */
export async function sendInquiry(
  buyerId: string,
  listingId: string,
  input: { message: string; intents?: string[]; shareNumber?: boolean },
): Promise<InquiryResult> {
  const { data: l } = await db().from("listings").select("id,profile_id,status").eq("id", listingId).maybeSingle();
  const listing = l as { id: string; profile_id: string; status: string } | null;
  if (!listing || listing.status !== "live") return { ok: false, reason: "not_found" };
  if (listing.profile_id === buyerId) return { ok: false, reason: "self" };

  const intents = (input.intents ?? []).filter((i) => INTENTS.has(i)).slice(0, 4);
  const message = (input.message ?? "").trim().slice(0, 2000) || "Hi, is this still available?";

  const { data: existing } = await db().from("inquiries").select("id").eq("profile_id", buyerId).eq("listing_id", listingId).maybeSingle();
  if (existing) {
    const id = (existing as { id: string }).id;
    await db().from("inquiries").update({ message, intents, share_number: input.shareNumber ?? true }).eq("id", id);
    // Revive/refresh the chat thread grown from this inquiry (Doc2 §10.1).
    await ensureInquiryThread({ id, profile_id: buyerId, listing_id: listingId, poster_id: listing.profile_id, message, intents });
    return { ok: true, alreadySent: true };
  }
  const { data: created } = await db().from("inquiries").insert({
    profile_id: buyerId, listing_id: listingId, poster_id: listing.profile_id,
    message, intents, share_number: input.shareNumber ?? true,
  }).select("id").single();
  // Module 7: the inquiry IS a chat request — grow the pending thread now.
  await ensureInquiryThread({ id: (created as { id: string }).id, profile_id: buyerId, listing_id: listingId, poster_id: listing.profile_id, message, intents });
  return { ok: true, alreadySent: false };
}

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
  // Messages badge (Module 7) = pending requests awaiting me + accepted threads
  // with unread. Real counts, server-computed — never a fabricated number.
  const { unreadTotal, requestsSummary } = await import("@/lib/chat/service");
  const { unreadCount } = await import("@/lib/notifications/inbox");
  const [unread, requests, notifications] = await Promise.all([
    unreadTotal(profileId),
    requestsSummary(profileId),
    // Module 10 owns the notifications table now, so the bell badge is a real
    // unread count instead of the `null` placeholder it shipped with.
    unreadCount(profileId),
  ]);
  return { messages: unread + requests.total, notifications };
}

/** Down-rank a type or an area for this user (Doc7 §82). */
export async function notInterested(profileId: string, target: { typeCode?: string | null; areaId?: string | null }): Promise<{ ok: boolean }> {
  if (!target.typeCode && !target.areaId) return { ok: false };
  const { error } = await db().from("feed_not_interested").insert({
    profile_id: profileId, type_code: target.typeCode ?? null, area_id: target.areaId ?? null,
  });
  return { ok: !error };
}
