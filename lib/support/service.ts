import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Support tickets (Doc7 §14 #192, public half) — designs/P12 S2.
 *
 * Every read and write here takes the caller's profileId and filters on it, so a
 * ticket id belonging to someone else returns NOT_FOUND rather than a 403 that
 * confirms it exists (Doc9 §7, no enumeration).
 *
 * Grievance SLA: a category flagged is_grievance sets acked_at immediately (the
 * 2021 Rules' 24-hour acknowledgement, satisfied by the auto-ack message and the
 * ticket number) and a 15-day sla_due_at instead of the ordinary 7.
 */

export type { TicketCategory, TicketSummary, TicketMessage, TicketThread } from "./types";
import type { TicketCategory, TicketSummary, TicketMessage, TicketThread } from "./types";

export async function getTicketCategories(): Promise<TicketCategory[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("ticket_categories").select("*").eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r: Record<string, unknown>) => ({
    code: r.code as string,
    label: r.label as string,
    icon: (r.icon as string) ?? "more",
    extraField: (r.extra_field as TicketCategory["extraField"]) ?? null,
    extraLabel: (r.extra_label as string) ?? null,
    extraHint: (r.extra_hint as string) ?? null,
    extraWarning: (r.extra_warning as string) ?? null,
    isGrievance: Boolean(r.is_grievance),
    inPicker: Boolean(r.in_picker),
    ackHours: (r.ack_hours as number) ?? 24,
    resolveDays: (r.resolve_days as number) ?? 7,
  }));
}

/** The three tabs and their counts, plus every ticket the user owns. */
export async function getMyTickets(profileId: string): Promise<{
  tickets: TicketSummary[];
  counts: { open: number; replied: number; closed: number };
}> {
  const db = createServiceClient();
  const { data } = await db
    .from("support_tickets")
    .select("id, number, subject, category, status, is_grievance, last_activity_at")
    .eq("profile_id", profileId)
    .order("last_activity_at", { ascending: false });

  const rows = data ?? [];
  const ids = rows.map((r: Record<string, unknown>) => r.id as string);
  const labels = new Map((await getTicketCategories()).map((c) => [c.code, c.label]));

  // Last message + count per ticket, in one round trip.
  const byTicket = new Map<string, { count: number; body: string; kind: string; at: string }>();
  if (ids.length) {
    const { data: msgs } = await db
      .from("ticket_messages")
      .select("ticket_id, body, author_kind, created_at, is_internal")
      .in("ticket_id", ids)
      .order("created_at", { ascending: true });
    for (const m of msgs ?? []) {
      if (m.is_internal) continue; // staff-only notes are never shown to the user
      const key = m.ticket_id as string;
      const prev = byTicket.get(key);
      byTicket.set(key, {
        count: (prev?.count ?? 0) + 1,
        body: m.body as string,
        kind: m.author_kind as string,
        at: m.created_at as string,
      });
    }
  }

  const tickets: TicketSummary[] = rows.map((r: Record<string, unknown>) => {
    const last = byTicket.get(r.id as string);
    return {
      id: r.id as string,
      number: r.number as string,
      subject: r.subject as string,
      category: r.category as string,
      categoryLabel: labels.get(r.category as string) ?? (r.category as string),
      status: r.status as TicketSummary["status"],
      isGrievance: Boolean(r.is_grievance),
      lastMessage: last?.body ?? null,
      lastAuthor: (last?.kind as TicketSummary["lastAuthor"]) ?? null,
      messageCount: last?.count ?? 0,
      lastActivityAt: r.last_activity_at as string,
    };
  });

  return {
    tickets,
    counts: {
      open: tickets.filter((t) => t.status === "open").length,
      replied: tickets.filter((t) => t.status === "replied").length,
      closed: tickets.filter((t) => t.status === "closed").length,
    },
  };
}

