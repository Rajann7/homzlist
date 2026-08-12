"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/**
 * Client-side leads + inquiry API. Asks the server; renders answers. Holds no
 * business truth — counts, statuses, numbers and role gates are all decided
 * server-side (CLAUDE.md backend lock).
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(`/api/v1${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      // A list is re-read straight after a mutation; a cached reply would show
      // the state from before the write (see lib/listings/client).
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

// ---- types the screens render ----------------------------------------------

export type SubjectKind = "listing" | "project" | "requirement";
export type LeadStatus = "new" | "contacted" | "converted" | "archived";

export interface LeadSubject {
  kind: SubjectKind; id: string; title: string; subtitle: string;
  coverUrl: string | null; stateLabel: string; total: number; unseen: number;
  contacted: number; converted: number; lastAt: string | null;
}
export interface LeadGroups {
  subjects: LeadSubject[];
  totals: { total: number; unseen: number };
  sentCount: number;
}
export interface LeadView {
  id: string; status: LeadStatus; statusLabel: string; overdue: boolean; seen: boolean;
  createdAt: string; lastActivityAt: string;
  wants: { code: string; label: string }[];
  contactPref: "call" | "whatsapp" | null;
  contactNumber: string | null;
  callHref: string | null;
  whatsappHref: string | null;
  whenLabel: string | null; preferredOn: string | null;
  notes: { text: string; at: string }[];
  closedReason: string | null;
  person: {
    id: string; name: string; role: string | null; photoUrl: string | null;
    verified: { phone: boolean; id: boolean; rera: boolean }; memberSince: string; profilePct: number;
  };
  subject: {
    kind: SubjectKind; id: string | null; title: string; subtitle: string; coverUrl: string | null;
    state: string; isLive: boolean;
  };
  offer: { kind: "listing" | "project"; id: string; title: string; subtitle: string; coverUrl: string | null } | null;
}
export interface SubjectLeads {
  subject: LeadSubject | null;
  leads: LeadView[];
  counts: { key: string; label: string; count: number }[];
}
export interface SentLead {
  id: string;
  senderAnswer: "contacted" | "not_yet" | null;
  askAnswer: boolean;
  state: "sent" | "seen" | "contacted" | "closed"; stateLabel: string;
  createdAt: string; summary: string; closedReason: string | null; canWithdraw: boolean;
  subject: { kind: SubjectKind; id: string | null; title: string; subtitle: string; coverUrl: string | null };
  to: { id: string; name: string; role: string | null; photoUrl: string | null };
  offer: { kind: "listing" | "project"; id: string; title: string; subtitle: string; coverUrl: string | null } | null;
}

// ---- reads -----------------------------------------------------------------

export const leadGroups = () => req<LeadGroups>("/leads", "GET");
export const subjectLeads = (kind: SubjectKind, id: string) => req<SubjectLeads>(`/leads/subject/${kind}/${id}`, "GET");
export const sentLeads = () => req<{ sent: SentLead[] }>("/leads/sent", "GET");
export const lead = (id: string) => req<{ lead: LeadView }>(`/leads/${id}`, "GET");
export const markSubjectSeen = (kind: SubjectKind, id: string) => req<{ seen: number }>(`/leads/subject/${kind}/${id}`, "POST");

// ---- writes ----------------------------------------------------------------

export const setStatus = (id: string, status: LeadStatus, note?: string) =>
  req<{ updated: true }>(`/leads/${id}`, "PATCH", { action: "status", status, note });
export const addNote = (id: string, text: string) =>
  req<{ updated: true }>(`/leads/${id}`, "PATCH", { action: "note", text });
export const notRelevant = (id: string) =>
  req<{ updated: true }>(`/leads/${id}`, "PATCH", { action: "not_relevant" });
/** Recorded BEFORE the dialler opens — it is the only proof a connection happened. */
export const recordContact = (id: string, channel: "call" | "whatsapp" | "profile") =>
  req<{ updated: true }>(`/leads/${id}`, "PATCH", { action: "contact", channel });
export const answerSent = (id: string, answer: "contacted" | "not_yet") =>
  req<{ updated: true }>(`/leads/${id}`, "PATCH", { action: "answer", answer });
export const withdraw = (id: string) =>
  req<{ updated: true }>(`/leads/${id}`, "PATCH", { action: "withdraw" });
export const reportLead = (id: string, reason: string, note?: string) =>
  req<{ reported: true; alreadyReported: boolean }>(`/leads/${id}`, "PATCH", { action: "report", reason, note });

// ---- inquiry sheet ---------------------------------------------------------

export interface ExistingInquiry {
  id: string;
  leadId: string | null;
  sentAt: string;
  wants: { code: string; label: string }[];
  contactPref: "call" | "whatsapp";
  contactNumber: string | null;
  whenLabel: string | null;
  preferredOn: string | null;
  withdrawn: boolean;
}

export interface InquiryOptions {
  wants: { code: string; label: string }[];
  when: { code: string; label: string }[];
  offers: { code: string; label: string }[];
  consentVersion: string;
  consentText: string;
  allowed: boolean;
  myNumber: string | null;
  /** Set when this person already connected on this subject. */
  existing: ExistingInquiry | null;
}

export const inquiryOptions = (kind: SubjectKind, subjectId?: string) =>
  req<InquiryOptions>(`/inquiries?kind=${kind}${subjectId ? `&subjectId=${subjectId}` : ""}`, "GET");

export interface SendInquiryBody {
  listingId?: string;
  projectId?: string;
  wants: string[];
  contactPref: "call" | "whatsapp";
  contactNumber?: string | null;
  whenToken: string;
  preferredDate?: string | null;
  consent: boolean;
  idempotencyKey: string;
}
export const sendInquiry = (body: SendInquiryBody) =>
  req<{ sent: true; leadId: string; alreadySent: boolean }>("/inquiries", "POST", body);

// ---- "use a different number" ----------------------------------------------

export const myNumbers = () =>
  req<{ myNumber: string | null; verified: { number: string; expiresAt: string }[]; reuseDays: number }>("/contact-numbers", "GET");
export const startNumberOtp = (number: string) =>
  req<{ alreadyVerified: boolean; number: string; otpSession?: string; devCode?: string; resendIn?: number | null }>(
    "/contact-numbers", "POST", { number },
  );
export const resendNumberOtp = (otpSession: string) =>
  req<{ resent: true; devCode?: string; resendIn: number | null }>("/contact-numbers", "POST", { otpSession, resend: true });
export const confirmNumberOtp = (otpSession: string, code: string) =>
  req<{ verified: true; number: string; expiresAt: string }>("/contact-numbers", "PUT", { otpSession, code });
