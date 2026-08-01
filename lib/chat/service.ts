import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/listings/matching";
import { formatShortRupees } from "@/lib/billing/money";
import { notify } from "@/lib/notifications/service";
import { listingBrief, requirementBrief } from "@/lib/notifications/subjects";
import { pingThread, pingInbox } from "./realtime";

/**
 * Chat, inquiry & number system (Module 7 — P7, Doc2 §10, Doc7 §87-107, Doc9 §10).
 *
 * The server owns every truth here. Three walls:
 *   1. RLS deny-all (0028) — the browser never touches these tables directly.
 *   2. Ownership: every function is scoped to a participant of the thread; a
 *      crafted id belonging to someone else's thread matches nothing.
 *   3. NUMBER-SEALING (the headline rule, Doc2 §8.2 / Doc9 §10): the poster's
 *      phone is added to a payload ONLY when an `allowed` number_requests row
 *      exists for the viewing buyer. It is never sent-then-hidden. The poster
 *      always sees the buyer's number (auto) — that direction needs no gate.
 *
 * Admin is read-only on chat — enforced at the API (never calls sendMessage).
 */

const db = () => createServiceClient();

const MESSAGE_MAX = 2000;
const PAGE = 50;
const DECLINE_COOLDOWN_DAYS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The number regex and the four-word profanity list that used to live here are
// rows in `number_patterns` / `blocklist_words` (migration 0106). Chat reads
// them through lib/moderation/rules.ts, the same detector listings use, so
// there is one moderation policy for the site rather than one per surface.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Tab = "my-listings" | "my-inquiries" | "requirement-leads" | "my-responses";

interface ProfileRow {
  id: string; name: string | null; photo_url: string | null; role: string | null;
  phone: string; city_id: string | null; created_at: string; state: string;
}
interface ThreadRow {
  id: string; kind: "inquiry" | "proposal"; buyer_id: string; poster_id: string;
  listing_id: string | null; requirement_id: string | null; attached_listing_id: string | null;
  source_inquiry_id: string | null; source_proposal_id: string | null;
  status: "pending" | "accepted" | "declined"; cooldown_until: string | null;
  last_message_at: string; last_message_preview: string | null;
  last_message_kind: string | null; last_message_sender: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Small shared loaders
// ---------------------------------------------------------------------------
async function profilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await db()
    .from("profiles")
    .select("id,name,photo_url,role,phone,city_id,created_at,state")
    .in("id", uniq);
  return new Map((data as ProfileRow[] ?? []).map((p) => [p.id, p]));
}

async function listingsByIds(ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map<string, any>();
  const { data } = await db()
    .from("listings")
    .select("id,title,price_paise,price_on_request,cover_url,status,availability,area_label,kind")
    .in("id", uniq);
  return new Map((data as any[] ?? []).map((l) => [l.id, l]));
}

async function requirementsByIds(ids: string[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map<string, any>();
  const { data } = await db()
    .from("requirements")
    .select("id,kind,type_code,bhk,budget_min_paise,budget_max_paise,area_label,status,is_active,expires_at")
    .in("id", uniq);
  return new Map((data as any[] ?? []).map((r) => [r.id, r]));
}

/** Highest approved verification of a profile → the Verified/Others split + trust strip. */
async function verificationLevels(ids: string[]): Promise<Map<string, "rera" | "id" | "phone" | null>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, "rera" | "id" | "phone" | null>();
  if (!uniq.length) return out;
  const { data } = await db()
    .from("verifications")
    .select("profile_id,level,status")
    .in("profile_id", uniq)
    .eq("status", "approved");
  const rank = { rera: 3, id: 2, phone: 1 } as Record<string, number>;
  for (const id of uniq) out.set(id, null);
  for (const v of (data as { profile_id: string; level: string }[] ?? [])) {
    const cur = out.get(v.profile_id);
    const curRank = cur ? rank[cur] : 0;
    if ((rank[v.level] ?? 0) > curRank) out.set(v.profile_id, v.level as any);
  }
  return out;
}

function listingCard(l: any) {
  if (!l) return null;
  return {
    id: l.id,
    title: l.title as string,
    priceLabel: l.price_on_request ? "Price on request" : formatShortRupees(Number(l.price_paise ?? 0)),
    cover: l.cover_url as string | null,
    status: l.status as string,
    availability: l.availability as string,
    area: l.area_label as string | null,
  };
}

const BHK_LABEL = (bhk: number | null) => (bhk ? `${bhk} BHK` : "");
function requirementCard(r: any) {
  if (!r) return null;
  const budget =
    r.budget_min_paise && r.budget_max_paise
      ? `${formatShortRupees(Number(r.budget_min_paise))}–${formatShortRupees(Number(r.budget_max_paise)).replace(/^₹/, "")}`
      : "";
  const bits = [BHK_LABEL(r.bhk), budget, r.area_label].filter(Boolean);
  return {
    id: r.id,
    title: bits.join(" · "),
    kind: r.kind,
    status: r.status,
    expired: r.status === "expired" || !r.is_active,
  };
}