export async function getTicket(profileId: string, id: string): Promise<TicketThread | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("support_tickets").select("*").eq("id", id).eq("profile_id", profileId).maybeSingle();
  if (!data) return null;

  const [{ data: msgs }, cats] = await Promise.all([
    db.from("ticket_messages")
      .select("id, author_kind, author_name, body, created_at, is_internal")
      .eq("ticket_id", id).order("created_at", { ascending: true }),
    getTicketCategories(),
  ]);

  const visible = (msgs ?? []).filter((m: Record<string, unknown>) => !m.is_internal);
  const { data: atts } = await db
    .from("ticket_attachments").select("message_id, url").eq("ticket_id", id);
  const attByMsg = new Map<string, Array<{ url: string }>>();
  for (const a of atts ?? []) {
    const k = (a.message_id as string) ?? "";
    attByMsg.set(k, [...(attByMsg.get(k) ?? []), { url: a.url as string }]);
  }

  const label = cats.find((c) => c.code === data.category)?.label ?? data.category;

  return {
    id: data.id,
    number: data.number,
    subject: data.subject,
    category: data.category,
    categoryLabel: label,
    status: data.status,
    isGrievance: Boolean(data.is_grievance),
    lastMessage: visible.length ? (visible[visible.length - 1].body as string) : null,
    lastAuthor: visible.length ? (visible[visible.length - 1].author_kind as TicketSummary["lastAuthor"]) : null,
    messageCount: visible.length,
    lastActivityAt: data.last_activity_at,
    createdAt: data.created_at,
    acknowledgedAt: data.acked_at ?? null,
    slaDueAt: data.sla_due_at ?? null,
    resolution: data.resolution ?? null,
    closedAt: data.closed_at ?? null,
    paymentRef: data.payment_ref ?? null,
    altContact: data.alt_contact ?? null,
    reportLink: data.report_link ?? null,
    messages: visible.map((m: Record<string, unknown>) => ({
      id: m.id as string,
      authorKind: m.author_kind as TicketMessage["authorKind"],
      authorName: m.author_name as string,
      body: m.body as string,
      attachments: attByMsg.get(m.id as string) ?? [],
      createdAt: m.created_at as string,
    })),
  };
}

export interface CreateTicketInput {
  category: string;
  subject: string;
  description: string;
  paymentRef?: string | null;
  altContact?: string | null;
  reportLink?: string | null;
  attachments?: Array<{ key: string; url: string; bytes?: number }>;
}

export type CreateResult =
  | { ok: true; id: string; number: string; isGrievance: boolean; ackHours: number; resolveDays: number }
  | { ok: false; reason: "VALIDATION" };

/**
 * Create a ticket. The number comes from a Postgres sequence, and the
 * acknowledgement is written in the same breath — P12 promises "you'll get a
 * ticket number instantly", and for a grievance that promise is a legal
 * obligation, so it can't be a job that might not run.
 */
