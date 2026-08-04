import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { readObject, BUCKET } from "@/lib/storage";

/**
 * P12 S2 — Support tickets (Doc4 §68, Doc7 §192).
 *
 * The promises this screen makes, and where each is actually kept:
 *
 *   "You'll get a ticket number instantly"   → `number`, allocated on insert.
 *   "We reply within 24 hours"               → `sla_due_at` = created + 24h.
 *   "Grievance: acknowledged in 24 hours,
 *    resolved within 15 days"                → a grievance ticket is ACKED at
 *                                              creation (an auto-ack message +
 *                                              `acked_at`) and gets a 15-day
 *                                              SLA, because the IT Rules 2021
 *                                              acknowledgement clock is not
 *                                              something a human queue can be
 *                                              relied on to satisfy.
 *   "We've emailed you a confirmation"       → a notification is raised through
 *                                              the Module 10 engine, which owns
 *                                              the email/push channel decision.
 *
 * Ownership is checked on EVERY read and write: a ticket is only ever fetched
 * with `profile_id = me`, so a guessed ticket id returns 404 rather than
 * someone else's payment reference.
 */

const db = () => createServiceClient();

export type TicketStatus = "open" | "replied" | "closed";

export interface TicketCategory {
  slug: string;
  label: string;
  icon: string;
  needsPaymentRef: boolean;
  needsAltContact: boolean;
  needsReportLink: boolean;
  isGrievance: boolean;
}

export interface TicketRow {
  id: string;
  number: string;
  subject: string;
  status: TicketStatus;
  categoryLabel: string;
  lastMessage: string;
  lastAuthorKind: "user" | "staff";
  messageCount: number;
  updatedAt: string;
  isGrievance: boolean;
}

export interface TicketListView {
  tickets: TicketRow[];
  counts: { open: number; replied: number; closed: number };
}

export interface TicketMessage {
  id: string;
  authorKind: "user" | "staff";
  authorName: string;
  body: string;
  attachments: string[];
  createdAt: string;
}

export interface TicketThread {
  id: string;
  number: string;
  subject: string;
  status: TicketStatus;
  categoryLabel: string;
  isGrievance: boolean;
  slaDueAt: string | null;
  ackedAt: string | null;
  createdAt: string;
  messages: TicketMessage[];
}

export async function listTicketCategories(pickerOnly = true): Promise<TicketCategory[]> {
  let q = db()
    .from("ticket_categories")
    .select("slug, label, icon, needs_payment_ref, needs_alt_contact, needs_report_link, is_grievance")
    .eq("is_active", true);
  if (pickerOnly) q = q.eq("show_in_picker", true);
  const { data } = await q.order("sort_order");
  return ((data ?? []) as Record<string, never>[]).map((c: Record<string, unknown>) => ({
    slug: c.slug as string,
    label: c.label as string,
    icon: c.icon as string,
    needsPaymentRef: Boolean(c.needs_payment_ref),
    needsAltContact: Boolean(c.needs_alt_contact),
    needsReportLink: Boolean(c.needs_report_link),
    isGrievance: Boolean(c.is_grievance),
  }));
}

type RawTicket = {
  id: string; number: string; subject: string; status: TicketStatus;
  category: string; is_grievance: boolean; last_activity_at: string;
  ticket_categories: { label: string } | { label: string }[] | null;
};

const label = (t: RawTicket) => {
  const c = Array.isArray(t.ticket_categories) ? t.ticket_categories[0] : t.ticket_categories;
  return c?.label ?? t.category;
};

