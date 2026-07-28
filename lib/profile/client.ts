"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/** Client-side profile API helpers (talk to /api/v1/profile + number-change). */

async function req<T>(path: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; [k: string]: unknown } }> {
  const res = await apiFetch(`/api/v1${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    // Same reason as lib/listings/client: the profile re-reads collections and
    // /profile/me right after changing them, and the browser's HTTP cache will
    // otherwise answer with the pre-change response.
    cache: "no-store",
  });
  return res.json();
}

export interface Badges {
  phone: boolean;
  id: boolean;
  rera: boolean;
}
export interface OwnProfile {
  id: string;
  username: string | null;
  name: string | null;
  role: "owner" | "broker" | "builder" | null;
  photoUrl: string | null;
  bio: string | null;
  email: string | null;
  cityId: string | null;
  cityName: string | null;
  phoneMasked: string;
  memberSince: string;
  responseLabel: string | null;
  badges: Badges;
  // `views` is still returned (the listing manager shows it) — the P9 stat row
  // now uses `requirements` (owner/broker) or `messages` (builder) in its place.
  stats: { listings: number; views: number; leads: number; projects?: number; requirements: number; messages: number };
  state: string;
  company: { logoUrl: string | null; establishedYear: number | null; projectsDone: number | null; officeAddress: string | null; areasCovered: string[] };
}

/** One P9 S1 featured circle. Counts and cover are the server's answer. */
export interface FeaturedCollection {
  id: string;
  name: string;
  count: number;
  coverUrl: string | null;
}

/** A listing inside a collection, as the collection sheet renders it. */
export interface FeaturedItem {
  id: string;
  title: string | null;
  price: string;
  coverUrl: string | null;
  subtitle: string;
}

/** A builder's project as a visitor sees it (P9 S2 Projects tab). */
export interface PublicProject {
  id: string;
  name: string;
  coverUrl: string | null;
  areaLabel: string | null;
  /** Cheapest unit, already formatted server-side ("₹65 Lakh"), or null. */
  priceFrom: string | null;
  buildStatusLabel: string | null;
  possessionLabel: string | null;
}

export const profileApi = {
  me: () => req<{ profile: OwnProfile }>("/profile/me", "GET"),
  // ---- featured collections (P9 S1) ----------------------------------------
  featured: () => req<{ items: FeaturedCollection[]; max: number; maxItems: number }>("/profile/featured", "GET"),
  createFeatured: (name: string, listingIds: string[]) =>
    req<{ id: string }>("/profile/featured", "POST", { name, listingIds }),
  featuredItems: (id: string) => req<{ id: string; name: string; items: FeaturedItem[] }>(`/profile/featured/${id}`, "GET"),
  deleteFeatured: (id: string) => req<{ removed: boolean }>(`/profile/featured/${id}`, "DELETE"),
  /** The same circles as seen by a VISITOR (P9 S2) — public, live listings only. */
  publicFeatured: (username: string) =>
    req<{ items: FeaturedCollection[] }>(`/profile/${encodeURIComponent(username)}/featured`, "GET"),
  publicFeaturedItems: (username: string, id: string) =>
    req<{ id: string; name: string; items: FeaturedItem[] }>(`/profile/${encodeURIComponent(username)}/featured/${id}`, "GET"),
  update: (patch: Record<string, unknown>) => req<{ profile: OwnProfile }>("/profile/me", "PATCH", patch),
  publicProfile: (username: string) => req<{ profile: any }>(`/profile/${encodeURIComponent(username)}`, "GET"),
  /** Live listings for someone else's profile grid (P9 S2). */
  publicListings: (username: string) =>
    req<{ items: { id: string; title: string | null; price: string; coverUrl: string | null; areaLabel: string | null; kind: "sell" | "rent" }[] }>(
      `/profile/${encodeURIComponent(username)}/listings`, "GET",
    ),
  /** Live projects for a builder's public profile — the P9 S2 Projects tab. */
  publicProjects: (username: string) =>
    req<{ items: PublicProject[] }>(`/profile/${encodeURIComponent(username)}/projects`, "GET"),
  verificationStatus: () => req<{ verification: any }>("/profile/verification/status", "GET"),
  submitId: (docType: string, docKey?: string | null) => req<{ status: string }>("/profile/verification/id", "POST", { docType, docKey }),
  submitRera: (reraNumber: string, docKey?: string | null) => req<{ status: string }>("/profile/verification/rera", "POST", { reraNumber, docKey }),
  cancelVerification: (level: "id" | "rera") => req<{ cancelled: boolean }>("/profile/verification/cancel", "POST", { level }),
  accountStatus: () => req<{ inGoodStanding: boolean; events: any[] }>("/profile/account-status", "GET"),
  /** P9 ⋯ — block / report a user from their public profile (persists for real). */
  blockUser: (userId: string) => req<{ blocked: boolean }>("/profile/moderation", "POST", { userId, action: "block" }),
  reportUser: (userId: string, reason: string, note?: string | null) =>
    req<{ reported: boolean }>("/profile/moderation", "POST", { userId, action: "report", reason, note }),
  requestRoleChange: (toRole: string) => req<{ requested: boolean }>("/profile/role-change-request", "POST", { toRole }),
  // number-change dual-OTP
  ncStart: () => req<{ otpSession: string; resendIn: number; maskedCurrent: string; devCode?: string }>("/auth/number-change/start", "POST"),
  ncVerifyOld: (otpSession: string, code: string) => req<{ verified: boolean }>("/auth/number-change/verify-old", "POST", { otpSession, code }),
  ncSendNew: (newPhone: string) => req<{ otpSession: string; resendIn: number; devCode?: string }>("/auth/number-change/send-new", "POST", { newPhone }),
  ncVerifyNew: (otpSession: string, code: string) => req<{ updated: boolean; phoneMasked: string }>("/auth/number-change/verify-new", "POST", { otpSession, code }),
};

/**
 * Upload a profile photo, company logo, or verification document.
 *
 * Same three-step shape as listing photos: presign → PUT straight to storage →
 * commit. The server picks the bucket from `kind`, so an ID document can never
 * be steered into the public bucket by the client, and the commit step
 * magic-byte validates the bytes before anything is saved.
 */
export async function uploadProfileMedia(
  kind: "avatar" | "logo" | "doc",
  file: File,
): Promise<{ ok: true; url?: string; key?: string } | { ok: false; error: string }> {
  const pre = await req<{ grant: { url: string; key: string; headers: Record<string, string> } }>(
    "/uploads/presign",
    "POST",
    { kind, contentType: file.type, size: file.size },
  );
  if (!pre.ok) {
    const c = pre.error.code;
    return {
      ok: false,
      error:
        c === "FILE_TYPE_BLOCKED" ? (kind === "doc" ? "Use a JPG, PNG or PDF" : "Use a JPG, PNG or WebP image")
        : c === "FILE_TOO_LARGE" ? "That file is too large (max 25MB)"
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

  const commit = await req<{ url?: string; key?: string }>("/uploads/commit", "POST", { key: g.key, kind });
  if (!commit.ok) {
    const c = commit.error.code;
    return { ok: false, error: c === "FILE_TYPE_BLOCKED" ? "That file isn't a valid image" : "Couldn't save that file" };
  }
  return { ok: true, ...commit.data };
}

/**
 * Clear the profile photo (column + object). Works both for a live session and
 * inside the registration window, where PATCH /profile/me isn't reachable yet.
 */
export async function removeProfilePhoto(): Promise<{ ok: boolean }> {
  const res = await req<{ removed: boolean }>("/uploads/avatar", "DELETE");
  return { ok: res.ok };
}
