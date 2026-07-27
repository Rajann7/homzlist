import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/listings/matching";
import { formatShortRupees } from "@/lib/billing/money";
import { MESSAGE_MAX, NUMBER_PATTERN, PROFANITY, PAGE } from "./service";
import { notify, threadMutedFor } from "@/lib/notifications/service";
import { pingThread, pingInbox } from "./realtime";
import { getUserPrefs } from "@/lib/settings/service";

/**
 * Chat thread detail + every in-thread mutation (Doc7 §92-107).
 *
 * NUMBER-SEALING lives in `getThread`: `otherNumber` is present ONLY when the
 * viewer is entitled to the other party's phone —
 *   • poster viewing  → buyer's number, ALWAYS (auto, Doc2 §8.2)
 *   • buyer  viewing  → poster's number, ONLY if an `allowed` number_requests row
 *     exists. Otherwise the key is ABSENT from the payload (not blanked) — the
 *     network response is DevTools-proof (Doc9 §10).
 */

const db = () => createServiceClient();

type Side = "buyer" | "poster";

interface ThreadRow {
  id: string; kind: "inquiry" | "proposal"; buyer_id: string; poster_id: string;
  listing_id: string | null; requirement_id: string | null; attached_listing_id: string | null;
  source_inquiry_id: string | null; source_proposal_id: string | null;
  status: "pending" | "accepted" | "declined"; cooldown_until: string | null;
  created_at: string;
}

/** Load a thread and assert the caller is a participant. Returns the row + side. */
export async function loadThreadForParticipant(threadId: string, me: string): Promise<{ t: ThreadRow; side: Side } | null> {
  const { data } = await db().from("chat_threads").select("*").eq("id", threadId).maybeSingle();
  const t = data as ThreadRow | null;
  if (!t) return null;
  if (t.buyer_id === me) return { t, side: "buyer" };
  if (t.poster_id === me) return { t, side: "poster" };
  return null; // not a participant → caller returns 404 (no existence leak, Doc9 §10)
}

/** Is `me` allowed to see the OTHER party's number in this thread? */
async function numberAllowed(t: ThreadRow, side: Side): Promise<boolean> {
  if (side === "poster") return true; // poster auto-sees the buyer's number
  const { data } = await db()
    .from("number_requests")
    .select("id")
    .eq("thread_id", t.id)
    .eq("requester_id", t.buyer_id)
    .eq("status", "allowed")
    .maybeSingle();
  return !!data;
}

async function blockState(t: ThreadRow, me: string) {
  const other = t.buyer_id === me ? t.poster_id : t.buyer_id;
  const { data } = await db()
    .from("chat_blocks")
    .select("blocker_id,blocked_id")
    .or(`and(blocker_id.eq.${me},blocked_id.eq.${other}),and(blocker_id.eq.${other},blocked_id.eq.${me})`);
  const rows = (data as { blocker_id: string; blocked_id: string }[]) ?? [];
  return {
    iBlocked: rows.some((r) => r.blocker_id === me),
    blockedMe: rows.some((r) => r.blocker_id === other),
  };
}

