"use client";

/**
 * Saved-account hints for the S5 "Continue as" picker (P1). These are UI
 * CONVENIENCE only — display hints (name, masked number, photo) plus the raw
 * number used to re-trigger OTP. NO tokens, NO session, NO business flags are
 * stored (backend-lock): tapping an account still runs a full server-verified
 * OTP login. Lives in localStorage, per-device, and is safe to clear anytime.
 */
export interface SavedAccountHint {
  name: string;
  phone: string; // used only to pre-fill the OTP request; server always re-validates
  phoneMasked: string;
  photoUrl?: string | null;
}

const KEY = "hz-saved-accounts";
const MAX = 5;

export function getSavedAccounts(): SavedAccountHint[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(arr) ? arr.filter((a) => a && typeof a.phone === "string") : [];
  } catch {
    return [];
  }
}

/** Remember (or refresh) an account hint; most-recent first, capped at MAX. */
export function rememberAccount(a: SavedAccountHint): void {
  if (typeof window === "undefined" || !a.phone) return;
  const list = [a, ...getSavedAccounts().filter((x) => x.phone !== a.phone)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / disabled — hints are non-essential */
  }
}

export function forgetAccount(phone: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(getSavedAccounts().filter((x) => x.phone !== phone)));
  } catch {
    /* non-essential */
  }
}