function trustStrip(p: ProfileRow, level: "rera" | "id" | "phone" | null) {
  const filled = [p.name, p.photo_url, p.city_id].filter(Boolean).length;
  const pct = Math.round((filled / 3) * 100);
  return {
    phoneVerified: true, // registration = phone-verified (Doc2 §2)
    idVerified: level === "id" || level === "rera",
    reraVerified: level === "rera",
    memberSince: new Date(p.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    profilePct: pct,
  };
}

function personDTO(p: ProfileRow | undefined, level: "rera" | "id" | "phone" | null) {
  if (!p) return { id: "", name: "Deleted user", photo: null, role: null, verified: false, deleted: true };
  return {
    id: p.id,
    name: p.name ?? "HomzList user",
    photo: p.photo_url,
    role: p.role, // owner / broker / builder
    verified: level === "id" || level === "rera",
    deleted: p.state === "deleted",
  };
}

const roleTag = (role: string | null) =>
  role === "broker" ? "Broker" : role === "builder" ? "Builder" : "Owner";

// ---------------------------------------------------------------------------
// Thread creation — grown from an inquiry or a proposal
// ---------------------------------------------------------------------------

/**
 * Ensure a thread exists for an inquiry (called by the inquiry send path). One
 * thread per (buyer, listing) — revives an existing one (Doc2 §10.1). The
 * inquiry's message becomes the first bubble; the thread starts `pending`
 * (accept-before-seen).
 */
export async function ensureInquiryThread(inquiry: {
  id: string; profile_id: string; listing_id: string; poster_id: string; message: string; intents: string[];
}): Promise<string> {
  const existing = await db()
    .from("chat_threads")
    .select("id")
    .eq("kind", "inquiry")
    .eq("buyer_id", inquiry.profile_id)
    .eq("listing_id", inquiry.listing_id)
    .maybeSingle();
  if (existing.data) {
    const id = (existing.data as { id: string }).id;
    // Re-inquiry revives a declined thread and refreshes its source pointer.
    // The caller (sendInquiry) has already refused a send inside a live decline
    // cooldown, so reaching here means the cooldown lapsed — clearing it is
    // correct, and it is the ONLY thing that clears it.
    await db().from("chat_threads").update({ source_inquiry_id: inquiry.id, status: "pending", cooldown_until: null }).eq("id", id);
    return id;
  }
  const { data: created } = await db()
    .from("chat_threads")
    .insert({
      kind: "inquiry",
      buyer_id: inquiry.profile_id,
      poster_id: inquiry.poster_id,
      listing_id: inquiry.listing_id,
      source_inquiry_id: inquiry.id,
      status: "pending",
      last_message_preview: inquiry.message.slice(0, 140),
      last_message_kind: "text",
      last_message_sender: inquiry.profile_id,
    })
    .select("id")
    .single();
  const threadId = (created as { id: string }).id;
  await seedParticipants(threadId, inquiry.profile_id, inquiry.poster_id);
  await db().from("chat_messages").insert({
    thread_id: threadId, sender_id: inquiry.profile_id, kind: "text", body: inquiry.message,
  });
  await db().from("inquiries").update({ thread_id: threadId }).eq("id", inquiry.id);
  // designs/P11 S7 row 1: "<b>Nirav Shah</b> sent an inquiry on your 3 BHK Flat,
  // Mavdi" + the listing thumbnail. Both come from real rows.
  const brief = await listingBrief(inquiry.listing_id);
  await notify({
    profileId: inquiry.poster_id, type: "inquiry_received", actorId: inquiry.profile_id, threadId,
    title: `**${await nameOf(inquiry.profile_id)}** sent an inquiry on your ${brief.title}`,
    body: `${await nameOf(inquiry.profile_id)} sent you an inquiry`,
    thumbUrl: brief.thumbUrl,
    entityKind: "listing", entityId: inquiry.listing_id,
    data: { threadId, listingId: inquiry.listing_id },
  });
  await pingInbox(inquiry.poster_id);
  return threadId;
}

/**
 * Ensure a thread for a PROJECT inquiry (migration 0084).
 *
 * A project chat opens ACCEPTED — it never becomes a request card (Rajan,
 * 29 Jul 2026). Accept-before-seen exists to protect a private seller's inbox
 * from strangers; a project is a marketing listing whose builder publishes
 * their phone number on the page (Doc2 §6), so making them tap Accept before
 * they can read a buyer's question is a step that protects nobody and loses
 * leads. The conversation is live for both sides from the first message, and
 * the builder's pipeline row is written immediately rather than on an accept
 * that will never come.
 *
 * There is deliberately no `inquiries` row behind it: that table is listing-only
 * (`listing_id not null`, 0026), and widening it would mean rewriting every
 * reader of it. The thread IS the record.
 *
 * One thread per (buyer, project), enforced by `chat_threads_project_uniq`.
 */
export async function ensureProjectInquiryThread(input: {
  buyerId: string; projectId: string; builderId: string; message: string; unitId?: string | null;
}): Promise<string> {
  const existing = await db()
    .from("chat_threads")
    .select("id,status,cooldown_until")
    .eq("kind", "inquiry")
    .eq("buyer_id", input.buyerId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (existing.data) {
    const row = existing.data as { id: string };
    // A later enquiry names the unit the buyer is asking about NOW; an enquiry
    // about the whole project doesn't erase the unit an earlier one named.
    await db().from("chat_threads").update({
      status: "accepted", cooldown_until: null,
      ...(input.unitId ? { unit_id: input.unitId } : {}),
    }).eq("id", row.id);
    await db().from("chat_messages").insert({
      thread_id: row.id, sender_id: input.buyerId, kind: "text", body: input.message,
    });
    await db().from("chat_threads").update({
      last_message_preview: input.message.slice(0, 140),
      last_message_kind: "text",
      last_message_sender: input.buyerId,
      last_message_at: new Date().toISOString(),
    }).eq("id", row.id);
    // A re-opened chat is still a live lead for the builder.
    await upsertLeadFromThread(row.id, { activity: "Asked about the project" });
    await Promise.all([pingThread(row.id), pingInbox(input.builderId)]);
    return row.id;
  }

  const { data: created } = await db()
    .from("chat_threads")
    .insert({
      kind: "inquiry",
      buyer_id: input.buyerId,
      poster_id: input.builderId,
      project_id: input.projectId,
      unit_id: input.unitId ?? null,
      status: "accepted",
      last_message_preview: input.message.slice(0, 140),
      last_message_kind: "text",
      last_message_sender: input.buyerId,
    })
    .select("id")
    .single();
  const threadId = (created as { id: string }).id;
  await seedParticipants(threadId, input.buyerId, input.builderId);
  await db().from("chat_messages").insert({
    thread_id: threadId, sender_id: input.buyerId, kind: "text", body: input.message,
  });
  // The chat IS the lead — there is no accept tap to hang it off.
  await upsertLeadFromThread(threadId, { activity: "Asked about the project" });

  const { data: proj } = await db().from("projects").select("name,cover_url").eq("id", input.projectId).maybeSingle();
  const p = proj as { name: string; cover_url: string | null } | null;
  await notify({
    profileId: input.builderId, type: "inquiry_received", actorId: input.buyerId, threadId,
    title: `**${await nameOf(input.buyerId)}** sent an inquiry on your project ${p?.name ?? ""}`.trim(),
    body: `${await nameOf(input.buyerId)} sent you an inquiry`,
    thumbUrl: p?.cover_url ?? null,
    entityKind: "project", entityId: input.projectId,
    data: { threadId, projectId: input.projectId },
  });
  await Promise.all([pingThread(threadId), pingInbox(input.builderId)]);
  return threadId;
}

/**
 * Ensure a thread for a proposal. The proposal's message + attached listing (if
 * any) seed the conversation; the buyer's number is auto-visible to the poster
 * (Doc2 §8.1) — a `number_card` from the buyer is written so the poster sees it.
 */
export async function ensureProposalThread(proposal: {
  id: string; sender_id: string; poster_id: string; requirement_id: string;
  mode: string; listing_id: string | null; message: string; status: string;
}): Promise<string> {
  const existing = await db().from("chat_threads").select("id").eq("source_proposal_id", proposal.id).maybeSingle();
  if (existing.data) return (existing.data as { id: string }).id;

  const status = proposal.status === "accepted" ? "accepted" : proposal.status === "declined" ? "declined" : "pending";
  const { data: created } = await db()
    .from("chat_threads")
    .insert({
      kind: "proposal",
      buyer_id: proposal.sender_id, // the proposer is the "buyer" side of the chat
      poster_id: proposal.poster_id,
      requirement_id: proposal.requirement_id,
      attached_listing_id: proposal.mode === "listing" ? proposal.listing_id : null,
      source_proposal_id: proposal.id,
      status,
      last_message_preview: proposal.message.slice(0, 140),
      last_message_kind: "text",
      last_message_sender: proposal.sender_id,
    })
    .select("id")
    .single();
  const threadId = (created as { id: string }).id;
  await seedParticipants(threadId, proposal.sender_id, proposal.poster_id);
  await db().from("chat_messages").insert({
    thread_id: threadId, sender_id: proposal.sender_id, kind: "text", body: proposal.message,
  });
  // Mode "I have a property" → the attached listing belongs IN the conversation
  // as the rich card the spec asks for. It was only ever reachable from the
  // request card and the Details screen's "shared listings", so once the poster
  // accepted, the property being proposed vanished from the chat itself.
  if (proposal.mode === "listing" && proposal.listing_id) {
    const { data: l } = await db()
      .from("listings")
      .select("id,title,price_paise,price_on_request,cover_url,area_label")
      .eq("id", proposal.listing_id)
      .maybeSingle();
    const row = l as any;
    if (row) {
      await db().from("chat_messages").insert({
        thread_id: threadId, sender_id: proposal.sender_id, kind: "link", body: null,
        // Same meta shape the pasted-link preview produces, so ONE renderer
        // draws both (thumb + live price + details, clickable through).
        meta: {
          kind: "listing", entityId: row.id, title: row.title,
          subtitle: [row.price_on_request ? "Price on request" : formatShortRupees(Number(row.price_paise ?? 0)), row.area_label].filter(Boolean).join(" · "),
          cover: row.cover_url, domain: "homzlist.com", external: false,
          url: `https://homzlist.com/property/${row.id}`,
        },
      });
    }
  }
  await db().from("proposals").update({ thread_id: threadId }).eq("id", proposal.id);
  // designs/P11 S7: "<b>RK Properties</b> sent a proposal on your requirement
  // (3 BHK, ₹40–60 L)" — the requirement's own attributes, not a generic line.
  const reqBrief = await requirementBrief(proposal.requirement_id);
  await notify({
    profileId: proposal.poster_id, type: "proposal_received", actorId: proposal.sender_id, threadId,
    title: `**${await nameOf(proposal.sender_id)}** sent a proposal on your requirement (${reqBrief.title})`,
    body: `${await nameOf(proposal.sender_id)} proposed on your requirement`,
    entityKind: "requirement", entityId: proposal.requirement_id,
    data: { threadId, requirementId: proposal.requirement_id, proposalId: proposal.id },
  });
  await pingInbox(proposal.poster_id);
  return threadId;
}

/** Display name of a profile (best-effort, for notification copy). */
async function nameOf(id: string): Promise<string> {
  const { data } = await db().from("profiles").select("name").eq("id", id).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "Someone";
}

/**
 * Create (or refresh) the poster's pipeline lead for a thread — the single place
 * a chat turns into a lead (Doc2 §10.4).
 *
 * `source` is the thread's own kind, so the Leads screen and the CSV export can
 * finally tell a property inquiry from a requirement proposal. Idempotent by the
 * partial unique indexes added in 0081: an accept, a re-accept and a continuity
 * answer all land on ONE row rather than stacking duplicates in the pipeline.
 */
export async function upsertLeadFromThread(threadId: string, patch: { stage?: string; activity?: string } = {}): Promise<void> {
  const { data } = await db()
    .from("chat_threads")
    .select("id,kind,buyer_id,poster_id,listing_id,requirement_id,project_id")
    .eq("id", threadId)
    .maybeSingle();
  const t = data as { kind: string; buyer_id: string; poster_id: string; listing_id: string | null; requirement_id: string | null; project_id: string | null } | null;
  if (!t) return;

  // Match on the SAME key the unique indexes use, so the lookup can never miss a
  // row the insert would then collide with.
  let find = db().from("leads").select("id,stage").eq("owner_id", t.poster_id).eq("lead_profile_id", t.buyer_id);
  find = t.listing_id ? find.eq("listing_id", t.listing_id)
    : t.project_id ? find.is("listing_id", null).eq("project_id", t.project_id)
    : t.requirement_id ? find.is("listing_id", null).eq("requirement_id", t.requirement_id)
    : find.is("listing_id", null).is("requirement_id", null);
  const { data: existing } = await find.maybeSingle();

  const activity = patch.activity ?? (t.kind === "proposal" ? "Proposal accepted" : "Inquiry accepted");
  if (existing) {
    const update: Record<string, unknown> = { last_activity: activity, last_activity_at: new Date().toISOString() };
    // Never drag a lead BACKWARDS: an accept on an already-progressed lead
    // refreshes its activity, it doesn't reset a Negotiation back to New.
    if (patch.stage) update.stage = patch.stage;
    await db().from("leads").update(update).eq("id", (existing as { id: string }).id);
    return;
  }
  await db().from("leads").insert({
    owner_id: t.poster_id,
    lead_profile_id: t.buyer_id,
    listing_id: t.listing_id,
    project_id: t.project_id,
    requirement_id: t.listing_id || t.project_id ? null : t.requirement_id,
    // 0081 made `project` a real lead source; a project chat is filed as one so
    // the Leads screen and the CSV export can tell it from a property inquiry.
    source: t.project_id ? "project" : t.kind === "proposal" ? "proposal" : "inquiry",
    stage: patch.stage ?? "new",
    last_activity: activity,
  });
}

async function seedParticipants(threadId: string, buyerId: string, posterId: string) {
  await db().from("thread_participants").upsert(
    [
      { thread_id: threadId, profile_id: buyerId, role: "buyer" },
      { thread_id: threadId, profile_id: posterId, role: "poster" },
    ],
    { onConflict: "thread_id,profile_id", ignoreDuplicates: true },
  );
}

// ---------------------------------------------------------------------------
// Requests (S2) — Doc7 §88
// ---------------------------------------------------------------------------

/**
 * The poster's incoming requests (pending threads). Split Verified / Others by
 * the sender's verification level. Proposal-variant carries the sender's number
 * AUTO (Doc2 §8.1); inquiry variant never carries a number (the poster only
 * receives the buyer's number after they accept and the buyer allows? — no:
 * the poster ALWAYS sees the buyer's number once accepted; here in the request
 * we show the trust strip only, number appears in-thread on accept).
 */
export async function getRequests(posterId: string) {
  const { data } = await db()
    .from("chat_threads")
    .select("*")
    .eq("poster_id", posterId)
    .eq("status", "pending")
    .order("last_message_at", { ascending: false });
  const threads = (data as ThreadRow[]) ?? [];

  const senderIds = threads.map((t) => t.buyer_id);
  const inquiryIds = threads.map((t) => t.source_inquiry_id).filter((x): x is string => !!x);
  const [people, levels, listings, reqs, inqData, projectData] = await Promise.all([
    profilesByIds(senderIds),
    verificationLevels(senderIds),
    listingsByIds(threads.flatMap((t) => [t.listing_id, t.attached_listing_id])),
    requirementsByIds(threads.map((t) => t.requirement_id).filter((x): x is string => !!x)),
    inquiryIds.length ? db().from("inquiries").select("id,intents").in("id", inquiryIds) : Promise.resolve({ data: [] as any[] }),
    // A project request would otherwise arrive with no subject at all — the
    // builder would see "someone wants to chat" and nothing about what.
    projectsByIds(threads.map((t: any) => t.project_id)),
  ]);
  // Intent chips ("Site visit?", "Negotiable?") the sender ticked (Doc4 §35).
  // Keys must match what the Inquiry sheet actually stores (components/feed/
  // sheets.tsx QUICK) — they didn't, so a ticked "Site visit?" reached the poster
  // as the raw string `site_visit`. Labels are the sheet's own labels verbatim.
  const INTENT_LABEL: Record<string, string> = {
    site_visit: "Site visit?", negotiable: "Negotiable?", documents: "Documents ready?", loan: "Loan available?",
  };
  const intentsByInquiry = new Map((inqData.data as { id: string; intents: string[] }[] ?? []).map((i) => [i.id, i.intents ?? []]));

  const cards = threads.map((t) => {
    const p = people.get(t.buyer_id);
    const level = levels.get(t.buyer_id) ?? null;
    const isProposal = t.kind === "proposal";
    const intents = (t.source_inquiry_id ? intentsByInquiry.get(t.source_inquiry_id) ?? [] : []).map((k) => INTENT_LABEL[k] ?? k);
    return {
      threadId: t.id,
      kind: t.kind,
      person: { ...personDTO(p, level), roleTag: roleTag(p?.role ?? null) },
      trust: p ? trustStrip(p, level) : null,
      message: t.last_message_preview ?? "",
      intents,
      timeLabel: timeAgo(t.last_message_at),
      // Sender's number is AUTO-visible to the poster on a proposal (Doc2 §8.1).
      senderNumber: isProposal && p ? p.phone : null,
      listingCard: listingCard(listings.get(t.listing_id ?? "")),
      attachedCard: listingCard(listings.get(t.attached_listing_id ?? "")),
      requirementCard: requirementCard(reqs.get(t.requirement_id ?? "")),
      projectCard: (() => {
        const pj = projectData.projects.get((t as any).project_id ?? "");
        return pj
          ? { id: pj.id, title: pj.name, priceLabel: projectData.prices.get(pj.id) ?? null, cover: pj.cover_url, status: pj.status, area: pj.area_label }
          : null;
      })(),
      verified: level === "id" || level === "rera",
    };
  });

  return {
    verified: cards.filter((c) => c.verified),
    others: cards.filter((c) => !c.verified),
    total: cards.length,
    verifiedCount: cards.filter((c) => c.verified).length,
    othersCount: cards.filter((c) => !c.verified).length,
  };
}

/** Accept a request → thread opens, seen-status starts now (Doc7 §89). */
export async function acceptRequest(threadId: string, posterId: string): Promise<{ ok: boolean }> {
  const { data } = await db().from("chat_threads").select("id,poster_id,status,source_inquiry_id,source_proposal_id")
    .eq("id", threadId).maybeSingle();
  const t = data as { id: string; poster_id: string; status: string; source_inquiry_id: string | null; source_proposal_id: string | null } | null;
  if (!t || t.poster_id !== posterId || t.status !== "pending") return { ok: false };
  await db().from("chat_threads").update({ status: "accepted" }).eq("id", threadId);
  // Accepting IS the lead. Until now a lead row only appeared if someone happened
  // to answer the post-number continuity prompt, so a broker could accept twenty
  // inquiries and open an empty pipeline — the Leads screen promised "every lead
  // on your listings" and delivered whatever the continuity chip had caught.
  await upsertLeadFromThread(threadId);
  // Poster's read cursor starts now so the request message isn't "unread noise".
  await db().from("thread_participants").update({ last_read_at: new Date().toISOString() }).eq("thread_id", threadId).eq("profile_id", posterId);
  if (t.source_inquiry_id) await db().from("inquiries").update({ status: "accepted" }).eq("id", t.source_inquiry_id);
  if (t.source_proposal_id) await db().from("proposals").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", t.source_proposal_id);
  // Tell the sender their inquiry/proposal was accepted — the chat is now open.
  const { data: buyer } = await db().from("chat_threads").select("buyer_id").eq("id", threadId).maybeSingle();
  const buyerId = (buyer as { buyer_id: string } | null)?.buyer_id;
  if (buyerId) {
    await notify({
      profileId: buyerId, type: "chat_accepted", actorId: posterId, threadId,
      title: `**${await nameOf(posterId)}** accepted your inquiry — you can chat now`,
      body: `${await nameOf(posterId)} accepted — you can chat now`,
      data: { threadId },
    });
    await pingInbox(buyerId);
  }
  await Promise.all([pingThread(threadId), pingInbox(posterId)]);
  return { ok: true };
}

/** Decline → 30-day cooldown on re-inquiry (Doc7 §90). */
export async function declineRequest(threadId: string, posterId: string): Promise<{ ok: boolean }> {
  const { data } = await db().from("chat_threads").select("id,buyer_id,poster_id,status,source_inquiry_id,source_proposal_id")
    .eq("id", threadId).maybeSingle();
  const t = data as any;
  if (!t || t.poster_id !== posterId || t.status !== "pending") return { ok: false };
  const until = new Date(Date.now() + DECLINE_COOLDOWN_DAYS * 86_400_000).toISOString();
  await db().from("chat_threads").update({ status: "declined", cooldown_until: until }).eq("id", threadId);
  if (t.source_inquiry_id) await db().from("inquiries").update({ status: "declined" }).eq("id", t.source_inquiry_id);
  if (t.source_proposal_id) await db().from("proposals").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", t.source_proposal_id);
  // The sender had no way to learn they'd been declined except by re-opening the
  // thread: accept notified them, decline said nothing and pushed nothing live.
  // Both sides of the decision now behave the same way.
  const cooldownDate = new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  await notify({
    profileId: t.buyer_id, type: "chat_declined", actorId: posterId, threadId,
    title: `**${await nameOf(posterId)}** declined your inquiry`,
    body: `You can send a new one after ${cooldownDate}`,
    data: { threadId, cooldownUntil: until },
  });
  await Promise.all([pingThread(threadId), pingInbox(t.buyer_id), pingInbox(posterId)]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Threads list — the 4 tabs (S1) — Doc7 §91
// ---------------------------------------------------------------------------

async function unreadMap(threadIds: string[], me: string, sinceByThread: Map<string, string>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!threadIds.length) return out;
  // One query, filter in memory (threads per user are bounded).
  const { data } = await db()
    .from("chat_messages")
    .select("thread_id,sender_id,created_at,deleted_all,deleted_for")
    .in("thread_id", threadIds)
    .neq("sender_id", me);
  for (const m of (data as any[] ?? [])) {
    if (m.deleted_all) continue;
    if (Array.isArray(m.deleted_for) && m.deleted_for.includes(me)) continue;
    const since = sinceByThread.get(m.thread_id) ?? "epoch";
    if (new Date(m.created_at) > new Date(since)) out.set(m.thread_id, (out.get(m.thread_id) ?? 0) + 1);
  }
  return out;
}

/**
 * 4-tab home. `tab` decides the scope; `grouping` returns per-listing/requirement
 * groups; `unreadOnly` filters. Pending inquiries appear only in `my-inquiries`
 * (as "waiting"); accepted threads populate all tabs.
 */
export async function getThreads(
  me: string,
  tab: Tab,
  opts: { grouping?: boolean; unreadOnly?: boolean; search?: string } = {},
) {
  // Scope per tab.
  let query = db().from("chat_threads").select("*");
  if (tab === "my-listings") query = query.eq("poster_id", me).eq("kind", "inquiry").eq("status", "accepted");
  else if (tab === "my-inquiries") query = query.eq("buyer_id", me).eq("kind", "inquiry").in("status", ["accepted", "pending", "declined"]);
  else if (tab === "requirement-leads") query = query.eq("poster_id", me).eq("kind", "proposal").eq("status", "accepted");
  else query = query.eq("buyer_id", me).eq("kind", "proposal"); // my-responses: all statuses (status strip)

  const { data } = await query.order("last_message_at", { ascending: false });
  let threads = (data as ThreadRow[]) ?? [];

  // Participant state (pin/mute/archive/last_read).
  const parts = await db().from("thread_participants").select("*").eq("profile_id", me).in("thread_id", threads.map((t) => t.id));
  const partMap = new Map((parts.data as any[] ?? []).map((p) => [p.thread_id, p]));
  // Hide archived from the main list (they live in the Archived sub-screen).
  threads = threads.filter((t) => !partMap.get(t.id)?.archived);

  const otherIds = threads.map((t) => (t.buyer_id === me ? t.poster_id : t.buyer_id));
  const [people, levels, listings, reqs] = await Promise.all([
    profilesByIds(otherIds),
    verificationLevels(otherIds),
    listingsByIds(threads.flatMap((t) => [t.listing_id, t.attached_listing_id])),
    requirementsByIds(threads.map((t) => t.requirement_id).filter((x): x is string => !!x)),
  ]);

  const sinceByThread = new Map(threads.map((t) => [t.id, partMap.get(t.id)?.last_read_at ?? "epoch"]));
  const unread = await unreadMap(threads.map((t) => t.id), me, sinceByThread);

  // Proposal status (my-responses status chips) needs the source proposal status.
  const propIds = threads.map((t) => t.source_proposal_id).filter(Boolean) as string[];
  const propStatus = new Map<string, string>();
  if (propIds.length) {
    const { data: pr } = await db().from("proposals").select("id,status").in("id", propIds);
    for (const p of (pr as any[] ?? [])) propStatus.set(p.id, p.status);
  }

  let rows = threads.map((t) => {
    const otherId = t.buyer_id === me ? t.poster_id : t.buyer_id;
    const p = people.get(otherId);
    const level = levels.get(otherId) ?? null;
    const part = partMap.get(t.id);
    const previewOwn = t.last_message_sender === me;
    const status = t.source_proposal_id ? propStatus.get(t.source_proposal_id) ?? t.status : t.status;
    return {
      threadId: t.id,
      kind: t.kind,
      person: { ...personDTO(p, level), roleTag: roleTag(p?.role ?? null) },
      listingId: t.listing_id,
      requirementId: t.requirement_id,
      listingCard: listingCard(listings.get(t.listing_id ?? "") || listings.get(t.attached_listing_id ?? "")),
      requirementCard: requirementCard(reqs.get(t.requirement_id ?? "")),
      preview: (previewOwn ? "You: " : "") + (t.last_message_kind === "photo" ? "Photo" : t.last_message_preview ?? ""),
      previewKind: t.last_message_kind,
      timeLabel: timeAgo(t.last_message_at),
      lastMessageAt: t.last_message_at,
      unread: unread.get(t.id) ?? 0,
      pinned: !!part?.pinned,
      muted: !!part?.muted,
      pending: t.status === "pending",
      declined: t.status === "declined",
      proposalStatus: t.kind === "proposal" ? status : null,
    };
  });

  if (opts.unreadOnly) rows = rows.filter((r) => r.unread > 0);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    rows = rows.filter(
      (r) => r.person.name.toLowerCase().includes(q) || (r.listingCard?.title ?? "").toLowerCase().includes(q) || r.preview.toLowerCase().includes(q),
    );
  }
  // Pinned first, then recency.
  rows.sort((a, b) => (a.pinned === b.pinned ? +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt) : a.pinned ? -1 : 1));

  // Proposal-status counts for Tab-4 strip.
  const statusCounts = tab === "my-responses"
    ? rows.reduce(
        (acc, r) => { const s = r.proposalStatus ?? "pending"; acc[s] = (acc[s] ?? 0) + 1; acc.all++; return acc; },
        { all: 0 } as Record<string, number>,
      )
    : null;

  if (!opts.grouping) return { grouped: false, rows, statusCounts };

  // Per-listing (tabs 1/2) or per-requirement (tabs 3/4) grouping.
  const byKey = new Map<string, { key: string; card: any; rows: typeof rows }>();
  for (const r of rows) {
    const keyId = tab === "requirement-leads" || tab === "my-responses" ? r.requirementId : r.listingId;
    const key = keyId ?? "none";
    if (!byKey.has(key)) byKey.set(key, { key, card: tab === "requirement-leads" || tab === "my-responses" ? r.requirementCard : r.listingCard, rows: [] });
    byKey.get(key)!.rows.push(r);
  }
  const groups = [...byKey.values()].map((g) => ({
    key: g.key,
    card: g.card,
    chatCount: g.rows.length,
    unreadCount: g.rows.reduce((n, r) => n + (r.unread > 0 ? 1 : 0), 0),
    rows: g.rows,
  }));
  return { grouped: true, groups, statusCounts };
}

// ---------------------------------------------------------------------------
// INBOX — the subject-grouped Messages home (two sections)
// ---------------------------------------------------------------------------

/**
 * The Messages screen is a list of SUBJECTS, not of people.
 *
 * Two sections, and a thread can only ever be in one of them:
 *   received — `poster_id = me`. Someone came to MY listing / project /
 *              requirement. (Pending ones are requests, surfaced by the
 *              requests strip and the Requests screen, not as cards here.)
 *   sent     — `buyer_id = me`. I went to SOMEONE ELSE'S post.
 *
 * Inside a section, threads are grouped by their one subject (0084 makes that
 * single by constraint) and each group carries a computed sentence — "4 buyers
 * asked about your property", "You offered 2 BHK Shela — ₹47 L · no reply for
 * 4 days". That sentence is server-computed for the same reason every other
 * number here is: the browser must not derive business truth.
 */
export type InboxSection = "received" | "sent";

interface SubjectDTO {
  kind: "listing" | "project" | "requirement";
  id: string;
  title: string;          // FULL title — the client never truncates it
  cover: string | null;
  priceLabel: string | null;
  meta: string | null;    // "Satellite · listed by you" / "by Kiran Mehta"
  href: string;           // tapping the card opens the real post
  gone: boolean;          // subject deleted/expired — the chat outlives it
}

/** Unit labels ("3 BHK") for the threads that named one — 0087. */
async function unitLabels(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const { data } = await db().from("project_units").select("id,unit_type").in("id", uniq);
  return new Map((data as { id: string; unit_type: string }[] ?? []).map((u) => [u.id, u.unit_type]));
}

async function projectsByIds(ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return { projects: new Map<string, any>(), prices: new Map<string, string>() };
  const [{ data }, { data: units }] = await Promise.all([
    db().from("projects").select("id,name,cover_url,area_label,status,build_status,profile_id").in("id", uniq),
    db().from("project_units").select("project_id,price_from_paise").in("project_id", uniq),
  ]);
  // Price range is the units' own min–max; a project has no price of its own.
  const byProject = new Map<string, number[]>();
  for (const u of (units as { project_id: string; price_from_paise: number | null }[] ?? [])) {
    if (!u.price_from_paise) continue;
    byProject.set(u.project_id, [...(byProject.get(u.project_id) ?? []), Number(u.price_from_paise)]);
  }
  const prices = new Map<string, string>();
  for (const [id, list] of byProject) {
    const lo = Math.min(...list), hi = Math.max(...list);
    prices.set(id, lo === hi ? formatShortRupees(lo) : `${formatShortRupees(lo)} – ${formatShortRupees(hi)}`);
  }
  return { projects: new Map((data as any[] ?? []).map((p) => [p.id, p])), prices };
}

/** A requirement written as a sentence, not a code string. */
function requirementTitle(r: any): string {
  if (!r) return "Requirement";
  const bhk = r.bhk ? `${r.bhk} BHK` : "property";
  const how = r.kind === "rent" ? " on rent" : "";
  const where = r.area_label ? ` in ${r.area_label}` : "";
  const max = r.budget_max_paise ? ` under ${formatShortRupees(Number(r.budget_max_paise))}` : "";
  return `Looking for ${bhk}${how}${where}${max}`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export async function getInbox(me: string, section: InboxSection, opts: { search?: string } = {}) {
  const { data } = await db()
    .from("chat_threads")
    .select("*")
    .or(`buyer_id.eq.${me},poster_id.eq.${me}`)
    .order("last_message_at", { ascending: false });
  const all = (data as ThreadRow[] & { project_id: string | null }[]) ?? [];

  const parts = await db().from("thread_participants").select("*").eq("profile_id", me).in("thread_id", all.map((t) => t.id));
  const partMap = new Map((parts.data as any[] ?? []).map((p) => [p.thread_id, p]));
  const live = all.filter((t) => !partMap.get(t.id)?.archived);

  const unread = await unreadMap(
    live.map((t) => t.id),
    me,
    new Map(live.map((t) => [t.id, partMap.get(t.id)?.last_read_at ?? "epoch"])),
  );

  // Both section counts, always — they are the two segment sub-labels.
  const inReceived = (t: any) => t.poster_id === me && t.status !== "pending";
  const inSent = (t: any) => t.buyer_id === me;
  const counts = {
    received: {
      chats: live.filter(inReceived).length,
      unread: live.filter((t) => inReceived(t) && (unread.get(t.id) ?? 0) > 0).length,
    },
    sent: {
      chats: live.filter(inSent).length,
      unread: live.filter((t) => inSent(t) && (unread.get(t.id) ?? 0) > 0).length,
    },
  };

  const threads = live.filter(section === "received" ? inReceived : inSent);

  const otherIds = threads.map((t) => (t.buyer_id === me ? t.poster_id : t.buyer_id));
  const [people, levels, listings, reqs, projectData, units] = await Promise.all([
    profilesByIds(otherIds),
    verificationLevels(otherIds),
    listingsByIds(threads.flatMap((t: any) => [t.listing_id, t.attached_listing_id])),
    requirementsByIds(threads.map((t) => t.requirement_id).filter((x): x is string => !!x)),
    projectsByIds(threads.map((t: any) => t.project_id)),
    unitLabels(threads.map((t: any) => t.unit_id)),
  ]);
  const { projects, prices } = projectData;

  // Proposal status drives the per-row state chip on requirement threads.
  const propIds = threads.map((t) => t.source_proposal_id).filter(Boolean) as string[];
  const propStatus = new Map<string, string>();
  if (propIds.length) {
    const { data: pr } = await db().from("proposals").select("id,status").in("id", propIds);
    for (const p of (pr as any[] ?? [])) propStatus.set(p.id, p.status);
  }

  const rows = threads.map((t: any) => {
    const otherId = t.buyer_id === me ? t.poster_id : t.buyer_id;
    const p = people.get(otherId);
    const level = levels.get(otherId) ?? null;
    const part = partMap.get(t.id);
    const previewOwn = t.last_message_sender === me;
    const status = t.source_proposal_id ? propStatus.get(t.source_proposal_id) ?? t.status : t.status;

    // The subject — exactly one of the three.
    const listing = listings.get(t.listing_id ?? "");
    const project = projects.get(t.project_id ?? "");
    const requirement = reqs.get(t.requirement_id ?? "");
    const attached = listings.get(t.attached_listing_id ?? "");

    let subject: SubjectDTO;
    if (project) {
      subject = {
        kind: "project", id: project.id, title: project.name,
        cover: project.cover_url, priceLabel: prices.get(project.id) ?? null,
        meta: [project.area_label, section === "received" ? "your project" : null].filter(Boolean).join(" · ") || null,
        href: `/projects/${project.id}`,
        gone: project.status !== "live",
      };
    } else if (listing) {
      subject = {
        kind: "listing", id: listing.id, title: listing.title,
        cover: listing.cover_url,
        priceLabel: listing.price_on_request ? "Price on request" : formatShortRupees(Number(listing.price_paise ?? 0)),
        meta: [listing.area_label, section === "received" ? "listed by you" : p ? `by ${p.name ?? "owner"}` : null].filter(Boolean).join(" · ") || null,
        href: `/property/${listing.id}`,
        gone: listing.status !== "live",
      };
    } else if (requirement) {
      subject = {
        kind: "requirement", id: requirement.id, title: requirementTitle(requirement),
        cover: null, priceLabel: null,
        meta: section === "received" ? "your requirement" : p ? `by ${p.name ?? "poster"}` : null,
        href: `/requirements/${requirement.id}`,
        gone: requirement.status === "expired" || !requirement.is_active,
      };
    } else {
      // The post was deleted; `on delete set null` keeps the conversation.
      subject = {
        kind: t.kind === "proposal" ? "requirement" : "listing", id: "",
        title: "This post was removed", cover: null, priceLabel: null,
        meta: null, href: "", gone: true,
      };
    }

    return {
      threadId: t.id,
      subject,
      subjectKey: project?.id ?? listing?.id ?? requirement?.id ?? `gone:${t.id}`,
      attachedTitle: attached?.title ?? null,
      attachedPrice: attached ? (attached.price_on_request ? "Price on request" : formatShortRupees(Number(attached.price_paise ?? 0))) : null,
      person: { ...personDTO(p, level), roleTag: roleTag(p?.role ?? null) },
      // "3 BHK ·" in front of the snippet — a builder's first question about any
      // message on a scheme. Null when the chat is about the whole project.
      unitLabel: units.get(t.unit_id ?? "") ?? null,
      preview: t.last_message_kind === "photo" ? "Photo" : t.last_message_preview ?? "",
      previewOwn,
      timeLabel: timeAgo(t.last_message_at),
      lastMessageAt: t.last_message_at,
      idleDays: daysSince(t.last_message_at),
      unread: unread.get(t.id) ?? 0,
      muted: !!part?.muted,
      pinned: !!part?.pinned,
      pending: t.status === "pending",
      declined: t.status === "declined",
      proposalStatus: t.kind === "proposal" ? status : null,
    };
  });

  // Search filters the ROWS; a group survives if any of its rows match.
  const q = opts.search?.trim().toLowerCase();
  const kept = q
    ? rows.filter((r) => r.person.name.toLowerCase().includes(q) || r.subject.title.toLowerCase().includes(q) || r.preview.toLowerCase().includes(q))
    : rows;

  const byKey = new Map<string, typeof kept>();
  for (const r of kept) byKey.set(r.subjectKey, [...(byKey.get(r.subjectKey) ?? []), r]);

  const groups = [...byKey.entries()].map(([key, list]) => {
    const first = list[0];
    const unreadCount = list.reduce((n, r) => n + (r.unread > 0 ? 1 : 0), 0);
    const n = list.length;
    const kind = first.subject.kind;

    // ── the one sentence that explains the card ──────────────────────────────
    let summary: string;
    if (section === "received") {
      summary =
        kind === "requirement"
          ? `${n} ${n === 1 ? "person offered" : "people offered"} you a property`
          : `${n} ${n === 1 ? "buyer asked" : "buyers asked"} about your ${kind === "project" ? "project" : "property"}`;
    } else if (kind === "requirement") {
      summary = first.attachedTitle
        ? `You offered ${first.attachedTitle}${first.attachedPrice ? ` — ${first.attachedPrice}` : ""}`
        : "You sent a proposal";
    } else {
      summary = `You asked about this ${kind === "project" ? "project" : "property"}`;
    }

    // ── the qualifier after it ───────────────────────────────────────────────
    const newest = list.reduce((a, b) => (a.lastMessageAt > b.lastMessageAt ? a : b));
    let detail: string | null = null;
    if (unreadCount > 0) detail = `${unreadCount} unread`;
    else if (newest.previewOwn && newest.idleDays >= 2) detail = `no reply for ${newest.idleDays} days`;
    else if (list.every((r) => r.pending)) detail = "waiting to be accepted";

    return {
      key,
      subject: first.subject,
      direction: section === "received" ? "in" : "out",
      summary,
      detail,
      chatCount: n,
      unreadCount,
      lastMessageAt: newest.lastMessageAt,
      rows: list.sort((a, b) => (a.pinned === b.pinned ? +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt) : a.pinned ? -1 : 1)),
    };
  });

  groups.sort((a, b) => (b.unreadCount - a.unreadCount) || (+new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)));

  return { section, counts, groups };
}

