"use client";

/**
 * Client-side Settings API (P10 Module 11). Asks the server; renders answers.
 * Holds no business truth — every count, badge and label the Settings screen
 * shows comes from GET /settings/overview (CLAUDE.md backend lock).
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
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

export interface SettingsOverview {
  identity: {
    name: string | null;
    username: string | null;
    role: "owner" | "broker" | "builder" | null;
    phone: string;
    email: string | null;
    cityName: string | null;
    photoUrl: string | null;
  };
  verification: { id: boolean; rera: boolean };
  accountStatus: { label: string; inGoodStanding: boolean };
  language: string;
  plan: string | null;
  counts: { saved: number; drafts: number; devices: number; blocked: number };
}

export interface UserPrefs {
  locale: "en" | "hi" | "gu";
  showNumberDefault: boolean;
  showLastSeen: boolean;
  showActivity: boolean;
  findableByPhone: boolean;
}

export const settingsApi = {
  overview: () => req<SettingsOverview>("/settings/overview", "GET"),
  prefs: () => req<UserPrefs>("/settings/prefs", "GET"),
  setPrefs: (patch: Partial<UserPrefs>) => req<UserPrefs>("/settings/prefs", "PATCH", patch),
};
