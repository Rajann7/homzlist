"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/** Client-side Activity API (P10 S2). Renders the server's aggregation only. */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method: string): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(`/api/v1${path}`, { method, credentials: "same-origin", cache: "no-store" });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

export interface RecentTile { listingId: string; coverUrl: string | null; price: string; title: string | null; viewedOn: string }
export interface InquiryItem { id: string; listingId: string; coverUrl: string | null; title: string | null; status: "sent" | "accepted" | "declined"; createdAt: string }
export interface ActivityView {
  recentlyViewed: RecentTile[];
  inquiries: InquiryItem[];
  counts: { saved: number; inquiries: number; proposals: number; visits: number; savedSearches: number };
}

export const activityApi = {
  get: () => req<ActivityView>("/activity", "GET"),
  clearRecentlyViewed: () => req<{ cleared: number }>("/activity/recently-viewed", "DELETE"),
};
