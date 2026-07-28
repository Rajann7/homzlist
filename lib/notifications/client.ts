"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/**
 * Client-side notifications API (Module 10). Asks the server; renders answers.
 * Holds NO business truth — counts, grouping, unread state, which inline
 * buttons a row offers and whether an action is still available are all decided
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
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

export type GroupKey = "today" | "week" | "earlier";

export interface NotificationAction {
  key: string;
  label: string;
  style: "primary" | "outline" | "link" | "link-error";
}

export interface NotificationRow {
  id: string;
  type: string;
  category: string;
  /** Row text with **bold** markers; the component renders the <b> itself. */
  text: string;
  timeLabel: string;
  unread: boolean;
  group: GroupKey;
  groupCount: number;
  href: string | null;
  thumbUrl: string | null;
  lead:
    | { kind: "avatar"; name: string; photo: string | null }
    | { kind: "icon"; icon: string; tone: string };
  actions: NotificationAction[];
  actionTaken: string | null;
  actionResult: string | null;
  createdAt: string;
}

export interface InboxChip { key: string; label: string; count: number | null }
export interface Inbox { rows: NotificationRow[]; chips: InboxChip[]; total: number; unread: number }

export interface PrefGroup {
  code: string; section: string; label: string; sublabel: string | null;
  enabled: boolean; locked: boolean;
}
export interface Prefs {
  groups: PrefGroup[];
  enabled: Record<string, boolean>;
  push: boolean; email: boolean; whatsapp: boolean;
  marketingConsent: boolean; marketingConsentAt: string | null;
  quietHours: boolean; quietStart: string; quietEnd: string;
  expiryReminders: boolean;
}

export const notificationsApi = {
  list: (filter = "all") => req<Inbox>(`/notifications?filter=${encodeURIComponent(filter)}`, "GET"),
  markAllRead: () => req<{ marked: number }>("/notifications", "PATCH"),
  clearAll: () => req<{ cleared: number }>("/notifications", "DELETE"),
  markRead: (id: string) => req<{ read: boolean }>(`/notifications/${id}`, "PATCH", {}),
  dismiss: (id: string) => req<{ dismissed: boolean }>(`/notifications/${id}`, "DELETE"),
  /** Inline Allow/Deny, Yes/No, Appeal, "Not you?" — the server does the work. */
  act: (id: string, action: string) =>
    req<{ text: string | null; toast: string | null; dismissed: boolean }>(`/notifications/${id}`, "PATCH", { action }),

  prefs: () => req<Prefs>("/profile/notification-prefs", "GET"),
  setPrefs: (patch: Record<string, unknown>) => req<Prefs>("/profile/notification-prefs", "PATCH", patch),

  registerPush: (token: string, platform: string, standalone: boolean) =>
    req<{ registered: boolean; device: string }>("/push/register", "POST", { token, platform, standalone }),
  unregisterPush: (token: string) => req<{ removed: boolean }>("/push/register", "DELETE", { token }),
};

/**
 * Split "**Nirav Shah** sent an inquiry" into renderable segments.
 * The server never ships HTML for a row — bold is a marker, so a notification
 * whose copy contains user-supplied text can't inject markup.
 */
export function boldSegments(text: string): { text: string; bold: boolean }[] {
  return (text ?? "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}
