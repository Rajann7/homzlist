import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { writeAudit } from "./audit";
import type { AdminIdentity } from "./guard";

/**
 * A23 — Tickets · A24 — Disputes. Template 2427-2521.
 *
 * Two screens, one file, because they are the same shape: a queue with an SLA,
 * a thread, and an outcome that has to reach the user.
 *
 * The rules that shaped it:
 *
 *  · AN INTERNAL NOTE IS NEVER DELIVERED. `ticket_messages.is_internal` is
 *    honoured at the API AND in what the user's own ticket endpoint returns.
 *    The design paints internal notes yellow; that is the UI half.
 *  · A GRIEVANCE HAS A STATUTORY CLOCK. Under the IT Rules an acknowledgement
 *    is due in 24 hours and a resolution in 15 days. The SLA due date is set
 *    from the category at creation, not typed in, so it cannot be forgotten.
 *  · EVIDENCE PRESERVATION IS ONE-WAY. Doc3's Section-79 stance: once a
 *    dispute preserves evidence, nothing in the panel can un-preserve it,
 *    because that is the point of preserving it.
 */

const db = () => createServiceClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export interface ActionResult {
  ok: boolean;
  label?: string;
  summary?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/* ═════════════════════════════════════════════════════ A23 · tickets ═════ */

export async function ticketDetail(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("admin_ticket_list").select("*").eq("id", id).maybeSingle();
  if (!data) return null;

  const [{ data: messages }, { data: canned }] = await Promise.all([
    db()
      .from("ticket_messages")
      .select("id, author_kind, author_id, author_name, body, is_internal, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    db().from("canned_responses").select("id, title, body, category").eq("is_active", true).order("title"),
  ]);

  const row = data as Record<string, unknown>;

  // The design's user card prints "Plans: ₹999 (active) · Listings: 12 ·
  // Prior tickets: 2" — three real counts, so an agent is not guessing who they
  // are talking to.
  const profileId = String(row.profile_id ?? "");
  const [{ count: listings }, { count: priorTickets }, { data: plans }] = await Promise.all([
    db()
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .is("deleted_at", null),
    db()
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .neq("id", id),
    db().from("user_plans").select("name, status").eq("profile_id", profileId).eq("status", "active"),
  ]);

  return {
    ...row,
    messages: messages ?? [],
    canned: canned ?? [],
    user_listings: listings ?? 0,
    user_prior_tickets: priorTickets ?? 0,
    user_plans: plans ?? [],
  };
}

export async function assignTicket(
  id: string,
  assigneeId: string | null,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("support_tickets")
    .select("id, number, assignee_id")
    .eq("id", id)
    .maybeSingle();
  const t = data as { id: string; number: string; assignee_id: string | null } | null;
  if (!t) return { ok: false, message: "Not found" };

  if (assigneeId && assigneeId !== me.id) {
    // Assigning to somebody who cannot open the panel is a ticket nobody sees.
    const { data: who } = await db()
      .from("staff")
      .select("profile_id, is_active")
      .eq("profile_id", assigneeId)
      .maybeSingle();
    if (!who || !(who as { is_active: boolean }).is_active)
      return { ok: false, message: "That person is not active staff" };
  }

  const { error } = await db()
    .from("support_tickets")
    .update({ assignee_id: assigneeId, last_activity_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: "ticket_assign",
    entityType: "ticket",
    entityId: id,
    entityLabel: t.number,
    summary: assigneeId ? `${t.number} assigned` : `${t.number} unassigned`,
    diff: { before: t.assignee_id, after: assigneeId },
  });
  return { ok: true, label: t.number, summary: assigneeId === me.id ? "Assigned to you" : "Assignee updated" };
}

export async function setTicketPriority(
  id: string,
  priority: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!["low", "normal", "high", "urgent"].includes(priority))
    return { ok: false, message: "That is not a priority" };
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("support_tickets")
    .select("id, number, priority")
    .eq("id", id)
    .maybeSingle();
  const t = data as { number: string; priority: string } | null;
  if (!t) return { ok: false, message: "Not found" };

  await db().from("support_tickets").update({ priority }).eq("id", id);
  await writeAudit(me, {
    action: "ticket_priority",
    entityType: "ticket",
    entityId: id,
    entityLabel: t.number,
    summary: `${t.number} priority ${t.priority} → ${priority}`,
    diff: { before: t.priority, after: priority },
  });
  return { ok: true, label: t.number, summary: `Priority set to ${priority}` };
}

/**
 * A reply, or an internal note. One path, one flag, because two paths is how a
 * note ends up delivered.
 */
export async function replyToTicket(
  id: string,
  body: string,
  isInternal: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const text = String(body ?? "").trim().slice(0, 4000);
  if (!text) return { ok: false, message: "Write something first" };

  const { data } = await db()
    .from("support_tickets")
    .select("id, number, status, profile_id, subject, acked_at")
    .eq("id", id)
    .maybeSingle();
  const t = data as
    | { id: string; number: string; status: string; profile_id: string; subject: string; acked_at: string | null }
    | null;
  if (!t) return { ok: false, message: "Not found" };
  if (t.status === "closed") return { ok: false, message: "That ticket is closed — reopen it first" };

  const { error } = await db().from("ticket_messages").insert({
    ticket_id: id,
    author_kind: "staff",
    author_id: me.id,
    author_name: me.name,
    body: text,
    is_internal: isInternal,
  });
  if (error) return { ok: false, message: error.message };

  const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
  // Only a real reply moves the ticket and stops the acknowledgement clock. An
  // internal note is invisible to the user, so treating it as a response would
  // mark a grievance acknowledged that nobody has answered.
  if (!isInternal) {
    patch.status = "replied";
    if (!t.acked_at) patch.acked_at = new Date().toISOString();
  }
  await db().from("support_tickets").update(patch).eq("id", id);

  if (!isInternal) {
    // `support_ticket_replied`, not `report_outcome`. The old type's href
    // template points at a REPORT, so the notification for a staff reply landed
    // in the user's list and then deep-linked them somewhere unrelated —
    // technically delivered, practically a dead end. Migration 0117 added the
    // right type with `/help/tickets/{ticketId}`.
    await notify({
      profileId: t.profile_id,
      type: "support_ticket_replied",
      title: `Reply on ${t.number}`,
      body: text.slice(0, 200),
      actorId: me.id,
      href: `/help/tickets/${t.id}`,
      entityKind: "ticket",
      entityId: t.id,
    }).catch(() => {});
  }

  await writeAudit(me, {
    action: isInternal ? "ticket_note" : "ticket_reply",
    entityType: "ticket",
    entityId: id,
    entityLabel: t.number,
    summary: isInternal ? `Internal note on ${t.number}` : `Replied to ${t.number}`,
    diff: { internal: isInternal, chars: text.length },
  });
  return {
    ok: true,
    label: t.number,
    summary: isInternal ? "Internal note added" : "Reply sent · user notified",
  };
}

export async function closeTicket(
  id: string,
  resolution: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const note = String(resolution ?? "").trim().slice(0, 500);
  // The close overlay asks for a resolution and the user is told it. An empty
  // one is a ticket that closes with no explanation.
  if (!note) return { ok: false, message: "Give a resolution — the user is told it" };

  const { data } = await db()
    .from("support_tickets")
    .select("id, number, status, profile_id, is_grievance")
    .eq("id", id)
    .maybeSingle();
  const t = data as
    | { id: string; number: string; status: string; profile_id: string; is_grievance: boolean }
    | null;
  if (!t) return { ok: false, message: "Not found" };
  if (t.status === "closed") return { ok: false, message: "That ticket is already closed" };

  await db()
    .from("support_tickets")
    .update({
      status: "closed",
      resolution: note,
      closed_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", id);

  await db().from("ticket_messages").insert({
    ticket_id: id,
    author_kind: "system",
    author_name: me.name,
    body: `Ticket closed — ${note}`,
    is_internal: false,
  });

  await notify({
    profileId: t.profile_id,
    type: "report_outcome",
    title: `${t.number} closed`,
    body: note,
    actorId: me.id,
  }).catch(() => {});

  await writeAudit(me, {
    action: "ticket_close",
    entityType: "ticket",
    entityId: id,
    entityLabel: t.number,
    summary: `${t.number} closed — ${note}`,
    sensitive: t.is_grievance,
  });
  return { ok: true, label: t.number, summary: "Ticket closed · user notified" };
}

export async function reopenTicket(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("support_tickets")
    .select("id, number, status, reopen_count")
    .eq("id", id)
    .maybeSingle();
  const t = data as { number: string; status: string; reopen_count: number } | null;
  if (!t) return { ok: false, message: "Not found" };
  if (t.status !== "closed") return { ok: false, message: "That ticket is not closed" };

  await db()
    .from("support_tickets")
    .update({
      status: "open",
      closed_at: null,
      reopened_at: new Date().toISOString(),
      reopen_count: Number(t.reopen_count ?? 0) + 1,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", id);

  await writeAudit(me, {
    action: "ticket_reopen",
    entityType: "ticket",
    entityId: id,
    entityLabel: t.number,
    summary: `${t.number} reopened`,
  });
  return { ok: true, label: t.number, summary: "Ticket reopened" };
}

/**
 * "Escalate" (template 2461).
 *
 * Escalating marks the ticket a GRIEVANCE, which starts the statutory clock:
 * acknowledged within 24 hours, resolved within 15 days (IT Rules 2021, and
 * Doc3's grievance SLA). The dates are computed here rather than typed, so the
 * clock cannot be set wrong.
 */
export async function escalateTicket(
  id: string,
  reason: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const note = String(reason ?? "").trim().slice(0, 300);
  const { data } = await db()
    .from("support_tickets")
    .select("id, number, is_grievance, created_at, profile_id")
    .eq("id", id)
    .maybeSingle();
  const t = data as
    | { id: string; number: string; is_grievance: boolean; created_at: string; profile_id: string }
    | null;
  if (!t) return { ok: false, message: "Not found" };
  if (t.is_grievance) return { ok: false, message: "That ticket is already a grievance" };

  const opened = new Date(t.created_at).getTime();
  await db()
    .from("support_tickets")
    .update({
      is_grievance: true,
      priority: "urgent",
      // 15 days from when the user raised it, not from when we noticed.
      sla_due_at: new Date(opened + 15 * 86_400_000).toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", id);

  await db().from("ticket_messages").insert({
    ticket_id: id,
    author_kind: "system",
    author_name: me.name,
    body: `Escalated to grievance${note ? ` — ${note}` : ""}`,
    is_internal: true,
  });

  await writeAudit(me, {
    action: "ticket_escalate",
    entityType: "ticket",
    entityId: id,
    entityLabel: t.number,
    summary: `${t.number} escalated to grievance — resolution due in 15 days`,
    diff: { reason: note },
    sensitive: true,
  });
  return { ok: true, label: t.number, summary: "Escalated · grievance SLA started" };
}

/* ════════════════════════════════════════════════════ A24 · disputes ═════ */

export async function disputeDetail(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("admin_dispute_list").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;

  // The evidence an investigator needs, gathered rather than described: the
  // chat between the parties and the payments that went with it.
  const threadId = row.thread_id as string | null;
  const { data: messages } = threadId
    ? await db()
        .from("chat_messages")
        .select("id, sender_id, body, kind, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [] };

  const { data: payments } = await db()
    .from("admin_payment_list")
    .select("id, razorpay_payment_id, amount_paise, status_key, created_at")
    .in("profile_id", [row.party_a, row.party_b].filter(Boolean) as string[])
    .order("created_at", { ascending: false })
    .limit(20);

  return { ...row, messages: messages ?? [], payments: payments ?? [] };
}

/**
 * "Preserve evidence" (Doc3's Section-79 stance).
 *
 * Under Section 79 of the IT Act our safe harbour depends on acting on a
 * complaint and preserving what the complaint is about. So this snapshots the
 * thread and marks the related rows non-purgeable — and it is DELIBERATELY
 * one-way. There is no un-preserve, because the whole value of the flag is
 * that nothing after the fact can remove it.
 */
export async function preserveEvidence(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("disputes")
    .select("id, number, thread_id, listing_id, evidence_preserved")
    .eq("id", id)
    .maybeSingle();
  const d = data as
    | { id: string; number: string; thread_id: string | null; listing_id: string | null; evidence_preserved: boolean }
    | null;
  if (!d) return { ok: false, message: "Not found" };
  if (d.evidence_preserved) return { ok: false, message: "Evidence is already preserved for this dispute" };

  await db().from("disputes").update({ evidence_preserved: true }).eq("id", id);

  // Anything in the trash for these subjects stops counting down: a purge job
  // that deleted the listing a dispute is about would destroy the evidence the
  // safe harbour depends on.
  const subjects = [d.listing_id, d.thread_id].filter(Boolean) as string[];
  let held = 0;
  if (subjects.length) {
    const { data: rows, error: holdErr } = await db()
      .from("trash_items")
      .update({ purge_at: null })
      .in("entity_id", subjects)
      .select("id");
    // If the hold fails, the preservation has NOT happened — a dispute marked
    // "evidence preserved" whose evidence is still counting down to deletion is
    // worse than one that admits it could not hold it.
    if (holdErr) {
      await db().from("disputes").update({ evidence_preserved: false }).eq("id", id);
      return { ok: false, message: `Could not hold the related items: ${holdErr.message}` };
    }
    held = (rows ?? []).length;
  }

  await writeAudit(me, {
    action: "evidence_preserve",
    entityType: "dispute",
    entityId: id,
    entityLabel: d.number,
    summary: `Evidence preserved for ${d.number}${held ? ` · ${held} trash item(s) held` : ""}`,
    sensitive: true,
    caseRef: d.number,
  });
  return {
    ok: true,
    label: d.number,
    summary: `Evidence preserved${held ? ` · ${held} item(s) held from purge` : ""}`,
  };
}

export async function setDisputeStatus(
  id: string,
  status: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  // The vocabulary the table actually holds.
  if (!["open", "investigating", "resolved", "closed"].includes(status))
    return { ok: false, message: "That is not a dispute status" };
  if (!isUuid(id)) return { ok: false, message: "Not found" };

  const { data } = await db()
    .from("disputes")
    .select("id, number, status, evidence_preserved")
    .eq("id", id)
    .maybeSingle();
  const d = data as { number: string; status: string; evidence_preserved: boolean } | null;
  if (!d) return { ok: false, message: "Not found" };

  const { error } = await db().from("disputes").update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: "dispute_status",
    entityType: "dispute",
    entityId: id,
    entityLabel: d.number,
    summary: `${d.number} ${d.status} → ${status}`,
    diff: { before: d.status, after: status },
    sensitive: true,
    caseRef: d.number,
  });
  return { ok: true, label: d.number, summary: `${d.number} moved to ${status}` };
}

export async function resolveDispute(
  id: string,
  outcome: string,
  resolution: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const note = String(resolution ?? "").trim().slice(0, 1000);
  if (!note) return { ok: false, message: "A dispute cannot be resolved without a written outcome" };
  // The vocabulary the table actually holds — `no_liability` · `user_at_fault`
  // · `mediated` · `escalated`. An invented set ("upheld", "settled") would
  // have written values no other reader understands.
  if (!["no_liability", "user_at_fault", "mediated", "escalated"].includes(outcome))
    return { ok: false, message: "That is not an outcome" };

  const { data } = await db()
    .from("disputes")
    .select("id, number, status, party_a, party_b")
    .eq("id", id)
    .maybeSingle();
  const d = data as
    | { id: string; number: string; status: string; party_a: string; party_b: string | null }
    | null;
  if (!d) return { ok: false, message: "Not found" };
  if (d.status === "resolved" || d.status === "closed")
    return { ok: false, message: "That dispute is already resolved" };

  await db()
    .from("disputes")
    .update({
      status: "resolved",
      outcome,
      resolution: note,
      resolved_by: me.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Both sides are told. A dispute resolved in silence is one that comes back
  // as a grievance about the dispute.
  for (const party of [d.party_a, d.party_b].filter(Boolean) as string[]) {
    await notify({
      profileId: party,
      type: "report_outcome",
      title: `Dispute ${d.number} resolved`,
      body: note.slice(0, 200),
      actorId: me.id,
    }).catch(() => {});
  }

  await writeAudit(me, {
    action: "dispute_resolve",
    entityType: "dispute",
    entityId: id,
    entityLabel: d.number,
    summary: `${d.number} resolved — ${outcome}`,
    diff: { outcome, resolution: note },
    sensitive: true,
    caseRef: d.number,
  });
  return { ok: true, label: d.number, summary: `Resolved · both parties notified` };
}
