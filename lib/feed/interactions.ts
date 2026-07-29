import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { ensureInquiryThread, ensureProjectInquiryThread } from "@/lib/chat/service";

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

export type InquiryResult =
  | { ok: true; alreadySent: boolean; threadId?: string }
  | { ok: false; reason: "self" | "not_found" | "blocked" }
  | { ok: false; reason: "cooldown"; until: string };

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

  // DECLINE COOLDOWN (Doc2 §10.1). A declined thread parks a `cooldown_until` on
  // itself, and the sender's DeclinedCard promises "you can send a new one after
  // <date>". Nothing used to READ that column: a declined thread was revived on
  // the very next send, so the cooldown was decorative and the poster's decline
  // bought them nothing. The wall lives here, before any row is written.
  const { data: prior } = await db()
    .from("chat_threads")
    .select("status,cooldown_until")
    .eq("kind", "inquiry")
    .eq("buyer_id", buyerId)
    .eq("listing_id", listingId)
    .maybeSingle();
  const declined = prior as { status: string; cooldown_until: string | null } | null;
  if (declined?.status === "declined" && declined.cooldown_until && new Date(declined.cooldown_until) > new Date()) {
    return { ok: false, reason: "cooldown", until: declined.cooldown_until };
  }

  // Either side having blocked the other closes the channel — a blocked user
  // must not be able to re-open one by inquiring again from the listing page.
  const { data: blocks } = await db()
    .from("chat_blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${buyerId},blocked_id.eq.${listing.profile_id}),` +
      `and(blocker_id.eq.${listing.profile_id},blocked_id.eq.${buyerId})`,
    );
  if (((blocks as unknown[]) ?? []).length) return { ok: false, reason: "blocked" };

  const intents = (input.intents ?? []).filter((i) => INTENTS.has(i)).slice(0, 4);
  const message = (input.message ?? "").trim().slice(0, 2000) || "Hi, is this still available?";

  const { data: existing } = await db().from("inquiries").select("id").eq("profile_id", buyerId).eq("listing_id", listingId).maybeSingle();
  if (existing) {
    const id = (existing as { id: string }).id;
    // A re-inquiry that ticks no chips must not ERASE the ones the first one
    // ticked — the poster's request card reads these, and a second "still
    // interested?" send was silently stripping the intent chips off it.
    const patch: Record<string, unknown> = { message, share_number: input.shareNumber ?? true };
    if (intents.length) patch.intents = intents;
    await db().from("inquiries").update(patch).eq("id", id);
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

/**
 * Send an inquiry on a PROJECT (migration 0084). "Contact builder" used to hand
 * the buyer to WhatsApp and record a lead row they could never see; this keeps
 * the conversation in the app, on the same accept-before-seen rules a listing
 * inquiry has.
 *
 * Same three walls as `sendInquiry`: the project must be live, it must not be
 * the builder's own, a live decline cooldown blocks a re-send, and a block in
 * either direction closes the channel.
 */
export async function sendProjectInquiry(
  buyerId: string,
  projectId: string,
  input: { message: string; unitId?: string | null },
): Promise<InquiryResult> {
  const { data: p } = await db().from("projects").select("id,profile_id,status").eq("id", projectId).maybeSingle();
  const project = p as { id: string; profile_id: string; status: string } | null;
  if (!project || project.status !== "live") return { ok: false, reason: "not_found" };
  if (project.profile_id === buyerId) return { ok: false, reason: "self" };

  const { data: prior } = await db()
    .from("chat_threads")
    .select("status,cooldown_until")
    .eq("kind", "inquiry")
    .eq("buyer_id", buyerId)
    .eq("project_id", projectId)
    .maybeSingle();
  const declined = prior as { status: string; cooldown_until: string | null } | null;
  if (declined?.status === "declined" && declined.cooldown_until && new Date(declined.cooldown_until) > new Date()) {
    return { ok: false, reason: "cooldown", until: declined.cooldown_until };
  }

  const { data: blocks } = await db()
    .from("chat_blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${buyerId},blocked_id.eq.${project.profile_id}),` +
      `and(blocker_id.eq.${project.profile_id},blocked_id.eq.${buyerId})`,
    );
  if (((blocks as unknown[]) ?? []).length) return { ok: false, reason: "blocked" };

  // The unit must belong to THIS project. A crafted id from another builder's
  // scheme would otherwise label the thread with someone else's inventory.
  let unitId: string | null = null;
  if (input.unitId) {
    const { data: u } = await db()
      .from("project_units")
      .select("id")
      .eq("id", input.unitId)
      .eq("project_id", projectId)
      .maybeSingle();
    unitId = (u as { id: string } | null)?.id ?? null;
  }

  const message = (input.message ?? "").trim().slice(0, 2000) || "Hi, I'm interested in this project.";
  const already = !!prior;
  // The thread id goes back to the caller because a project chat is live the
  // moment it is sent — the sender is taken straight into it rather than being
  // told to wait for an accept that no longer exists.
  const threadId = await ensureProjectInquiryThread({ buyerId, projectId, builderId: project.profile_id, message, unitId });
  return { ok: true, alreadySent: already, threadId };
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
