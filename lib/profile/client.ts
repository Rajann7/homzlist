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
  submitId: (docType: string) => req<{ status: string }>("/profile/verification/id", "POST", { docType }),
  submitRera: (reraNumber: string) => req<{ status: string }>("/profile/verification/rera", "POST", { reraNumber }),
  accountStatus: () => req<{ inGoodStanding: boolean; events: any[] }>("/profile/account-status", "GET"),
  requestRoleChange: (toRole: string) => req<{ requested: boolean }>("/profile/role-change-request", "POST", { toRole }),
  // number-change dual-OTP
  ncStart: () => req<{ otpSession: string; resendIn: number; maskedCurrent: string; devCode?: string }>("/auth/number-change/start", "POST"),
  ncVerifyOld: (otpSession: string, code: string) => req<{ verified: boolean }>("/auth/number-change/verify-old", "POST", { otpSession, code }),
  ncSendNew: (newPhone: string) => req<{ otpSession: string; resendIn: number; devCode?: string }>("/auth/number-change/send-new", "POST", { newPhone }),
  ncVerifyNew: (otpSession: string, code: string) => req<{ updated: boolean; phoneMasked: string }>("/auth/number-change/verify-new", "POST", { otpSession, code }),
};
