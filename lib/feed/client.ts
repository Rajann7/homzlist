"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import { enqueue } from "@/lib/pwa/offline-queue";
import { syncAppBadge } from "@/lib/pwa/app-badge";
import type { BlogCard } from "@/lib/content/client";

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
  kind: "projects" | "newly_added" | "builders" | "brokers" | "featured" | "sell_cta" | "news";
  title: string;
  subtitle: string;
  total: number;
  viewAll: string;
}
/** A seller on a Featured Developers / Featured Brokers rail (search's BrokerResult). */
export interface FeedPerson {
  id: string; name: string; username: string | null; role: string | null;
  verified: boolean; avatarUrl: string | null; stats: string; listingCount: number;
}
/**
 * One card on the "News and Articles" rail. Deliberately the SAME type the blog
 * screen uses rather than a copy of its fields — the rail renders the blog's own
 * cover/date components, so a field added there must not need adding here too.
 */
export type FeedPost = BlogCard;
export interface FeedSectionPage { items: FeedCard[]; people: FeedPerson[]; posts: FeedPost[]; nextCursor: string | null }

/**
 * The feed's first paint, rendered on the server and shipped with the page
 * (lib/feed/initial). It is the answer to the two requests the browser used to
 * have to make before the first card could exist: which rails, and what is in
 * the first one.
 *
 * `filter` and `cityId` say what it was built for. The client uses it only while
 * its own view still matches; a Buy/Rent chip or a different city falls back to
 * the API exactly as before.
 */
export interface FeedInitial {
  filter: string;
  cityId: string | null;
  /**
   * Whether the server built this for a SIGNED-IN viewer. Not identity — just
   * which of the two feeds it is. An access token lives 15 minutes, so a user
   * coming back after a break renders as a guest and only becomes themselves
   * once the client refreshes the token; without this the primed rails would
   * keep showing them the guest feed (their own listings included, which their
   * own feed never shows) until something reloaded it.
   */
  viewer: boolean;
  sections: FeedSectionMeta[];
  /**
   * Set when the viewer's chosen city has nothing live and the rails above are
   * therefore ALL-INDIA. The screen turns it into the notice that says so.
   */
  emptyCity: { cityName: string } | null;
  /**
   * EVERY fetchable rail's first page, not just the top one (9 Aug 2026 — the
   * home screen no longer lazy loads anything). Keyed by section, so a rail
   * picks out its own; a rail missing from here (its query failed) falls back to
   * fetching itself.
   */
  primed: { key: string; page: FeedSectionPage }[];
  /** The story row, rendered with the page rather than fetched after hydration. */
  stories: StoryCircle[];
  /**
   * The home footer. Both halves are DB-owned: the legal links are `cms_pages`
   * rows and the tagline is `branding_settings.tagline`, so neither is a string
   * typed into the component.
   */
  footer: { legal: { slug: string; title: string }[]; tagline: string };
}

/**
 * The GUEST's city, sent with every feed read.
 *
 * A signed-in viewer's city lives on their profile and the server reads it from
 * the session, so this is `null` for them and ignored server-side even if sent.
 * A guest has no profile row, so without this the city chip re-labelled itself
 * and every query stayed unscoped — Mumbai on the chip, Rajkot in the feed.
 */
const city = (cityId?: string | null): Record<string, string> => (cityId ? { city: cityId } : {});

export const feedApi = {
  /** The rails to draw, in order. Metadata only — each rail loads its own cards. */
  sections: (filter?: string, cityId?: string | null) =>
    req<{ sections: FeedSectionMeta[]; emptyCity: { cityName: string } | null }>(`/feed/sections?${new URLSearchParams({
      ...(filter && filter !== "all" ? { filter } : {}),
      ...city(cityId),
    }).toString()}`),
  section: (key: string, opts: { filter?: string; sort?: string; cursor?: string | null; cityId?: string | null } = {}) =>
    req<FeedSectionPage>(`/feed/section?${new URLSearchParams({
      key,
      ...(opts.filter ? { filter: opts.filter } : {}),
      ...(opts.sort ? { sort: opts.sort } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      ...city(opts.cityId),
    }).toString()}`),
  list: (opts: { filter?: string; sort?: string; cursor?: string | null; cityId?: string | null } = {}) =>
    req<FeedResult>(`/feed?${new URLSearchParams({ ...(opts.filter ? { filter: opts.filter } : {}), ...(opts.sort ? { sort: opts.sort } : {}), ...(opts.cursor ? { cursor: opts.cursor } : {}), ...city(opts.cityId) }).toString()}`),
  builderDashboard: () =>
    req<{ projects: { id: string; name: string; coverUrl: string | null; views: number; leads: number; spark: number[] }[]; sections: { label: string | null; items: any[] }[] }>("/feed/builder-dashboard"),
  newCount: (since: string, cityId?: string | null) =>
    req<{ count: number }>(`/feed/new-count?${new URLSearchParams({ since, ...city(cityId) }).toString()}`),
  banner: () => req<{ banner: { id: string; title: string; subtitle: string | null; imageUrl: string | null; targetUrl: string | null; frequencyCap: number } | null }>("/feed/banner"),
  /**
   * The header bell + Messages counts. Also the ONE place the installed app's
   * icon badge is set from (Doc3 §98) — so the OS number is always the server's
   * number, and every screen that already reads this keeps it current.
   */
  badges: async () => {
    const res = await req<{ messages: number; notifications: number | null }>("/feed/badges");
    if (res.ok) syncAppBadge(res.data);
    return res;
  },
  notInterested: (target: { typeCode?: string; areaId?: string }) => req<{ ok: boolean }>("/feed/not-interested", "POST", target),
};

export const storiesApi = {
  list: (cityId?: string | null) => req<{ circles: StoryCircle[] }>(`/stories?${new URLSearchParams(city(cityId)).toString()}`),
  seen: (segmentId: string) => req<{ ok: boolean }>(`/stories/${segmentId}/seen`, "POST", {}),
  segment: (segmentId: string) => req<{ segment: StorySegment }>(`/stories/${segmentId}`),
};

export const interactionsApi = {
  /**
   * `currentlySaved` is only read when the request cannot leave the device: the
   * queued toggle's outcome is the opposite of what the card shows right now, so
   * the heart can settle immediately and still be correct when it replays
   * (Doc3 §98 offline action queue). Online, the server's answer wins as before.
   */
  toggleSave: async (listingId: string, currentlySaved?: boolean) => {
    const res = await req<{ saved: boolean }>("/saves", "POST", { listingId });
    if (res.ok || res.error.code !== "OFFLINE") return res as ApiResult<{ saved: boolean; queued?: boolean }>;
    // A caller that doesn't know the current state (the explore peek) can't be
    // given an optimistic answer — a queued TOGGLE would land on the opposite of
    // whatever we guessed. It gets the honest offline error instead.
    if (currentlySaved === undefined) return res as ApiResult<{ saved: boolean; queued?: boolean }>;
    const queued = await enqueue({ kind: currentlySaved ? "unsave" : "save", path: "/api/v1/saves", method: "POST", body: { listingId } });
    if (!queued) return res as ApiResult<{ saved: boolean; queued?: boolean }>;
    return { ok: true as const, data: { saved: !currentlySaved, queued: true } };
  },
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
