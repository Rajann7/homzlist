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
  areaLabel: string | null; areaId?: string | null; poster: PosterInfo; postedAgo: string;
  price?: string; saleLabel?: "For Sale" | "For Rent"; meta?: string; listingKind?: "sell" | "rent"; typeCode?: string;
  typeLabel?: string | null; metaChips?: string[]; negotiable?: boolean;
  title?: string; priceFrom?: string; buildStatus?: string; rera?: boolean;
  // project (the rest of the card — see lib/feed/service.ts FeedCard)
  buildStatusCode?: string | null;
  projectTypeLabel?: string | null; priceBand?: string | null; unitTypes?: string[];
  possessionLabel?: string | null; reraExempt?: boolean;
  facts?: { label: string; value: string }[];
  contactNumber?: string | null;
}
export interface FeedResult { items: FeedCard[]; nextCursor: string | null; sections: { label: string | null; items: FeedCard[] }[]; }

export interface StorySpec { icon: string; value: string; label: string }
export interface StorySegment {
  id: string; kind: "property" | "project"; cover: string | null; price: string; meta: string;
  areaLabel: string | null; available: boolean;
  /** Redesigned viewer (designs/P2A) — all server-resolved, see lib/feed/stories.ts. */
  title: string; typeLabel: string | null; specs: StorySpec[]; negotiable: boolean;
  subtitle: string | null; saved: boolean; postedLabel: string | null; href: string;
}
export interface StoryCircle { posterId: string; posterName: string; posterUsername: string | null; posterAvatar: string | null; verified: boolean; ring: "unseen" | "seen" | "project" | "boosted"; boosted: boolean; isProject: boolean; segments: StorySegment[]; }

/** One rail on the carousel feed — see lib/feed/sections.ts. */
export interface FeedSectionMeta {
  key: string;
  kind: "projects" | "builders" | "brokers" | "property_type" | "project_type";
  title: string;
  subtitle: string;
  total: number;
  viewAll: string;
}
/** A seller on a Top Builders / Top Brokers rail (search's BrokerResult). */
export interface FeedPerson {
  id: string; name: string; username: string | null; role: string | null;
  verified: boolean; avatarUrl: string | null; stats: string; listingCount: number;
}
export interface FeedSectionPage { items: FeedCard[]; people: FeedPerson[]; nextCursor: string | null }

export const feedApi = {
  /** The rails to draw, in order. Metadata only — each rail loads its own cards. */
  sections: (filter?: string) =>
    req<{ sections: FeedSectionMeta[] }>(`/feed/sections${filter && filter !== "all" ? `?filter=${filter}` : ""}`),
  section: (key: string, opts: { filter?: string; sort?: string; cursor?: string | null } = {}) =>
    req<FeedSectionPage>(`/feed/section?${new URLSearchParams({
      key,
      ...(opts.filter ? { filter: opts.filter } : {}),
      ...(opts.sort ? { sort: opts.sort } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
    }).toString()}`),
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
  /**
   * The same endpoint, with a project as the subject (0084). A project chat is
   * live immediately, so the reply carries the thread to open.
   */
  projectInquiry: (projectId: string, body: { message: string; unitId?: string }) =>
    req<{ sent: boolean; alreadySent: boolean; threadId: string | null }>("/inquiries", "POST", { projectId, ...body }),
  report: (subjectType: "listing" | "project" | "requirement", subjectId: string, reason: string, note?: string | null) =>
    req<{ reported: boolean }>("/reports", "POST", { subjectType, subjectId, reason, note }),
};