export async function createTicket(
  profileId: string,
  authorName: string,
  input: CreateTicketInput,
): Promise<CreateResult> {
  const db = createServiceClient();
  const cats = await getTicketCategories();
  const cat = cats.find((c) => c.code === input.category);
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (!cat || subject.length < 3 || subject.length > 140 || description.length < 10 || description.length > 1000) {
    return { ok: false, reason: "VALIDATION" };
  }

  // Only the field this category actually asks for is stored — a client that
  // posts all three cannot smuggle values into the others.
  const extra: Record<string, string | null> = { payment_ref: null, alt_contact: null, report_link: null };
  if (cat.extraField) {
    const raw =
      cat.extraField === "payment_ref" ? input.paymentRef :
      cat.extraField === "alt_contact" ? input.altContact : input.reportLink;
    extra[cat.extraField] = (raw ?? "").trim().slice(0, 300) || null;
  }

  // Allocated by the database (0094) so two simultaneous submissions can't collide.
  const { data: allocated, error: seqError } = await db.rpc("next_ticket_number");
  if (seqError || typeof allocated !== "string") return { ok: false, reason: "VALIDATION" };
  const number = allocated;

  const now = new Date();
  const sla = new Date(now.getTime() + cat.resolveDays * 86400_000);

  const { data: ticket, error } = await db
    .from("support_tickets")
    .insert({
      number,
      profile_id: profileId,
      subject,
      category: cat.code,
      priority: cat.isGrievance ? "high" : "normal",
      status: "open",
      is_grievance: cat.isGrievance,
      payment_ref: extra.payment_ref,
      alt_contact: extra.alt_contact,
      report_link: extra.report_link,
      acked_at: now.toISOString(),
      sla_due_at: sla.toISOString(),
      last_activity_at: now.toISOString(),
    })
    .select("id, number")
    .single();
  if (error || !ticket) return { ok: false, reason: "VALIDATION" };

  const ack = cat.isGrievance
    ? `Grievance ${ticket.number} acknowledged automatically. Under the IT Rules, 2021 we acknowledge within ${cat.ackHours} hours and resolve within ${cat.resolveDays} days.`
    : `Ticket ${ticket.number} acknowledged automatically. We reply within ${cat.ackHours} hours.`;

  await db.from("ticket_messages").insert({
    ticket_id: ticket.id, author_kind: "system", author_name: "System", body: ack,
  });
  const { data: first } = await db
    .from("ticket_messages")
    .insert({ ticket_id: ticket.id, author_kind: "user", author_id: profileId, author_name: authorName, body: description })
    .select("id").single();

  for (const a of (input.attachments ?? []).slice(0, 3)) {
    await db.from("ticket_attachments").insert({
      ticket_id: ticket.id, message_id: first?.id ?? null, key: a.key, url: a.url, bytes: a.bytes ?? 0,
    });
  }

  return {
    ok: true, id: ticket.id, number: ticket.number,
    isGrievance: cat.isGrievance, ackHours: cat.ackHours, resolveDays: cat.resolveDays,
  };
}

/** A user reply. Replying to a closed ticket is rejected — reopen first. */
export async function replyToTicket(
  profileId: string,
  authorName: string,
  ticketId: string,
  body: string,
): Promise<{ ok: true; message: TicketMessage } | { ok: false; reason: "NOT_FOUND" | "CLOSED" | "VALIDATION" }> {
  const text = body.trim();
  if (!text || text.length > 1000) return { ok: false, reason: "VALIDATION" };
  const db = createServiceClient();
  const { data: t } = await db
    .from("support_tickets").select("id, status").eq("id", ticketId).eq("profile_id", profileId).maybeSingle();
  if (!t) return { ok: false, reason: "NOT_FOUND" };
  if (t.status === "closed") return { ok: false, reason: "CLOSED" };

  const { data: m } = await db
    .from("ticket_messages")
    .insert({ ticket_id: ticketId, author_kind: "user", author_id: profileId, author_name: authorName, body: text })
    .select("id, author_kind, author_name, body, created_at").single();

  // A user reply moves the ticket back to the queue: it is no longer "replied".
  await db.from("support_tickets")
    .update({ status: "open", last_activity_at: new Date().toISOString() }).eq("id", ticketId);

  return {
    ok: true,
    message: {
      id: m!.id, authorKind: "user", authorName: m!.author_name, body: m!.body,
      attachments: [], createdAt: m!.created_at,
    },
  };
}

export async function reopenTicket(
  profileId: string,
  ticketId: string,
): Promise<{ ok: boolean; reason?: "NOT_FOUND" | "NOT_CLOSED" }> {
  const db = createServiceClient();
  const { data: t } = await db
    .from("support_tickets").select("id, status, reopen_count")
    .eq("id", ticketId).eq("profile_id", profileId).maybeSingle();
  if (!t) return { ok: false, reason: "NOT_FOUND" };
  if (t.status !== "closed") return { ok: false, reason: "NOT_CLOSED" };
  const now = new Date().toISOString();
  await db.from("support_tickets").update({
    status: "open", closed_at: null, reopened_at: now,
    reopen_count: ((t.reopen_count as number) ?? 0) + 1, last_activity_at: now,
  }).eq("id", ticketId);
  await db.from("ticket_messages").insert({
    ticket_id: ticketId, author_kind: "system", author_name: "System",
    body: "Ticket reopened by the user.",
  });
  return { ok: true };
}