// ---------------------------------------------------------------------------
// getThread — messages + pinned card + sealed number + computed state
// ---------------------------------------------------------------------------
export async function getThread(threadId: string, me: string, opts: { before?: string } = {}) {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return null;
  const { t, side } = loaded;
  const otherId = side === "buyer" ? t.poster_id : t.buyer_id;

  const [{ data: otherP }, { data: meP }, allowed, blocks] = await Promise.all([
    db().from("profiles").select("id,name,photo_url,role,phone,state,created_at,city_id,last_active_at,response_label").eq("id", otherId).maybeSingle(),
    db().from("profiles").select("id,phone").eq("id", me).maybeSingle(),
    numberAllowed(t, side),
    blockState(t, me),
  ]);
  const other = otherP as any;

  // Pinned property / requirement card (live price — read fresh every load, Doc2 §10.2).
  let pinned: any = null;
  let listingBanner: string | null = null;
  if (t.listing_id) {
    const { data: l } = await db().from("listings").select("id,title,price_paise,price_on_request,cover_url,status,availability,area_label,kind").eq("id", t.listing_id).maybeSingle();
    if (l) {
      const row = l as any;
      pinned = {
        type: "listing", id: row.id, title: row.title,
        priceLabel: row.price_on_request ? "Price on request" : formatShortRupees(Number(row.price_paise ?? 0)),
        cover: row.cover_url, status: row.status, availability: row.availability,
      };
      if (row.status === "sold" || row.status === "rented" || row.availability !== "available") listingBanner = "This property is no longer available";
      if (row.status === "archived" || row.status === "hidden") listingBanner = "This property is no longer available";
    }
  } else if (t.requirement_id) {
    const { data: r } = await db().from("requirements").select("id,kind,bhk,budget_min_paise,budget_max_paise,area_label,status,is_active").eq("id", t.requirement_id).maybeSingle();
    if (r) {
      const row = r as any;
      const budget = row.budget_min_paise ? `${formatShortRupees(Number(row.budget_min_paise))}–${formatShortRupees(Number(row.budget_max_paise)).replace(/^₹/, "")}` : "";
      pinned = { type: "requirement", id: row.id, title: [row.bhk ? `${row.bhk} BHK` : "", budget, row.area_label].filter(Boolean).join(" · "), status: row.status };
      if (row.status === "expired" || !row.is_active) listingBanner = "This requirement has expired — new proposals are closed";
    }
  }

  // Messages (50/page, newest cursor). Filter delete-for-me per viewer.
  let mq = db().from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(PAGE);
  if (opts.before) mq = mq.lt("created_at", opts.before);
  const { data: msgData } = await mq;
  const raw = (msgData as any[]) ?? [];
  const visible = raw.filter((m) => !(Array.isArray(m.deleted_for) && m.deleted_for.includes(me))).reverse();

  // My read cursor → "seen" for messages I sent; the divider position.
  const { data: myPart } = await db().from("thread_participants").select("last_read_at,pinned,muted,archived").eq("thread_id", threadId).eq("profile_id", me).maybeSingle();
  const { data: otherPart } = await db().from("thread_participants").select("last_read_at").eq("thread_id", threadId).eq("profile_id", otherId).maybeSingle();
  const otherReadAt = (otherPart as any)?.last_read_at ?? "epoch";
  const myReadAt = (myPart as any)?.last_read_at ?? "epoch";

  // The number the VIEWER is entitled to (sealed).
  const otherNumber = allowed && other?.state !== "deleted" ? other?.phone ?? null : undefined;

  const messages = visible.map((m) => {
    const mine = m.sender_id === me;
    const seen = mine && new Date(m.created_at) <= new Date(otherReadAt);
    // number_card meta never carries the number itself — the client renders
    // `otherNumber` (sealed above) into it, so a pre-allow response has no digits.
    return {
      id: m.id,
      mine,
      kind: m.kind,
      body: m.deleted_all ? null : m.body,
      deleted: m.deleted_all,
      photo: m.deleted_all ? null : m.photo_url,
      photoW: m.photo_w, photoH: m.photo_h,
      replyTo: m.reply_to,
      meta: m.deleted_all ? {} : m.meta,
      reactions: m.reactions ?? {},
      seen,
      time: new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }),
      createdAt: m.created_at,
    };
  });

  const firstUnread = messages.find((m) => !m.mine && new Date(m.createdAt) > new Date(myReadAt));

  const rank = { rera: 3, id: 2 } as Record<string, number>;
  const { data: ver } = await db().from("verifications").select("level").eq("profile_id", otherId).eq("status", "approved");
  const verified = (ver as any[] ?? []).some((v) => rank[v.level]);

  // P10 S6b Privacy, enforced HERE (Doc9 §4: a private field is stripped from
  // the payload, never hidden with CSS). The OTHER person's own settings decide
  // whether this thread may reveal their presence:
  //   • show_activity  off → they never read as Online
  //   • show_last_seen off → no "Last seen …" line at all
  // Defaults match the design (both on) when they've never opened Privacy.
  const otherPrefs = await getUserPrefs(otherId);
  const isOnline =
    otherPrefs.showActivity && other?.last_active_at
      ? Date.now() - +new Date(other.last_active_at) < 5 * 60_000
      : false;
  const lastSeenLabel =
    otherPrefs.showLastSeen && other?.last_active_at ? timeAgo(other.last_active_at) : null;

  const payload: any = {
    threadId: t.id,
    kind: t.kind,
    side,
    status: t.status,
    cooldownUntil: t.cooldown_until,
    person: other
      ? { id: other.id, name: other.name ?? "HomzList user", photo: other.photo_url, role: other.role, roleTag: other.role === "broker" ? "Broker" : other.role === "builder" ? "Builder" : "Owner", verified, deleted: other.state === "deleted", online: isOnline, lastSeen: lastSeenLabel, responseLabel: other.response_label }
      : { id: "", name: "Deleted user", deleted: true },
    pinned,
    listingBanner,
    messages,
    firstUnreadId: firstUnread?.id ?? null,
    hasMore: raw.length === PAGE,
    numberAllowed: allowed,
    block: blocks,
    myState: { pinned: !!(myPart as any)?.pinned, muted: !!(myPart as any)?.muted, archived: !!(myPart as any)?.archived },
  };
  // Sealed number: present ONLY when entitled. Absent key otherwise (DevTools-proof).
  if (otherNumber !== undefined) payload.otherNumber = otherNumber;
  return payload;
}

