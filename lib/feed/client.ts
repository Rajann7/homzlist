"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/**
 * Client-side feed API. Same discipline as the rest: asks the server questions,
 * renders answers. No ranking, entitlement or business logic of its own.
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
      // Save/unsave then re-read the feed — a cached page would put the heart
      // back. See lib/listings/client for the case this was caught on.
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

export interface PosterInfo { id: string; name: string; username: string | null; role: string | null; verified: boolean; avatarUrl: string | null; }
export interface FeedCard {
  kind: "property" | "project";
  id: string; promoted: boolean; saved: boolean; isOwn?: boolean; coverUrl: string | null; photos: string[];
  areaLabel: string | null; poster: PosterInfo; postedAgo: string;
  price?: string; saleLabel?: "For Sale" | "For Rent"; meta?: string; listingKind?: "sell" | "rent"; typeCode?: string;
  title?: string; priceFrom?: string; buildStatus?: string; rera?: boolean;
}
export interface FeedResult { items: FeedCard[]; nextCursor: string | null; sections: { label: string | null; items: FeedCard[] }[]; }

export interface StorySegment { id: string; kind: "property" | "project"; cover: string | null; price: string; meta: string; areaLabel: string | null; available: boolean; }
export interface StoryCircle { posterId: string; posterName: string; posterAvatar: string | null; verified: boolean; ring: "unseen" | "seen" | "project" | "boosted"; boosted: boolean; isProject: boolean; segments: StorySegment[]; }

export const feedApi = {
  list: (opts: { filter?: string; sort?: string; cursor?: string | null } = {}) =>
    req<FeedResult>(`/feed?${new URLSearchParams({ ...(opts.filter ? { filter: opts.filter } : {}), ...(opts.sort ? { sort: opts.sort } : {}), ...(opts.cursor ? { cursor: opts.cursor } : {}) }).toString()}`),
  builderDashboard: () =>
    req<{ projects: { id: string; name: string; coverUrl: string | null; views: number; leads: number; spark: number[] }[]; sections: { label: string | null; items: any[] }[] }>("/feed/builder-dashboard"),
  suggested: () => req<{ items: { id: string; coverUrl: string | null; price: string; areaLabel: string | null }[] }>("/feed/suggested"),
  newCount: (since: string) => req<{ count: number }>(`/feed/new-count?since=${encodeURIComponent(since)}`),
  banner: () => req<{ banner: { id: string; title: string; subtitle: string | null; imageUrl: string | null; targetUrl: string | null } | null }>("/feed/banner"),
  badges: () => req<{ messages: number; notifications: number | null }>("/feed/badges"),
  notInterested: (target: { typeCode?: string; areaId?: string }) => req<{ ok: boolean }>("/feed/not-interested", "POST", target),
};

export const storiesApi = {
  list: () => req<{ circles: StoryCircle[] }>("/stories"),
  seen: (segmentId: string) => req<{ ok: boolean }>(`/stories/${segmentId}/seen`, "POST", {}),
  segment: (segmentId: string) => req<{ segment: StorySegment }>(`/stories/${segmentId}`),
};

export const interactionsApi = {
  toggleSave: (listingId: string) => req<{ saved: boolean }>("/saves", "POST", { listingId }),
  inquiry: (listingId: string, body: { message: string; intents?: string[]; shareNumber?: boolean }) =>
    req<{ sent: boolean; alreadySent: boolean }>("/inquiries", "POST", { listingId, ...body }),
  report: (subjectType: "listing" | "project" | "requirement", subjectId: string, reason: string, note?: string | null) =>
    req<{ reported: boolean }>("/reports", "POST", { subjectType, subjectId, reason, note }),
};
