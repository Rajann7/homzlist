import "server-only";
import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { consumeQuota, releaseQuota } from "@/lib/billing/service";
import { notify } from "@/lib/notifications/service";
import { requirementBrief } from "@/lib/notifications/subjects";
import { timeAgo } from "./matching";

/**
 * Proposals (Doc2 §8.1, Doc7 §70-75).
 *
 * A proposal is a sender's offer on someone else's requirement — either "I have
 * a property" (attach a live listing) or "Can we chat". The POSTER receives them
 * unlimited while their plan is active; the SENDER spends one `proposal` quota
 * unit per send.
 *
 * The subtle rules, all enforced HERE (never in the browser):
 *   - self-proposal blocked (Doc2 §8.1)
 *   - duplicate guard: one live proposal per (requirement, sender) — the unique
 *     index in 0025 is the wall, this returns a clean reason
 *   - atomic quota: consume FIRST, insert wrapped so a failure releases the draw
 *     (the 0024 strand-safety pattern) — a proposal with no plan behind it can
 *     never exist, and a spent unit is never stranded
 *   - balance 0 → NEED_TOPUP (no write); the client opens the inline top-up sheet
 *   - the number rule (Doc2 §8.2): the poster's payload includes the SENDER's
 *     phone automatically; the sender's payload never carries a number
 */

const db = () => createServiceClient();

/** 30-day proposal life (Doc2 §8.1). */
export const PROPOSAL_DAYS = 30;
const MESSAGE_MAX = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProposalRow {
  id: string;
  requirement_id: string;
  sender_id: string;
  poster_id: string;
  mode: "listing" | "chat";
  listing_id: string | null;
  message: string;
  status: "pending" | "accepted" | "declined" | "not_relevant" | "expired" | "fulfilled";
  consumption_id: string | null;
  thread_id: string | null;
  responded_at: string | null;
  expires_at: string;
  created_at: string;
}

export type SendResult =
  | { ok: true; proposal: ProposalRow }
  | { ok: false; reason: "self" | "duplicate" | "not_open" | "bad_listing" | "validation" | "needs_live_project" }
  | { ok: false; reason: "need_topup"; balance: number };

/**
 * A builder reaches requirements THROUGH a published project, never on its own
 * (Rajan, 29 Jul 2026 — supersedes Doc2 §2's "Builder ₹2,999" row).
 *
 * The plan half is a catalog fact: migration 0087 dropped 'builder' from
 * p2999.roles, so `getCatalog` hides it and checkout/quote 403 it with no new
 * code. This is the OTHER half — buying ₹9,999 is not the same as having a
 * project people can answer, and a proposal from a builder whose project is
 * still in review points the poster at something they cannot open.
 *
 * `live` only: a draft, a pending_review or a taken-down project all mean the
 * same thing to the person receiving the proposal — there is nothing to see.
 */
export async function builderMayPropose(senderId: string): Promise<boolean> {
  const { data: prof } = await db().from("profiles").select("role").eq("id", senderId).maybeSingle();
  if ((prof as { role: string | null } | null)?.role !== "builder") return true;
  const { count } = await db()
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", senderId)
    .eq("status", "live");
  return (count ?? 0) > 0;
}

/** Current pooled proposal balance (server truth for the sheet's "N remaining"). */
export async function proposalBalance(profileId: string): Promise<{ left: number; total: number; unlimited: boolean }> {
  const { data } = await db()
    .from("user_plans")
    .select("proposal_quota, proposal_used")
    .eq("profile_id", profileId)
    .eq("status", "active");
  const rows = (data ?? []) as { proposal_quota: number; proposal_used: number }[];
  if (rows.some((r) => r.proposal_quota < 0)) return { left: -1, total: -1, unlimited: true };
  const left = rows.reduce((n, r) => n + Math.max(0, r.proposal_quota - r.proposal_used), 0);
  const total = rows.reduce((n, r) => n + Math.max(0, r.proposal_quota), 0);
  return { left, total, unlimited: false };
}