// ---------------------------------------------------------------------------
// sendMessage — Doc7 §93
// ---------------------------------------------------------------------------
export async function sendMessage(
  threadId: string, me: string,
  input: { text?: string; photoUrl?: string; photoW?: number; photoH?: number; replyTo?: string | null },
): Promise<{ ok: boolean; reason?: string; message?: any }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false, reason: "not_found" };
  const { t } = loaded;

  // Pending inquiry: sender may keep messaging (queued in-thread); poster cannot
  // send until they accept (accept-before-seen). Declined: nobody sends.
  if (t.status === "declined") return { ok: false, reason: "closed" };
  if (t.status === "pending" && t.poster_id === me) return { ok: false, reason: "not_accepted" };

  const blocks = await blockState(t, me);
  if (blocks.iBlocked || blocks.blockedMe) return { ok: false, reason: "blocked" };

  const text = (input.text ?? "").slice(0, MESSAGE_MAX);
  const isPhoto = !!input.photoUrl;
  if (!isPhoto && !text.trim()) return { ok: false, reason: "empty" };

  const numberFlag = !isPhoto && NUMBER_PATTERN.test(text);
  const profanityFlag = !isPhoto && PROFANITY.some((w) => text.toLowerCase().includes(w));

  const { data } = await db().from("chat_messages").insert({
    thread_id: threadId, sender_id: me,
    kind: isPhoto ? "photo" : "text",
    body: isPhoto ? (text || null) : text,
    photo_url: input.photoUrl ?? null, photo_w: input.photoW ?? null, photo_h: input.photoH ?? null,
    reply_to: input.replyTo && /^[0-9a-f-]{36}$/i.test(input.replyTo) ? input.replyTo : null,
    number_flag: numberFlag, profanity_flag: profanityFlag,
  }).select("*").single();

  // A new message auto-unarchives the thread for both sides (Doc2 §10.2).
  await db().from("thread_participants").update({ archived: false }).eq("thread_id", threadId);
  // My own read cursor advances (I've "seen" up to my own message).
  await db().from("thread_participants").update({ last_read_at: new Date().toISOString() }).eq("thread_id", threadId).eq("profile_id", me);

  // Live fan-out: nudge the open thread + the recipient's inbox to refetch.
  const recipient = t.buyer_id === me ? t.poster_id : t.buyer_id;
  await Promise.all([pingThread(threadId), pingInbox(recipient)]);

  // Notify the recipient (best-effort, respects their mute). Only on an open
  // thread — a pending inquiry already notified the poster at creation.
  if (t.status === "accepted") {
    if (!(await threadMutedFor(threadId, recipient))) {
      // Per-thread grouping (Doc2 §14): consecutive unread messages in one
      // thread collapse into "Rahul: 5 new messages" instead of five rows.
      // The count comes back from the atomic upsert, so the copy is a real
      // count, not a client-side tally.
      const who = await nameOf(me);
      const first = await notify({
        profileId: recipient, type: "new_message", actorId: me, threadId,
        groupKey: `thread:${threadId}`,
        title: `**${who}:** ${isPhoto ? "📷 Photo" : text.slice(0, 90)}`,
        body: isPhoto ? "📷 Photo" : text.slice(0, 120),
        data: { threadId },
      });
      if (first.grouped && first.groupCount > 1 && first.id) {
        await db().from("notifications")
          .update({ title: `**${who}:** ${first.groupCount} new messages` })
          .eq("id", first.id);
      }
    }
  }

  const m = data as any;
  return { ok: true, message: { id: m.id, mine: true, kind: m.kind, body: m.body, photo: m.photo_url, reactions: {}, seen: false, numberFlag, createdAt: m.created_at } };
}

