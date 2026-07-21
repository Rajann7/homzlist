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

export const authApi = {
  requestOtp: (phone: string, hp = "") =>
    post<{ otpSession: string; resendIn: number; attemptsLeft: number; devCode?: string }>("/otp/request", { phone, hp }),
  verifyOtp: (otpSession: string, code: string) =>
    post<{ isNew: true; next: "role" } | { isNew: false; user: unknown; next: "seller" | "suspended" }>("/otp/verify", { otpSession, code }),
  resendOtp: (otpSession: string) => post<{ resendIn: number; devCode?: string }>("/otp/resend", { otpSession }),
  register: (input: { role: string; name: string; cityId: string; photoUrl?: string | null; consent18: boolean; consentDpdp: boolean; hp?: string }) =>
    post<{ user: unknown; redirect: string }>("/register", input),
  logout: () => post<{ loggedOut: boolean }>("/logout"),
  refresh: () => post<{ refreshed: boolean }>("/refresh"),
};

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