export async function listMyTickets(profileId: string): Promise<TicketListView> {
  const { data } = await db()
    .from("support_tickets")
    .select("id, number, subject, status, category, is_grievance, last_activity_at, ticket_categories(label)")
    .eq("profile_id", profileId)
    .order("last_activity_at", { ascending: false });

  const tickets = (data ?? []) as RawTicket[];
  if (!tickets.length) return { tickets: [], counts: { open: 0, replied: 0, closed: 0 } };

  // The card prints the last line and a message count — both facts about
  // ticket_messages, so both are read rather than stored on the ticket.
  const { data: msgs } = await db()
    .from("ticket_messages")
    .select("ticket_id, author_kind, author_name, body, created_at")
    .in("ticket_id", tickets.map((t) => t.id))
    .eq("is_internal", false)
    .order("created_at");

  const byTicket = new Map<string, { author_kind: string; body: string }[]>();
  for (const m of (msgs ?? []) as { ticket_id: string; author_kind: string; body: string }[]) {
    const list = byTicket.get(m.ticket_id) ?? [];
    list.push(m);
    byTicket.set(m.ticket_id, list);
  }

  const counts = { open: 0, replied: 0, closed: 0 };
  const rows = tickets.map((t) => {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
    const list = byTicket.get(t.id) ?? [];
    const last = list[list.length - 1];
    return {
      id: t.id,
      number: t.number,
      subject: t.subject,
      status: t.status,
      categoryLabel: label(t),
      lastMessage: last ? `${last.author_kind === "staff" ? "Support" : "You"}: ${last.body}` : "",
      lastAuthorKind: (last?.author_kind === "staff" ? "staff" : "user") as "user" | "staff",
      messageCount: list.length,
      updatedAt: t.last_activity_at,
      isGrievance: t.is_grievance,
    };
  });

  return { tickets: rows, counts };
}

export async function getTicketThread(profileId: string, id: string): Promise<TicketThread | null> {
  const { data } = await db()
    .from("support_tickets")
    .select("id, number, subject, status, category, is_grievance, sla_due_at, acked_at, created_at, ticket_categories(label)")
    .eq("id", id)
    .eq("profile_id", profileId) // ownership is the query, not a later check
    .maybeSingle();
  if (!data) return null;
  const t = data as RawTicket & { sla_due_at: string | null; acked_at: string | null; created_at: string };

  const { data: msgs } = await db()
    .from("ticket_messages")
    .select("id, author_kind, author_name, body, attachments, created_at")
    .eq("ticket_id", id)
    .eq("is_internal", false) // internal staff notes never cross to the user
    .order("created_at");

  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    categoryLabel: label(t),
    isGrievance: t.is_grievance,
    slaDueAt: t.sla_due_at,
    ackedAt: t.acked_at,
    createdAt: t.created_at,
    messages: ((msgs ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      authorKind: (m.author_kind === "staff" ? "staff" : "user") as "user" | "staff",
      authorName: m.author_name as string,
      body: m.body as string,
      attachments: (m.attachments as string[]) ?? [],
      createdAt: m.created_at as string,
    })),
  };
}

/**
 * Attachment keys are NOT trusted from the client.
 *
 * `ticketAttachmentBytes` checks that a key appears in the attachments on the
 * caller's own ticket — which sounds like ownership and is not, because the
 * caller wrote that list. Posting a ticket with
 * `attachments: ["docs/<someone>/<key>"]` and then reading it back would have
 * served another user's VERIFICATION DOCUMENT: support screenshots and ID scans
 * share the private bucket, so the prefix is the only thing separating them.
 *
 * The upload path already pins every key under `support/<uploader>/`
 * (uploads/commit). This is the same check on the write that stores it — the
 * second wall, on the side that was missing one.
 */
function ownAttachments(profileId: string, keys: string[] | undefined): string[] {
  const prefix = `support/${profileId}/`;
  return (keys ?? []).filter((k) => typeof k === "string" && k.startsWith(prefix)).slice(0, 3);
}

export interface CreateTicketInput {
  category: string;
  subject: string;
  description: string;
  paymentRef?: string | null;
  altContact?: string | null;
  reportLink?: string | null;
  attachments?: string[];
}

export type CreateOutcome =
  | { ok: true; id: string; number: string }
  | { ok: false; reason: "VALIDATION_ERROR" | "SERVER_ERROR"; field?: string };

/**
 * TKT-2841 style.
 *
 * Counting the rows and adding one LOOKS like it produces the next number and
 * does not: the numbers already in the table were not allocated contiguously
 * (seeds, deletions), so `2800 + count + 1` lands on one that already exists and
 * the unique index rejects the insert — which surfaced as "Submit ticket does
 * nothing" for every user, because the failure came back as a validation error
 * with no field.
 *
 * And even from a correct starting point, read-then-write races between two
 * concurrent submissions. So the allocator is a Postgres SEQUENCE (migration
 * 0119), started past everything already in the table: nextval() is atomic, so
 * two people submitting in the same millisecond get different numbers.
 */
async function nextTicketNumber(): Promise<string> {
  const { data, error } = await db().rpc("hz_next_ticket_number");
  if (error || !data) throw new Error(`ticket number allocation failed: ${error?.message ?? "empty"}`);
  return data as string;
}