// ---------------------------------------------------------------------------
// markRead / markAllRead — Doc7 §94
// ---------------------------------------------------------------------------
export async function markRead(threadId: string, me: string): Promise<{ ok: boolean }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false };
  await db().from("thread_participants").update({ last_read_at: new Date().toISOString() }).eq("thread_id", threadId).eq("profile_id", me);
  return { ok: true };
}

export async function markAllRead(me: string): Promise<{ ok: boolean }> {
  const { data } = await db().from("chat_threads").select("id").or(`buyer_id.eq.${me},poster_id.eq.${me}`);
  const ids = (data as { id: string }[] ?? []).map((t) => t.id);
  if (ids.length) await db().from("thread_participants").update({ last_read_at: new Date().toISOString() }).eq("profile_id", me).in("thread_id", ids);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// react / delete / report a message — Doc7 §95-97
// ---------------------------------------------------------------------------
const EMOJI = new Set(["👍", "❤️", "😊", "🙏", "✅"]);

export async function reactMessage(messageId: string, me: string, emoji: string): Promise<{ ok: boolean; reactions?: any }> {
  if (!EMOJI.has(emoji)) return { ok: false };
  const { data } = await db().from("chat_messages").select("id,thread_id,reactions").eq("id", messageId).maybeSingle();
  const m = data as any;
  if (!m) return { ok: false };
  if (!(await loadThreadForParticipant(m.thread_id, me))) return { ok: false };
  const reactions = { ...(m.reactions ?? {}) } as Record<string, string[]>;
  const list = new Set(reactions[emoji] ?? []);
  if (list.has(me)) list.delete(me); else list.add(me);
  if (list.size) reactions[emoji] = [...list]; else delete reactions[emoji];
  await db().from("chat_messages").update({ reactions }).eq("id", messageId);
  await pingThread(m.thread_id);
  return { ok: true, reactions };
}

export async function deleteMessage(messageId: string, me: string, scope: "me" | "everyone"): Promise<{ ok: boolean }> {
  const { data } = await db().from("chat_messages").select("id,thread_id,sender_id,deleted_for").eq("id", messageId).maybeSingle();
  const m = data as any;
  if (!m) return { ok: false };
  if (!(await loadThreadForParticipant(m.thread_id, me))) return { ok: false };
  if (scope === "everyone") {
    if (m.sender_id !== me) return { ok: false }; // only your own message
    await db().from("chat_messages").update({ deleted_all: true, body: null, photo_url: null }).eq("id", messageId); // soft-kept for admin
  } else {
    const arr = Array.isArray(m.deleted_for) ? m.deleted_for : [];
    if (!arr.includes(me)) await db().from("chat_messages").update({ deleted_for: [...arr, me] }).eq("id", messageId);
  }
  await pingThread(m.thread_id);
  return { ok: true };
}

const REPORT_REASONS = new Set(["Spam", "Abusive language", "Fraud attempt", "Asking for payment off-platform", "Fake identity", "Report message"]);
export async function reportChat(me: string, input: { threadId: string; messageId?: string; reason: string; note?: string }): Promise<{ ok: boolean }> {
  if (!REPORT_REASONS.has(input.reason)) return { ok: false };
  const loaded = await loadThreadForParticipant(input.threadId, me);
  if (!loaded) return { ok: false };
  const subject = input.messageId ? "message" : "user";
  const subjectId = input.messageId ?? (loaded.t.buyer_id === me ? loaded.t.poster_id : loaded.t.buyer_id);
  await db().from("reports").upsert(
    { reporter_id: me, subject_type: subject, subject_id: subjectId, reason: input.reason, note: input.note ?? null, status: "open" },
    { onConflict: "reporter_id,subject_type,subject_id", ignoreDuplicates: true },
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Number request / response — Doc7 §98-99 (the sealed flow)
// ---------------------------------------------------------------------------
export async function requestNumber(threadId: string, me: string): Promise<{ ok: boolean; reason?: string }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false, reason: "not_found" };
  const { t, side } = loaded;
  if (side !== "buyer") return { ok: false, reason: "poster_auto" }; // poster already sees the buyer's number
  if (t.status !== "accepted") return { ok: false, reason: "not_open" };

  // Already allowed? no-op. Deny → re-request UNLIMITED (no cooldown, Doc7 §99).
  const { data: live } = await db().from("number_requests").select("id,status").eq("thread_id", threadId).in("status", ["requested", "allowed"]).maybeSingle();
  if (live) return { ok: true }; // a live request/allow already stands

  const { data: card } = await db().from("chat_messages").insert({
    thread_id: threadId, sender_id: me, kind: "number_request",
    body: null, meta: { requesterId: me },
  }).select("id").single();
  await db().from("number_requests").insert({
    thread_id: threadId, requester_id: t.buyer_id, target_id: t.poster_id,
    status: "requested", message_id: (card as any).id,
  });
  // designs/P11 S7 row 2 — the row carries the inline Allow / Deny pair, which
  // resolve through lib/notifications/actions.ts back into numberResponse().
  await notify({
    profileId: t.poster_id, type: "number_requested", actorId: me, threadId,
    title: `**${await nameOf(me)}** requested your phone number`,
    body: `${await nameOf(me)} requested your phone number`,
    data: { threadId },
  });
  await pingThread(threadId);
  return { ok: true };
}

export async function numberResponse(threadId: string, me: string, allow: boolean): Promise<{ ok: boolean; reason?: string }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false, reason: "not_found" };
  const { t, side } = loaded;
  if (side !== "poster") return { ok: false, reason: "not_target" };

  const { data: reqRow } = await db().from("number_requests").select("id,status").eq("thread_id", threadId).eq("status", "requested").maybeSingle();
  if (!reqRow) return { ok: false, reason: "no_request" };
  const status = allow ? "allowed" : "denied";
  await db().from("number_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", (reqRow as any).id);

  if (allow) {
    // A system line + a NumberCard marker (the digits are NEVER stored here —
    // getThread seals them per-viewer). Poster's number becomes visible to buyer.
    await db().from("chat_messages").insert({ thread_id: threadId, sender_id: null, kind: "system", body: `${await nameOf(t.poster_id)} shared their number` });
    await db().from("chat_messages").insert({ thread_id: threadId, sender_id: t.poster_id, kind: "number_card", meta: { owner: "poster" } });
    // Post-number continuity prompt (Interested / Not / Visit fixed).
    await db().from("chat_messages").insert({ thread_id: threadId, sender_id: null, kind: "continuity", body: "Did you connect on call?" });
    await notify({
      profileId: t.buyer_id, type: "number_shared", actorId: t.poster_id, threadId,
      title: `**${await nameOf(t.poster_id)}** shared their number with you`,
      body: `${await nameOf(t.poster_id)} shared their number`,
      data: { threadId },
    });
  }
  await pingThread(threadId);
  return { ok: true };
}