/** Per-requirement proposal stats for the My-Requirements card ("12 · 4 new"). */
export async function requirementProposalStats(requirementId: string): Promise<{ total: number; newCount: number }> {
  const { data } = await db()
    .from("proposals")
    .select("status, responded_at")
    .eq("requirement_id", requirementId);
  const rows = (data ?? []) as { status: string; responded_at: string | null }[];
  const total = rows.length;
  const newCount = rows.filter((r) => r.status === "pending" && r.responded_at === null).length;
  return { total, newCount };
}

const PREFILL: Record<"listing" | "chat", string> = {
  listing: "Hi, I have a property that matches your requirement. Take a look — happy to share more details or arrange a visit.",
  chat: "Hi, I have a few options that match your requirement. Can we discuss your needs?",
};

/**
 * Send a proposal. The order is load-bearing: every gate that can say "no
 * without spending" runs BEFORE the quota draw; the draw is the last thing
 * before the insert, and the insert is wrapped so a failure hands the unit back.
 */
export async function sendProposal(
  senderId: string,
  requirementId: string,
  input: { mode: "listing" | "chat"; listingId?: string | null; message?: string | null },
): Promise<SendResult> {
  // The requirement must be live AND receiving (Doc2 §7: OFF/expired stop
  // proposals). Reading the poster here also gives us the self-block target.
  const { data: reqData } = await db()
    .from("requirements")
    .select("id, profile_id, status, is_active")
    .eq("id", requirementId)
    .maybeSingle();
  const req = reqData as { id: string; profile_id: string; status: string; is_active: boolean } | null;
  if (!req || req.status !== "live" || !req.is_active) return { ok: false, reason: "not_open" };

  if (req.profile_id === senderId) return { ok: false, reason: "self" };

  // Checked BEFORE the quota draw: a builder with no live project must not have
  // a proposal unit spent (and then refunded) to be told no.
  if (!(await builderMayPropose(senderId))) return { ok: false, reason: "needs_live_project" };

  // Duplicate guard (also enforced by the unique index — this is the friendly path).
  const { data: dup } = await db()
    .from("proposals")
    .select("id")
    .eq("requirement_id", requirementId)
    .eq("sender_id", senderId)
    .in("status", ["pending", "accepted"])
    .maybeSingle();
  if (dup) return { ok: false, reason: "duplicate" };

  const mode = input.mode === "listing" ? "listing" : "chat";
  let listingId: string | null = null;
  if (mode === "listing") {
    const raw = input.listingId ?? null;
    if (!raw || !UUID_RE.test(raw)) return { ok: false, reason: "bad_listing" };
    // The attached listing must be the SENDER's own live listing — never trust
    // the id the client sent.
    const { data: own } = await db()
      .from("listings")
      .select("id")
      .eq("id", raw)
      .eq("profile_id", senderId)
      .eq("status", "live")
      .maybeSingle();
    if (!own) return { ok: false, reason: "bad_listing" };
    listingId = raw;
  }

  const message = (input.message ?? "").trim().slice(0, MESSAGE_MAX) || PREFILL[mode];

  // Mint the id up front so the quota consumption row can reference this exact
  // proposal (ref_id), which lets the create-race refund target it precisely.
  const proposalId = randomUUID();

  const userPlanId = await consumeQuota(senderId, "proposal", 1, {
    type: "proposal",
    id: proposalId,
    note: "Proposal sent",
  });
  if (!userPlanId) {
    const bal = await proposalBalance(senderId);
    return { ok: false, reason: "need_topup", balance: bal.left };
  }

  // From here the unit is SPENT. Anything that throws must release it (0024).
  try {
    const consumptionId = await consumptionIdFor(proposalId);
    const now = new Date();
    const expires = new Date(now.getTime() + PROPOSAL_DAYS * 86_400_000);

    const { data, error } = await db()
      .from("proposals")
      .insert({
        id: proposalId,
        requirement_id: requirementId,
        sender_id: senderId,
        poster_id: req.profile_id,
        mode,
        listing_id: listingId,
        message,
        status: "pending",
        consumption_id: consumptionId,
        expires_at: expires.toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    // A proposal IS a chat request, exactly like an inquiry — so its thread is
    // born HERE, not on accept. It used to be created only when the poster
    // accepted, which meant three things silently didn't work:
    //   • the poster was never notified a proposal had arrived (the
    //     `proposal_received` notification lives in ensureProposalThread, so it
    //     fired at accept-time, at the person who had just accepted it);
    //   • a pending proposal never reached the Message Requests screen;
    //   • "My Responses" reads chat threads, so the sender's own tab — and its
    //     whole pending/declined/expired status strip — was permanently empty.
    // Best-effort: the proposal itself is already committed and the unit spent,
    // so a realtime/notification hiccup must not fail the send.
    try {
      const { ensureProposalThread } = await import("@/lib/chat/service");
      await ensureProposalThread(data as any);
    } catch { /* the P8 proposals screen still shows it; accept re-ensures */ }

    return { ok: true, proposal: data as ProposalRow };
  } catch (e) {
    await releaseQuota(senderId, userPlanId, "proposal", 1, "Proposal create failed");
    // A unique-violation here means a concurrent duplicate raced us past the
    // pre-check — report it as the duplicate it is, unit already handed back.
    if ((e as { code?: string }).code === "23505") return { ok: false, reason: "duplicate" };
    throw e;
  }
}

/** The plan_consumptions row consume_quota just wrote for this proposal. */
async function consumptionIdFor(proposalId: string): Promise<string | null> {
  const { data } = await db()
    .from("plan_consumptions")
    .select("id")
    .eq("ref_type", "proposal")
    .eq("ref_id", proposalId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ---- Poster view: proposals received on a requirement (Doc7 §71) -----------

export interface ReceivedProposal {
  id: string;
  status: ProposalRow["status"];
  message: string;
  sentAgo: string;
  isNew: boolean;
  sender: {
    id: string;
    name: string;
    role: string | null;
    verified: { phone: boolean; id: boolean; rera: boolean };
    memberSince: string;
    profilePct: number;
    /** THE number rule — poster sees the sender's number automatically. */
    phone: string;
  };
  listing: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null } | null;
  /** Chat grown from this proposal (set once accepted) — powers "Open chat". */
  threadId: string | null;
}

/**
 * Every proposal on a requirement the caller OWNS, sender number auto-included.
 * Ownership is the gate: `posterId` scopes the query, so another user's
 * requirement returns an empty list rather than leaking a single number.
 */
export async function proposalsForRequirement(requirementId: string, posterId: string): Promise<ReceivedProposal[] | null> {
  // Confirm ownership first — a non-owner gets null (→ 404), not [].
  const { data: reqOwn } = await db()
    .from("requirements")
    .select("id")
    .eq("id", requirementId)
    .eq("profile_id", posterId)
    .maybeSingle();
  if (!reqOwn) return null;

  const { data } = await db()
    .from("proposals")
    .select("*")
    .eq("requirement_id", requirementId)
    .eq("poster_id", posterId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as ProposalRow[];
  if (!rows.length) return [];

  // Resolve senders + their listings in bulk.
  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  const listingIds = rows.map((r) => r.listing_id).filter((x): x is string => Boolean(x));

  const [{ data: profs }, { data: vers }, { data: listings }] = await Promise.all([
    db().from("profiles").select("id,name,role,phone,bio,photo_url,email,city_id,created_at").in("id", senderIds),
    db().from("verifications").select("profile_id,level,status").in("profile_id", senderIds),
    listingIds.length
      ? db().from("listings").select("id,title,price_paise,price_on_request,area_label,cover_url").in("id", listingIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const verMap = new Map<string, { phone: boolean; id: boolean; rera: boolean }>();
  for (const v of (vers ?? []) as { profile_id: string; level: string; status: string }[]) {
    const cur = verMap.get(v.profile_id) ?? { phone: false, id: false, rera: false };
    if (v.status === "approved") (cur as any)[v.level] = true;
    verMap.set(v.profile_id, cur);
  }
  const listMap = new Map((listings ?? []).map((l: any) => [l.id, l]));

  return rows.map((r) => {
    const p: any = profMap.get(r.sender_id) ?? {};
    const l: any = r.listing_id ? listMap.get(r.listing_id) : null;
    return {
      id: r.id,
      status: r.status,
      message: r.message,
      sentAgo: timeAgo(r.created_at),
      isNew: r.status === "pending" && r.responded_at === null,
      sender: {
        id: r.sender_id,
        name: p.name ?? "HomzList user",
        role: p.role ?? null,
        verified: verMap.get(r.sender_id) ?? { phone: false, id: false, rera: false },
        memberSince: memberSince(p.created_at),
        profilePct: profileCompleteness(p),
        phone: p.phone ?? "",
      },
      listing: l
        ? {
            id: l.id,
            title: l.title,
            priceLabel: l.price_on_request ? "Price on request" : priceLabel(l.price_paise),
            areaLabel: l.area_label,
            coverUrl: l.cover_url,
          }
        : null,
      threadId: r.thread_id,
    };
  });
}

// ---- Sender view: my proposals sent (Doc7 §72) -----------------------------

export interface SentProposal {
  id: string;
  requirementId: string;
  status: ProposalRow["status"];
  requirementRef: string;
  poster: { name: string; role: string | null };
  listing: { title: string | null; priceLabel: string; coverUrl: string | null } | null;
  sentAt: string;
  /** status-specific footer copy incl. the non-refund note where it applies */
  footnote: string;
  nonRefund: boolean;
  /** Chat grown once the poster accepted — powers "Open chat". */
  threadId: string | null;
}

export async function myProposals(senderId: string): Promise<SentProposal[]> {
  const { data } = await db()
    .from("proposals")
    .select("*")
    .eq("sender_id", senderId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as ProposalRow[];
  if (!rows.length) return [];

  const reqIds = [...new Set(rows.map((r) => r.requirement_id))];
  const posterIds = [...new Set(rows.map((r) => r.poster_id))];
  const listingIds = rows.map((r) => r.listing_id).filter((x): x is string => Boolean(x));

  const [{ data: reqs }, { data: profs }, { data: listings }] = await Promise.all([
    db().from("requirements").select("id,bhk,kind,budget_min_paise,budget_max_paise,area_label").in("id", reqIds),
    db().from("profiles").select("id,name,role").in("id", posterIds),
    listingIds.length
      ? db().from("listings").select("id,title,price_paise,price_on_request,cover_url").in("id", listingIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const reqMap = new Map((reqs ?? []).map((r: any) => [r.id, r]));
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const listMap = new Map((listings ?? []).map((l: any) => [l.id, l]));

  return rows.map((r) => {
    const req: any = reqMap.get(r.requirement_id) ?? {};
    const poster: any = profMap.get(r.poster_id) ?? {};
    const l: any = r.listing_id ? listMap.get(r.listing_id) : null;
    return {
      id: r.id,
      requirementId: r.requirement_id,
      status: r.status,
      requirementRef: reqRef(req),
      poster: { name: poster.name ?? "HomzList user", role: poster.role ?? null },
      listing: l
        ? { title: l.title, priceLabel: l.price_on_request ? "Price on request" : priceLabel(l.price_paise), coverUrl: l.cover_url }
        : null,
      sentAt: new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }),
      footnote: sentFootnote(r),
      nonRefund: r.status === "declined" || r.status === "expired",
      threadId: r.thread_id,
    };
  });
}

// ---- Poster actions: accept / decline / not-relevant (Doc7 §73-75) ---------

export type ActResult = { ok: true; status: ProposalRow["status"]; flagged?: boolean; threadId?: string | null } | { ok: false; reason: "not_found" | "not_pending" };

/** Shared owner-scoped status flip; only a PENDING proposal can be acted on. */
async function actOnProposal(proposalId: string, posterId: string, status: "accepted" | "declined" | "not_relevant") {
  const { data } = await db()
    .from("proposals")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("poster_id", posterId)
    .eq("status", "pending")
    .select("id, sender_id, requirement_id")
    .maybeSingle();
  return (data as { id: string; sender_id: string; requirement_id: string } | null) ?? null;
}

/** Accept → chat opens (Module 6). Here we record the acceptance + reveal path. */
export async function acceptProposal(proposalId: string, posterId: string): Promise<ActResult> {
  const row = await actOnProposal(proposalId, posterId, "accepted");
  if (!row) return { ok: false, reason: "not_found" };
  // Module 7: accept opens the chat. Grow (or revive) the thread from the proposal.
  const { data: p } = await db()
    .from("proposals")
    .select("id,sender_id,poster_id,requirement_id,mode,listing_id,message,status")
    .eq("id", proposalId)
    .maybeSingle();
  let threadId: string | null = null;
  if (p) {
    // The thread already exists (created at send time); this re-ensures it for
    // any proposal predating that change, then opens it.
    const { ensureProposalThread, upsertLeadFromThread } = await import("@/lib/chat/service");
    threadId = await ensureProposalThread(p as any);
    await db().from("chat_threads").update({ status: "accepted" }).eq("id", threadId);
    // Accepting here must produce the same pipeline lead as accepting from the
    // Messages screen — one behaviour, two doors.
    await upsertLeadFromThread(threadId, { activity: "Proposal accepted" });
  }
  // Doc2 §14 catalog: "proposal received/accepted/declined/expired". The SENDER
  // has been waiting on this answer; without a notification the only way to
  // learn it was to keep re-opening the proposals screen.
  await notify({
    profileId: row.sender_id, type: "proposal_accepted", actorId: posterId, threadId,
    title: `Your proposal was **accepted** — ${(await requirementBrief(row.requirement_id)).title}`,
    body: "The chat is open. Reply to keep it moving.",
    entityKind: "requirement", entityId: row.requirement_id,
    data: { proposalId, requirementId: row.requirement_id, threadId },
  });
  return { ok: true, status: "accepted", threadId };
}

/**
 * Close the proposal's chat thread when the poster says no. Without this the
 * thread stayed `pending` forever: it kept sitting in the poster's Message
 * Requests after they had already declined it on the Proposals screen, and the
 * sender's "My Responses" row still read as waiting.
 */
async function closeProposalThread(proposalId: string): Promise<void> {
  const { data } = await db().from("chat_threads").select("id").eq("source_proposal_id", proposalId).maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (id) await db().from("chat_threads").update({ status: "declined" }).eq("id", id);
}

export async function declineProposal(proposalId: string, posterId: string): Promise<ActResult> {
  const row = await actOnProposal(proposalId, posterId, "declined");
  if (!row) return { ok: false, reason: "not_found" };
  await closeProposalThread(proposalId);
  await notify({
    profileId: row.sender_id, type: "proposal_declined", actorId: posterId,
    title: `Your proposal was **declined** — ${(await requirementBrief(row.requirement_id)).title}`,
    body: "Your proposal count is not refunded for a declined proposal.",
    entityKind: "requirement", entityId: row.requirement_id,
    data: { proposalId, requirementId: row.requirement_id },
  });
  return { ok: true, status: "declined" };
}

/**
 * Not relevant → 5 flags against a sender ⇒ admin review (Doc2 §8.1). We count
 * the sender's not_relevant proposals AFTER this one lands; on the 5th we write a
 * moderation_events row so the Module 11 admin queue can pick it up.
 */
export async function notRelevantProposal(proposalId: string, posterId: string): Promise<ActResult> {
  const row = await actOnProposal(proposalId, posterId, "not_relevant");
  if (!row) return { ok: false, reason: "not_found" };
  await closeProposalThread(proposalId);

  const { count } = await db()
    .from("proposals")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", row.sender_id)
    .eq("status", "not_relevant");
  let flagged = false;
  if ((count ?? 0) >= 5) {
    // Idempotent-ish: only the crossing insert flags. Repeated flags past 5 are
    // fine — the admin queue dedups by profile; we simply record the signal.
    await db().from("moderation_events").insert({
      profile_id: row.sender_id,
      kind: "report_outcome",
      severity: "warning",
      title: "Proposal quality flagged",
      detail: `Auto-flagged: ${count} proposals marked "not relevant" by posters`,
    }).select("id").maybeSingle();
    flagged = true;
  }
  return { ok: true, status: "not_relevant", flagged };
}

// ---- cron: expire stale proposals (Doc7 §77 internal job) ------------------

/**
 * A pending proposal with no response in 30 days → `expired`. The sender's count
 * is deliberately NOT refunded (Doc2 §8.1) — the sender's "My proposals" row
 * says so out loud. Idempotent: the status filter means a re-run touches nothing
 * already expired. Also marks proposals `fulfilled` whose requirement someone
 * else fulfilled, so the sender sees the honest reason.
 */
export async function expireStaleProposals(): Promise<{ expired: number; fulfilled: number }> {
  const now = new Date().toISOString();
  const { data: exp } = await db()
    .from("proposals")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", now)
    .select("id,sender_id,requirement_id");

  // The sender spent a proposal count on this; 30 days of silence ending in a
  // status flip nobody was told about is exactly the dead-end Doc2 §14 lists.
  for (const p of (exp ?? []) as { id: string; sender_id: string; requirement_id: string }[]) {
    // An expired proposal's chat must close too — otherwise its thread sat in the
    // poster's Message Requests as an open request long after the proposal behind
    // it had died, and the sender could still type into it.
    await closeProposalThread(p.id);
    await notify({
      profileId: p.sender_id,
      type: "proposal_expired",
      title: `Your proposal **expired** — ${(await requirementBrief(p.requirement_id)).title}`,
      body: "30 days with no response. The proposal count is not refunded.",
      entityKind: "requirement", entityId: p.requirement_id,
      data: { proposalId: p.id, requirementId: p.requirement_id },
    });
  }

  // Requirement fulfilled by someone else → its still-pending proposals become
  // `fulfilled` (the design's "fulfilled by someone else" row).
  const { data: fulfilledReqs } = await db()
    .from("requirements")
    .select("id")
    .eq("status", "fulfilled");
  const reqIds = (fulfilledReqs ?? []).map((r: { id: string }) => r.id);
  let fulfilled = 0;
  if (reqIds.length) {
    const { data: ful } = await db()
      .from("proposals")
      .update({ status: "fulfilled" })
      .eq("status", "pending")
      .in("requirement_id", reqIds)
      .select("id");
    fulfilled = (ful ?? []).length;
  }
  return { expired: (exp ?? []).length, fulfilled };
}

// ---- helpers ---------------------------------------------------------------

function priceLabel(paise: number | null): string {
  if (paise === null) return "—";
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} L`;
  if (r >= 1_000) return `₹${+(r / 1_000).toFixed(2)} K`;
  return `₹${r}`;
}

function reqRef(req: any): string {
  // 1 Lakh = 1e7 paise. The ref line is the compact "₹40–60 L" form.
  const lakh = (paise: number) => Math.round(paise / 1_00_00_000);
  const budget = req.budget_min_paise != null && req.budget_max_paise != null
    ? `₹${lakh(req.budget_min_paise)}–${lakh(req.budget_max_paise)} L`
    : req.budget_max_paise != null ? `≤₹${lakh(req.budget_max_paise)} L`
    : req.budget_min_paise != null ? `≥₹${lakh(req.budget_min_paise)} L` : "";
  return [req.bhk ? `${req.bhk} BHK` : null, budget, req.area_label].filter(Boolean).join(" · ");
}

function sentFootnote(r: ProposalRow): string {
  switch (r.status) {
    case "pending": return "Waiting for response";
    case "accepted": return "Accepted — chat is open";
    case "declined": return `Declined · Your proposal count isn't refunded`;
    case "expired": return "No response in 30 days — expired · count isn't refunded";
    case "fulfilled": return "Requirement was fulfilled by someone else";
    case "not_relevant": return "Marked not relevant by the poster";
    default: return "";
  }
}

function memberSince(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Cheap, honest profile-completeness % from the fields a profile actually fills. */
export function profileCompleteness(p: any): number {
  const fields = [p?.name, p?.photo_url, p?.bio, p?.email, p?.city_id, p?.role];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}
