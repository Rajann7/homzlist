"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/**
 * The client API for Module 12 (Help · Support · Legal · Blog · Account).
 *
 * `cache: "no-store"` on every call for the reason recorded in
 * memory/client-fetch-needs-no-store: a re-read straight after a mutation
 * (submit a ticket → reload the list, request an export → poll the status)
 * comes back from the browser's HTTP cache showing the pre-mutation answer.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method = "GET", body?: unknown): Promise<ApiResult<T>> {
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

/* ─────────────────────────────────────────────────────────────── help ─── */

export interface HelpArticleRow {
  slug: string;
  question: string;
  categorySlug: string | null;
  categoryTitle: string | null;
  readMinutes: number;
}
export interface HelpIndex {
  categories: { slug: string; title: string; icon: string; articleCount: number }[];
  chips: { label: string; query: string }[];
  popular: HelpArticleRow[];
}
export interface HelpCategoryView {
  slug: string;
  title: string;
  articles: { slug: string; question: string; answer: string }[];
}
export interface HelpArticleFull extends HelpArticleRow {
  answer: string;
  bodyMd: string;
  updatedAt: string;
  related: HelpArticleRow[];
  myVote: boolean | null;
}

export const helpApi = {
  index: () => req<HelpIndex>("/help"),
  search: (q: string) => req<{ query: string; results: HelpArticleRow[] }>(`/help/search?q=${encodeURIComponent(q)}`),
  category: (slug: string) => req<HelpCategoryView>(`/help/categories/${slug}`),
  article: (slug: string) => req<HelpArticleFull>(`/help/articles/${slug}`),
  feedback: (slug: string, helpful: boolean, comment?: string) =>
    req<{ recorded: boolean }>(`/help/articles/${slug}/feedback`, "POST", { helpful, comment }),
};

/* ──────────────────────────────────────────────────────────── support ─── */

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
  status: "open" | "replied" | "closed";
  categoryLabel: string;
  lastMessage: string;
  lastAuthorKind: "user" | "staff";
  messageCount: number;
  updatedAt: string;
  isGrievance: boolean;
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
  status: "open" | "replied" | "closed";
  categoryLabel: string;
  isGrievance: boolean;
  slaDueAt: string | null;
  ackedAt: string | null;
  createdAt: string;
  messages: TicketMessage[];
}

export const supportApi = {
  categories: () => req<{ categories: TicketCategory[] }>("/support/categories"),
  list: () => req<{ tickets: TicketRow[]; counts: { open: number; replied: number; closed: number } }>("/support/tickets"),
  create: (body: Record<string, unknown>) => req<{ id: string; number: string }>("/support/tickets", "POST", body),
  thread: (id: string) => req<TicketThread>(`/support/tickets/${id}`),
  reply: (id: string, text: string) => req<TicketMessage>(`/support/tickets/${id}/messages`, "POST", { body: text }),
  reopen: (id: string) => req<{ reopened: boolean }>(`/support/tickets/${id}/reopen`, "POST", {}),
};

/* ────────────────────────────────────────────────────────────── legal ─── */

export interface LegalVersion {
  version: string;
  effectiveDate: string | null;
  note: string | null;
  isMaterial: boolean;
  createdAt: string;
  isCurrent: boolean;
}
export interface PendingConsent {
  slug: string;
  title: string;
  version: string;
  summary: string;
  extract: string;
  highlights: string[];
}

export const legalApi = {
  versions: (slug: string) => req<{ versions: LegalVersion[] }>(`/cms/pages/${slug}/versions`),
  pendingConsent: () => req<{ pending: PendingConsent[]; count: number }>("/cms/consent"),
  accept: (slug: string, version: string) =>
    req<{ accepted: boolean; remaining: number }>("/cms/consent", "POST", { slug, version }),
};

/* ─────────────────────────────────────────────────────────────── blog ─── */

export interface BlogCard {
  slug: string;
  title: string;
  excerpt: string | null;
  badge: string | null;
  category: string;
  categoryLabel: string;
  coverUrl: string | null;
  readMinutes: number;
  publishedAt: string;
  isFeatured: boolean;
}

export const blogApi = {
  list: (category?: string | null, cursor?: string | null) =>
    req<{ featured: BlogCard | null; posts: BlogCard[]; categories: { slug: string; label: string }[]; nextCursor: string | null }>(
      `/blog?${new URLSearchParams({ ...(category ? { category } : {}), ...(cursor ? { cursor } : {}) })}`,
    ),
};

/* ──────────────────────────────────────────────────────────── account ─── */

export interface ExportRow {
  id: string;
  format: "json" | "csv";
  status: "queued" | "processing" | "ready" | "expired" | "failed";
  requestedAt: string;
  readyAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  fileName: string | null;
}
export interface AccountLifecycle {
  state: string;
  paymentHold: { active: boolean; lastPaymentAt: string | null; availableFrom: string | null };
  deactivatedAt: string | null;
  deletionScheduledAt: string | null;
  atRisk: { activePlans: number; liveListings: number; activeBoosts: number };
}

export const accountApi = {
  data: () => req<{ current: ExportRow | null; previous: ExportRow[] }>("/account/data"),
  requestExport: (format: "json" | "csv") => req<ExportRow>("/account/data", "POST", { format }),
  lifecycle: () => req<AccountLifecycle>("/account/lifecycle"),
  startVerify: (action: "deactivate" | "delete", reason?: string | null) =>
    req<{ otpSession: string; resendIn: number; maskedPhone: string; action: string; devCode?: string }>(
      "/account/verify/start",
      "POST",
      { action, reason },
    ),
  confirmVerify: (otpSession: string, code: string) =>
    req<{ action: string; state: string; deletionScheduledAt: string | null }>("/account/verify/confirm", "POST", {
      otpSession,
      code,
    }),
  cancelDeletion: () => req<{ state: string }>("/account/cancel-deletion", "POST", {}),
};

/* ───────────────────────────────────────────────────────────── system ─── */

export const systemApi = {
  maintenance: () =>
    req<{ enabled: boolean; message: string; eta: string | null; etaLabel: string | null; startedAt: string | null }>(
      "/system/maintenance",
    ),
};
