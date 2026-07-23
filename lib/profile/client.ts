"use client";

/** Client-side profile API helpers (talk to /api/v1/profile + number-change). */

async function req<T>(path: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; [k: string]: unknown } }> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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
  stats: { listings: number; views: number; leads: number; projects?: number };
  state: string;
  company: { logoUrl: string | null; establishedYear: number | null; projectsDone: number | null; officeAddress: string | null; areasCovered: string[] };
}

export const profileApi = {
  me: () => req<{ profile: OwnProfile }>("/profile/me", "GET"),
  update: (patch: Record<string, unknown>) => req<{ profile: OwnProfile }>("/profile/me", "PATCH", patch),
  publicProfile: (username: string) => req<{ profile: any }>(`/profile/${encodeURIComponent(username)}`, "GET"),
  verificationStatus: () => req<{ verification: any }>("/profile/verification/status", "GET"),
  submitId: (docType: string, docKey?: string | null) => req<{ status: string }>("/profile/verification/id", "POST", { docType, docKey }),
  submitRera: (reraNumber: string, docKey?: string | null) => req<{ status: string }>("/profile/verification/rera", "POST", { reraNumber, docKey }),
  accountStatus: () => req<{ inGoodStanding: boolean; events: any[] }>("/profile/account-status", "GET"),
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