export async function createTicket(
  profileId: string,
  authorName: string,
  input: CreateTicketInput,
): Promise<CreateOutcome> {
  const subject = input.subject?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  if (!subject || subject.length > 160) return { ok: false, reason: "VALIDATION_ERROR", field: "subject" };
  if (!description || description.length > 1000) return { ok: false, reason: "VALIDATION_ERROR", field: "description" };

  const { data: cat } = await db()
    .from("ticket_categories")
    .select("id, slug, label, is_grievance, needs_payment_ref, needs_alt_contact, needs_report_link")
    .eq("slug", input.category)
    .eq("is_active", true)
    .maybeSingle();
  if (!cat) return { ok: false, reason: "VALIDATION_ERROR", field: "category" };
  const c = cat as {
    id: string; slug: string; label: string; is_grievance: boolean;
    needs_payment_ref: boolean; needs_alt_contact: boolean; needs_report_link: boolean;
  };

  // The conditional fields are required BY THE CATEGORY, and the requirement is
  // enforced here — the browser deciding which inputs to render is a rendering
  // decision, not a validation.
  if (c.needs_payment_ref && !input.paymentRef?.trim())
    return { ok: false, reason: "VALIDATION_ERROR", field: "paymentRef" };
  if (c.needs_alt_contact && !input.altContact?.trim())
    return { ok: false, reason: "VALIDATION_ERROR", field: "altContact" };
  if (c.needs_report_link && !input.reportLink?.trim())
    return { ok: false, reason: "VALIDATION_ERROR", field: "reportLink" };

  const now = new Date();
  // 24 hours for a normal ticket; a grievance carries the IT Rules 2021 clock:
  // acknowledged within 24h, RESOLVED within 15 days.
  const slaHours = c.is_grievance ? 15 * 24 : 24;
  const number = await nextTicketNumber();

  // If the pasted payment reference matches a real payment of this user, link
  // it — so a staff member opens the ticket with the transaction attached.
  let paymentId: string | null = null;
  if (input.paymentRef?.trim()) {
    const { data: pay } = await db()
      .from("payments")
      .select("id")
      .eq("profile_id", profileId)
      .eq("razorpay_payment_id", input.paymentRef.trim())
      .maybeSingle();
    paymentId = (pay as { id: string } | null)?.id ?? null;
  }

  const { data: ins, error } = await db()
    .from("support_tickets")
    .insert({
      number,
      profile_id: profileId,
      subject,
      category: c.slug,
      category_id: c.id,
      status: "open",
      is_grievance: c.is_grievance,
      payment_ref: input.paymentRef?.trim().slice(0, 120) ?? null,
      payment_id: paymentId,
      alt_contact: input.altContact?.trim().slice(0, 160) ?? null,
      report_link: input.reportLink?.trim().slice(0, 500) ?? null,
      // The acknowledgement is automatic. A grievance whose 24-hour ack depends
      // on someone being at a desk is a compliance promise with no job behind it.
      acked_at: now.toISOString(),
      sla_due_at: new Date(now.getTime() + slaHours * 3600_000).toISOString(),
      last_activity_at: now.toISOString(),
    })
    .select("id, number")
    .single();
  if (error || !ins) {
    // Distinguishable on purpose. Returning VALIDATION_ERROR for an insert
    // failure is what let a colliding ticket number look like "the form is
    // wrong" for every user instead of the server fault it was.
    console.error("[support] ticket insert failed", error?.message);
    return { ok: false, reason: "SERVER_ERROR" };
  }
  const ticket = ins as { id: string; number: string };

  await db().from("ticket_messages").insert({
    ticket_id: ticket.id,
    author_kind: "user",
    author_id: profileId,
    author_name: authorName,
    body: description,
    attachments: ownAttachments(profileId, input.attachments),
  });

  // The system line the thread opens with — the same auto-ack the design draws.
  await db().from("ticket_messages").insert({
    ticket_id: ticket.id,
    author_kind: "staff",
    author_name: "HomzList Support",
    body: c.is_grievance
      ? `Grievance registered as ${ticket.number} under the IT (Intermediary Guidelines) Rules, 2021. Acknowledged within 24 hours; we will revert with a resolution within 15 days.`
      : `Ticket ${ticket.number} received. Our team replies within 24 hours.`,
  });

  await notify({
    profileId,
    type: "support_ticket_created",
    title: `Ticket ${ticket.number} created`,
    body: subject,
    href: `/help/tickets/${ticket.id}`,
  }).catch(() => {});

  return { ok: true, id: ticket.id, number: ticket.number };
}