/** Requests-row summary shown atop every tab. */
export async function requestsSummary(posterId: string) {
  const { data } = await db().from("chat_threads").select("id,buyer_id").eq("poster_id", posterId).eq("status", "pending");
  const threads = (data as { id: string; buyer_id: string }[]) ?? [];
  const levels = await verificationLevels(threads.map((t) => t.buyer_id));
  const verified = threads.filter((t) => { const l = levels.get(t.buyer_id); return l === "id" || l === "rera"; }).length;
  return { total: threads.length, verified, others: threads.length - verified };
}

/** Unread total across every accepted thread — the bottom-nav + header badge. */
/**
 * Live conversations this profile is in — the P9 stat tile that replaced Views
 * for builders. Accepted threads only (a pending inquiry is not a conversation
 * yet) and archived-by-me threads are excluded, so the number matches what the
 * Messages screen actually opens with.
 */
export async function countThreads(me: string): Promise<number> {
  const { data } = await db()
    .from("chat_threads")
    .select("id")
    .or(`buyer_id.eq.${me},poster_id.eq.${me}`)
    .eq("status", "accepted");
  const ids = ((data as { id: string }[]) ?? []).map((t) => t.id);
  if (!ids.length) return 0;

  const parts = await db()
    .from("thread_participants")
    .select("thread_id,archived")
    .eq("profile_id", me)
    .in("thread_id", ids)
    .eq("archived", true);
  const archived = new Set(((parts.data as { thread_id: string }[]) ?? []).map((p) => p.thread_id));
  return ids.filter((id) => !archived.has(id)).length;
}

