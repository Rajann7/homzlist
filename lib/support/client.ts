"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { TicketCategory, TicketSummary, TicketThread, TicketMessage } from "./types";

/**
 * Client-side Help / Support / Legal / Blog / Account API (Module 12).
 *
 * `cache: "no-store"` on every call: a re-read right after a mutation (submitting
 * a ticket, replying, requesting an export) came back from the browser cache and
 * showed the pre-mutation state.
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
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

/**
 * Upload one ticket screenshot: presign → PUT straight to storage → commit
 * (the server magic-byte validates the bytes it never saw). Same three-step
 * pipeline as chat photos, so an attachment on a ticket is a real object in R2,
 * not a data URL held in component state.
 */
export async function uploadTicketAttachment(
  file: File,
): Promise<{ ok: true; key: string; url: string; bytes: number } | { ok: false; error: string }> {
  const pre = await req<{ grant: { url: string; key: string; headers: Record<string, string> } }>(
    "/uploads/presign",
    "POST",
    { kind: "support", contentType: file.type, size: file.size },
  );
  if (!pre.ok) {
    const c = pre.error.code;
    return {
      ok: false,
      error:
        c === "FILE_TYPE_BLOCKED" ? "Use a JPG, PNG or WebP image"
        : c === "FILE_TOO_LARGE" ? "That image is too large"
        : c === "RATE_LIMITED" ? "Too many uploads — try again shortly"
        : "Couldn't start the upload",
    };
  }

  const g = pre.data.grant;
  try {
    const put = await fetch(g.url, {
      method: "PUT",
      headers: g.headers,
      body: file,
      credentials: g.url.startsWith("/api/") ? "same-origin" : "omit",
    });
    if (!put.ok) return { ok: false, error: "Upload failed — check your connection" };
  } catch {
    return { ok: false, error: "Upload failed — you may be offline" };
  }

  const commit = await req<{ url?: string }>("/uploads/commit", "POST", { key: g.key, kind: "support" });
  if (!commit.ok || !commit.data.url) return { ok: false, error: "Couldn't save that image" };
  return { ok: true, key: g.key, url: commit.data.url, bytes: file.size };
}

export interface NewTicketInput {
  category: string;
  subject: string;
  description: string;
  paymentRef?: string | null;
  altContact?: string | null;
  reportLink?: string | null;
  attachments?: Array<{ key: string; url: string; bytes?: number }>;
}

export const supportApi = {
  categories: () => req<{ categories: TicketCategory[] }>("/support/categories", "GET"),
  myTickets: () =>
    req<{ tickets: TicketSummary[]; counts: { open: number; replied: number; closed: number } }>(
      "/support/tickets",
      "GET",
    ),
  ticket: (id: string) => req<TicketThread>(`/support/tickets/${id}`, "GET"),
  create: (input: NewTicketInput) =>
    req<{ id: string; number: string; isGrievance: boolean; ackHours: number; resolveDays: number }>(
      "/support/tickets",
      "POST",
      input,
    ),
  reply: (id: string, body: string) =>
    req<TicketMessage>(`/support/tickets/${id}/messages`, "POST", { body }),
  reopen: (id: string) => req<{ reopened: boolean }>(`/support/tickets/${id}/reopen`, "POST"),
};

// ------------------------------------------------------------------ help

export interface HelpFeedbackResult { recorded: boolean; helpful: boolean }

export const helpApi = {
  search: (q: string) =>
    req<{ query: string; results: Array<{ slug: string; title: string; answer: string; categoryTitle: string }> }>(
      `/help?q=${encodeURIComponent(q)}`,
      "GET",
    ),
  feedback: (slug: string, helpful: boolean, note?: string) =>
    req<HelpFeedbackResult>(`/help/articles/${slug}/feedback`, "POST", { helpful, note }),
};

// ------------------------------------------------------------------ consent

export interface PendingConsent {
  slug: string;
  title: string;
  version: string;
  effectiveDate: string | null;
  summary: string;
  highlights: string[];
  preview: string;
}

export const consentApi = {
  pending: () => req<{ pending: PendingConsent[] }>("/cms/consent", "GET"),
  accept: (slug: string) =>
    req<{ accepted: string; version: string; remaining: number }>("/cms/consent", "POST", { slug }),
};

// ------------------------------------------------------------------ blog

export const blogApi = {
  list: (category: string | null, offset: number) =>
    req<{
      posts: Array<{
        slug: string; title: string; excerpt: string | null; category: string; categoryTitle: string;
        badge: string | null; coverUrl: string | null; readMinutes: number; publishedAt: string;
      }>;
      hasMore: boolean;
      total: number;
    }>(`/blog?offset=${offset}${category && category !== "all" ? `&category=${encodeURIComponent(category)}` : ""}`, "GET"),
};

// ------------------------------------------------------------------ account

export interface ExportRequest {
  id: string;
  format: "json" | "csv";
  status: "preparing" | "ready" | "expired" | "failed";
  filename: string | null;
  bytes: number;
  rowCounts: Record<string, number>;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string | null;
}

export interface AccountStatus {
  state: string;
  paymentHoldUntil: string | null;
  paymentHoldDays: number;
  graceDays: number;
  impact: { activePlans: number; planNames: string[]; liveListings: number; liveRequirements: number };
  scheduled: { kind: "deactivate" | "delete"; purgeAt: string | null; createdAt: string } | null;
}

export const accountApi = {
  exports: () =>
    req<{ current: ExportRequest | null; previous: ExportRequest[]; linkHours: number }>("/data/exports", "GET"),
  requestExport: (format: "json" | "csv") => req<ExportRequest>("/data/exports", "POST", { format }),

  status: () => req<AccountStatus>("/account/status", "GET"),
  stepUp: (intent: "deactivate" | "delete") =>
    req<{ intent: string; otpSession: string; resendIn: number; phoneMasked: string; devCode?: string }>(
      "/account/step-up",
      "POST",
      { intent },
    ),
  deactivate: (otpSession: string, code: string) =>
    req<{ deactivated: boolean }>("/account/deactivate", "POST", { otpSession, code }),
  delete: (otpSession: string, code: string, reason: string | null) =>
    req<{ scheduled: boolean; purgeAt: string }>("/account/delete", "POST", {
      otpSession, code, reason, confirm: "DELETE",
    }),
  cancelDeletion: () => req<{ cancelled: boolean; kind: string }>("/account/cancel-deletion", "POST"),
};

// ------------------------------------------------------------------ system

export const systemApi = {
  maintenance: () =>
    req<{ enabled: boolean; message: string; eta: string | null; minutesLeft: number | null; startedAt: string | null }>(
      "/system/maintenance",
      "GET",
    ),
};