async function nameOf(id: string): Promise<string> {
  const { data } = await db().from("profiles").select("name").eq("id", id).maybeSingle();
  return (data as any)?.name ?? "They";
}

// ---------------------------------------------------------------------------
// Visit scheduler — Doc7 §100 (creates a `visits` row + a card message)
// ---------------------------------------------------------------------------
export async function proposeVisit(threadId: string, me: string, scheduledAt: string): Promise<{ ok: boolean; reason?: string }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false, reason: "not_found" };
  const { t } = loaded;
  if (t.status !== "accepted") return { ok: false, reason: "not_open" };
  const when = new Date(scheduledAt);
  if (isNaN(+when)) return { ok: false, reason: "bad_date" };

  const { data: v } = await db().from("visits").insert({
    listing_id: t.listing_id, requirement_id: t.requirement_id,
    buyer_id: t.buyer_id, poster_id: t.poster_id,
    scheduled_at: when.toISOString(), status: "proposed", thread_id: threadId,
  }).select("id").single();
  await db().from("chat_messages").insert({
    thread_id: threadId, sender_id: me, kind: "visit_proposal",
    body: "Proposed a site visit", meta: { visitId: (v as any).id, scheduledAt: when.toISOString() },
  });
  await pingThread(threadId);
  return { ok: true };
}