export async function unreadTotal(me: string): Promise<number> {
  const { data } = await db().from("chat_threads").select("id").or(`buyer_id.eq.${me},poster_id.eq.${me}`).eq("status", "accepted");
  const ids = (data as { id: string }[] ?? []).map((t) => t.id);
  if (!ids.length) return 0;
  const parts = await db().from("thread_participants").select("thread_id,last_read_at,archived").eq("profile_id", me).in("thread_id", ids);
  const since = new Map((parts.data as any[] ?? []).map((p) => [p.thread_id, p.archived ? null : p.last_read_at]));
  const active = ids.filter((id) => since.get(id) !== null);
  const unread = await unreadMap(active, me, new Map(active.map((id) => [id, since.get(id) ?? "epoch"])));
  let total = 0;
  for (const n of unread.values()) total += n > 0 ? 1 : 0; // count of threads with unread (badge = chats, not messages)
  return total;
}

// ---------------------------------------------------------------------------
// Archived chats (S1 ⋯ → Archived) — all archived threads across every tab.
// ---------------------------------------------------------------------------
export async function getArchivedThreads(me: string) {
  const parts = await db().from("thread_participants").select("thread_id,last_read_at").eq("profile_id", me).eq("archived", true);
  const ids = (parts.data as { thread_id: string; last_read_at: string }[] ?? []).map((p) => p.thread_id);
  if (!ids.length) return { rows: [] as any[] };
  const readMap = new Map((parts.data as any[]).map((p) => [p.thread_id, p.last_read_at]));

  const { data } = await db().from("chat_threads").select("*").in("id", ids).order("last_message_at", { ascending: false });
  const threads = (data as ThreadRow[]) ?? [];
  const otherIds = threads.map((t) => (t.buyer_id === me ? t.poster_id : t.buyer_id));
  const [people, levels, listings, reqs] = await Promise.all([
    profilesByIds(otherIds),
    verificationLevels(otherIds),
    listingsByIds(threads.flatMap((t) => [t.listing_id, t.attached_listing_id])),
    requirementsByIds(threads.map((t) => t.requirement_id).filter((x): x is string => !!x)),
  ]);
  const unread = await unreadMap(ids, me, new Map(threads.map((t) => [t.id, readMap.get(t.id) ?? "epoch"])));

  const rows = threads.map((t) => {
    const otherId = t.buyer_id === me ? t.poster_id : t.buyer_id;
    const p = people.get(otherId);
    const level = levels.get(otherId) ?? null;
    const previewOwn = t.last_message_sender === me;
    return {
      threadId: t.id,
      person: { ...personDTO(p, level), roleTag: roleTag(p?.role ?? null) },
      listingCard: listingCard(listings.get(t.listing_id ?? "") || listings.get(t.attached_listing_id ?? "")),
      requirementCard: requirementCard(reqs.get(t.requirement_id ?? "")),
      preview: (previewOwn ? "You: " : "") + (t.last_message_kind === "photo" ? "Photo" : t.last_message_preview ?? ""),
      previewKind: t.last_message_kind,
      timeLabel: timeAgo(t.last_message_at),
      unread: unread.get(t.id) ?? 0,
      pending: t.status === "pending",
      declined: t.status === "declined",
    };
  });
  return { rows };
}