export type ReplyOutcome =
  | { ok: true; message: TicketMessage }
  | { ok: false; reason: "NOT_FOUND" | "CLOSED" | "VALIDATION_ERROR" };

export async function replyToTicket(
  profileId: string,
  authorName: string,
  ticketId: string,
  body: string,
  attachments: string[] = [],
): Promise<ReplyOutcome> {
  const text = body?.trim() ?? "";
  if (!text || text.length > 2000) return { ok: false, reason: "VALIDATION_ERROR" };

  const { data } = await db()
    .from("support_tickets")
    .select("id, status")
    .eq("id", ticketId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return { ok: false, reason: "NOT_FOUND" };
  const t = data as { id: string; status: TicketStatus };
  // A closed ticket's composer is hidden in the design; the server refuses the
  // write too, so hiding it is a courtesy rather than the control.
  if (t.status === "closed") return { ok: false, reason: "CLOSED" };

  const { data: msg } = await db()
    .from("ticket_messages")
    .insert({
      ticket_id: ticketId,
      author_kind: "user",
      author_id: profileId,
      author_name: authorName,
      body: text,
      attachments: ownAttachments(profileId, attachments),
    })
    .select("id, author_kind, author_name, body, attachments, created_at")
    .single();

  // A user reply moves a "replied" ticket back to "open" — it is waiting on us
  // again, which is what the tab counts are supposed to mean.
  await db()
    .from("support_tickets")
    .update({ status: "open", last_activity_at: new Date().toISOString() })
    .eq("id", ticketId);

  const m = msg as Record<string, unknown>;
  return {
    ok: true,
    message: {
      id: m.id as string,
      authorKind: "user",
      authorName: m.author_name as string,
      body: m.body as string,
      attachments: (m.attachments as string[]) ?? [],
      createdAt: m.created_at as string,
    },
  };
}

export async function reopenTicket(profileId: string, ticketId: string): Promise<{ ok: boolean }> {
  const { data } = await db()
    .from("support_tickets")
    .select("id, status, is_grievance")
    .eq("id", ticketId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return { ok: false };
  const t = data as { id: string; status: TicketStatus; is_grievance: boolean };
  if (t.status !== "closed") return { ok: true };

  const now = new Date();
  await db()
    .from("support_tickets")
    .update({
      status: "open",
      closed_at: null,
      resolved_at: null,
      // Reopening restarts the clock. A reopened ticket inheriting a due date
      // from three weeks ago would be permanently, meaninglessly overdue.
      sla_due_at: new Date(now.getTime() + (t.is_grievance ? 15 * 24 : 24) * 3600_000).toISOString(),
      last_activity_at: now.toISOString(),
    })
    .eq("id", ticketId);

  await db().from("ticket_messages").insert({
    ticket_id: ticketId,
    author_kind: "staff",
    author_name: "HomzList Support",
    body: "Ticket reopened at your request. We'll pick this up again within 24 hours.",
  });

  return { ok: true };
}

/**
 * The bytes behind one attachment on one ticket.
 *
 * Two checks, and the second is the one that matters: the ticket must be the
 * caller's, AND the key must appear in the attachments recorded on a message of
 * that ticket. Without the second, a caller could pass any key under their own
 * `support/<id>/` prefix — or, worse, one under `docs/<id>/`, since verification
 * documents share the private bucket — and this route would happily serve it.
 */
export async function ticketAttachmentBytes(
  profileId: string,
  ticketId: string,
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const { data: ticket } = await db()
    .from("support_tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!ticket) return null;

  const { data: msgs } = await db()
    .from("ticket_messages")
    .select("attachments")
    .eq("ticket_id", ticketId);
  const known = new Set(
    ((msgs ?? []) as { attachments: string[] | null }[]).flatMap((m) => m.attachments ?? []),
  );
  if (!known.has(key)) return null;

  const bytes = await readObject(key, BUCKET.private);
  if (!bytes) return null;

  // Sniffed from the magic bytes rather than trusted from the key's extension.
  const head = bytes.subarray(0, 12);
  const contentType =
    head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg"
    : head.subarray(0, 8).toString("latin1") === "\x89PNG\r\n\x1a\n" ? "image/png"
    : head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP" ? "image/webp"
    : "application/octet-stream";

  return { body: bytes, contentType };
}
