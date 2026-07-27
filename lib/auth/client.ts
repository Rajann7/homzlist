"use client";

/**
 * Client-side auth API helpers (talk to /api/v1/auth). No secrets, no business
 * flags — the server decides everything (Doc7 §19). Friendly errors only.
 */
export interface ApiError {
  code: string;
  message_key: string;
  [k: string]: unknown;
}

async function post<T>(path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const res = await fetch(`/api/v1/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/** One row of the P9 S1 switch sheet — every field comes from the server. */
export interface DeviceAccount {
  id: string;
  username: string;
  name: string;
  photoUrl: string | null;
  roleCity: string;
  current: boolean;
}

async function get<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const res = await fetch(`/api/v1/auth${path}`, { cache: "no-store" });
  return res.json();
}

export const authApi = {
  /** Accounts signed in on THIS device (server-verified sessions, live profile data). */
  accounts: () => get<{ accounts: DeviceAccount[] }>("/accounts"),
  switchAccount: (profileId: string) => post<{ switched: boolean; profileId: string }>("/switch", { profileId }),
  removeAccount: (profileId: string) => post<{ removed: boolean; profileId: string }>("/accounts/remove", { profileId }),
  requestOtp: (phone: string, hp = "") =>
    post<{ otpSession: string; resendIn: number; attemptsLeft: number; devCode?: string }>("/otp/request", { phone, hp }),
  verifyOtp: (otpSession: string, code: string) =>
    post<{ isNew: true; next: "role" } | { isNew: false; user: unknown; next: "seller" | "suspended" }>("/otp/verify", { otpSession, code }),
  resendOtp: (otpSession: string) => post<{ resendIn: number; devCode?: string }>("/otp/resend", { otpSession }),
  register: (input: { role: string; name: string; cityId: string; email?: string | null; consent18: boolean; consentDpdp: boolean; hp?: string }) =>
    post<{ user: unknown; redirect: string }>("/register", input),
  logout: () => post<{ loggedOut: boolean; switchedTo: string | null }>("/logout"),
  refresh: () => post<{ refreshed: boolean }>("/refresh"),
  /** P10 S9 Login activity — devices signed in on this account (current flagged). */
  sessions: () => get<{ sessions: SessionRow[] }>("/sessions"),
  revokeSession: (id: string) => post<{ revoked: boolean }>(`/sessions/${id}/revoke`),
};

/** One device row of the P10 S9 login-activity list (server-verified session). */
export interface SessionRow {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export async function fetchCities(q = ""): Promise<Array<{ id: string; name: string; state: string; propertyCount: number }>> {
  const res = await fetch(`/api/v1/locations/cities${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const json = await res.json();
  return json.ok ? json.data.cities : [];
}

/** Friendly EN messages by error code. Never shows raw detail. */
export function friendlyError(err: ApiError): string {
  switch (err.code) {
    case "OTP_INVALID":
      return typeof err.attemptsLeft === "number"
        ? `Incorrect code. ${err.attemptsLeft} attempt${err.attemptsLeft === 1 ? "" : "s"} left.`
        : "Incorrect code. Please try again.";
    case "OTP_LOCKED":
      return "Too many wrong attempts. Try again later.";
    case "NUMBER_LOCKED":
      return "This number is locked for 24 hours. Contact support.";
    case "RATE_LIMITED":
      return "Too many attempts. Please try again in a little while.";
    case "VALIDATION_ERROR":
      return "Please check the details and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