// ---------------------------------------------------------------------------
// Blocked users (S1 ⋯ → Blocked users) — everyone I've blocked, + unblock.
// ---------------------------------------------------------------------------
export async function getBlockedUsers(me: string) {
  const { data } = await db().from("chat_blocks").select("blocked_id,created_at").eq("blocker_id", me).order("created_at", { ascending: false });
  const rows = (data as { blocked_id: string; created_at: string }[]) ?? [];
  const people = await profilesByIds(rows.map((r) => r.blocked_id));
  const levels = await verificationLevels(rows.map((r) => r.blocked_id));
  return {
    users: rows.map((r) => {
      const p = people.get(r.blocked_id);
      return { ...personDTO(p, levels.get(r.blocked_id) ?? null), roleTag: roleTag(p?.role ?? null), blockedAt: timeAgo(r.created_at) };
    }),
  };
}

/** Unblock a user directly (from the Blocked-users screen, not a thread). */
export async function unblockUserById(me: string, userId: string): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(userId)) return { ok: false };
  await db().from("chat_blocks").delete().eq("blocker_id", me).eq("blocked_id", userId);
  return { ok: true };
}

/**
 * Block a user directly from their profile (P9 ⋯ → Block), no thread required.
 * This is the safety-critical path A4 flagged: the profile button used to only
 * toast, so a user who "blocked" someone was never actually protected. Idempotent.
 */
export async function blockUserById(me: string, userId: string): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(userId) || userId === me) return { ok: false };
  await db().from("chat_blocks").upsert(
    { blocker_id: me, blocked_id: userId },
    { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
  );
  return { ok: true };
}

const USER_REPORT_REASONS = new Set(["spam", "fake", "abusive", "fraud", "other"]);

/**
 * Report a user from their profile (P9 ⋯ → Report profile). Persists a
 * `reports` row (`subject_type='user'`) for the P11 admin queue; the button used
 * to claim "Report submitted" while saving nothing. One open report per
 * (reporter, user) — a re-report is a no-op (unique index).
 */
export async function reportUserById(me: string, userId: string, reason: string, note: string | null): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(userId) || userId === me) return { ok: false };
  const r = USER_REPORT_REASONS.has(reason) ? reason : "other";
  await db().from("reports").upsert(
    { reporter_id: me, subject_type: "user", subject_id: userId, reason: r, note: note?.slice(0, 1000) ?? null, status: "open" },
    { onConflict: "reporter_id,subject_type,subject_id", ignoreDuplicates: true },
  );
  return { ok: true };
}

export { PAGE, MESSAGE_MAX, UUID_RE };