/** Continuity prompt answer → updates/creates a lead stage (Doc2 §10.4). */
export async function continuityAnswer(threadId: string, me: string, answer: "interested" | "not_interested" | "visit_fixed"): Promise<{ ok: boolean }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false };
  const { t } = loaded;
  const label = answer === "visit_fixed" ? "Visit fixed" : answer === "interested" ? "Interested" : "Not interested";
  await db().from("chat_messages").insert({ thread_id: threadId, sender_id: null, kind: "system", body: `Marked as: ${label}` });
  // Reflect into the poster's lead pipeline (owner_id = poster, lead = buyer).
  const stage = answer === "visit_fixed" ? "visit" : answer === "interested" ? "contacted" : "closed_lost";
  const { data: lead } = await db().from("leads").select("id").eq("owner_id", t.poster_id).eq("lead_profile_id", t.buyer_id).maybeSingle();
  if (lead) await db().from("leads").update({ stage, last_activity: label, last_activity_at: new Date().toISOString() }).eq("id", (lead as any).id);
  else await db().from("leads").insert({ owner_id: t.poster_id, lead_profile_id: t.buyer_id, listing_id: t.listing_id, requirement_id: t.requirement_id, source: "inquiry", stage, last_activity: label });
  await pingThread(threadId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Block / unblock — Doc7 §106
// ---------------------------------------------------------------------------
export async function blockUser(threadId: string, me: string): Promise<{ ok: boolean }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false };
  const other = loaded.t.buyer_id === me ? loaded.t.poster_id : loaded.t.buyer_id;
  await db().from("chat_blocks").upsert({ blocker_id: me, blocked_id: other }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
  return { ok: true };
}
export async function unblockUser(threadId: string, me: string): Promise<{ ok: boolean }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false };
  const other = loaded.t.buyer_id === me ? loaded.t.poster_id : loaded.t.buyer_id;
  await db().from("chat_blocks").delete().eq("blocker_id", me).eq("blocked_id", other);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Thread state: pin / mute / archive — Doc4 §34 swipe + long-press
// ---------------------------------------------------------------------------
export async function setThreadState(threadId: string, me: string, patch: { pinned?: boolean; muted?: boolean; archived?: boolean }): Promise<{ ok: boolean }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false };
  const clean: Record<string, boolean> = {};
  for (const k of ["pinned", "muted", "archived"] as const) if (typeof patch[k] === "boolean") clean[k] = patch[k]!;
  if (Object.keys(clean).length) await db().from("thread_participants").update(clean).eq("thread_id", threadId).eq("profile_id", me);
  return { ok: true };
}

/** Delete chat for me (clears my view; the row survives for the other side + admin). */
export async function deleteThreadForMe(threadId: string, me: string): Promise<{ ok: boolean }> {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return { ok: false };
  const now = new Date().toISOString();
  const ids = (await db().from("chat_messages").select("id,deleted_for").eq("thread_id", threadId)).data as any[] ?? [];
  for (const m of ids) {
    const arr = Array.isArray(m.deleted_for) ? m.deleted_for : [];
    if (!arr.includes(me)) await db().from("chat_messages").update({ deleted_for: [...arr, me] }).eq("id", m.id);
  }
  await db().from("thread_participants").update({ archived: true, cleared_at: now }).eq("thread_id", threadId).eq("profile_id", me);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Chat details (S4) — participant, shared media, shared listings
// ---------------------------------------------------------------------------
export async function chatDetails(threadId: string, me: string) {
  const loaded = await loadThreadForParticipant(threadId, me);
  if (!loaded) return null;
  const view = await getThread(threadId, me);
  if (!view) return null;
  const photos = (await db().from("chat_messages").select("id,photo_url,created_at").eq("thread_id", threadId).eq("kind", "photo").eq("deleted_all", false).order("created_at", { ascending: false })).data as any[] ?? [];

  // Shared listings (S4): the proposal's attached property + any listing pinned
  // that isn't the property card, deduped — genuine rows, never mocked.
  const listingIds = [...new Set([loaded.t.attached_listing_id].filter((x): x is string => !!x))];
  let sharedListings: any[] = [];
  if (listingIds.length) {
    const { data: ls } = await db().from("listings").select("id,title,price_paise,price_on_request,cover_url").in("id", listingIds);
    sharedListings = (ls as any[] ?? []).map((l) => ({ id: l.id, title: l.title, priceLabel: l.price_on_request ? "Price on request" : formatShortRupees(Number(l.price_paise ?? 0)), cover: l.cover_url }));
  }

  return {
    person: view.person,
    otherNumber: view.otherNumber, // sealed same as thread
    numberAllowed: view.numberAllowed,
    pinnedCard: view.pinned, // the pinned listing/requirement card (may be null)
    pinned: view.myState.pinned, // MY pin toggle state (boolean) — not the card
    sharedPhotos: photos.filter((p) => p.photo_url).map((p) => ({ id: p.id, url: p.photo_url })),
    sharedListings,
    myState: view.myState,
    block: view.block,
  };
}

// ---------------------------------------------------------------------------
// Quick-reply templates CRUD — Doc7 §107
// ---------------------------------------------------------------------------
export async function listTemplates(me: string) {
  const { data } = await db().from("chat_templates").select("id,profile_id,body,sort").or(`profile_id.is.null,profile_id.eq.${me}`).order("sort");
  const rows = (data as any[]) ?? [];
  return rows.map((r) => ({ id: r.id, body: r.body, isDefault: r.profile_id === null }));
}
export async function createTemplate(me: string, body: string): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const clean = (body ?? "").trim().slice(0, 500);
  if (!clean) return { ok: false };
  // Cap custom templates per user so a compromised account can't flood the table.
  const { count } = await db().from("chat_templates").select("id", { count: "exact", head: true }).eq("profile_id", me);
  if ((count ?? 0) >= 30) return { ok: false, reason: "limit" };
  const { data } = await db().from("chat_templates").insert({ profile_id: me, body: clean, sort: 100 }).select("id").single();
  return { ok: true, id: (data as any).id };
}
export async function updateTemplate(me: string, id: string, body: string): Promise<{ ok: boolean }> {
  const clean = (body ?? "").trim().slice(0, 500);
  if (!clean) return { ok: false };
  const { data } = await db().from("chat_templates").update({ body: clean }).eq("id", id).eq("profile_id", me).select("id");
  return { ok: (data as any[])?.length > 0 };
}
export async function deleteTemplate(me: string, id: string): Promise<{ ok: boolean }> {
  await db().from("chat_templates").delete().eq("id", id).eq("profile_id", me);
  return { ok: true };
}
