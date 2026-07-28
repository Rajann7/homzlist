"use client";

/**
 * The browser's fetch for every /api/v1 call, with one job the plain one can't
 * do: survive an expired access token.
 *
 * Access tokens live 15 minutes (lib/auth/session). The middleware refreshes on
 * NAVIGATION — a gated route with a stale cookie bounces through /login, which
 * silently rotates and returns. Nothing refreshes on a screen that never
 * navigates, and the create form is exactly that: type picker → 30-odd fields →
 * a five-level location cascade, all client-rendered. Sit on it past the token
 * and "Continue to photos" POSTs, gets a 401, and the form shows "Couldn't
 * submit right now" forever — the refresh cookie is sitting right there unused.
 * Found live: a listing filled to completion could not be submitted at all.
 *
 * So: a 401 triggers ONE refresh and ONE retry. Concurrent 401s share a single
 * in-flight refresh (a screen that fires four requests must not rotate the
 * refresh token four times — rotation invalidates the previous one). If the
 * refresh itself fails the session is genuinely gone, and we hand the 401 back
 * so the caller renders its own error.
 */

let inFlight: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  inFlight ??= (async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
      const json = (await res.json()) as { ok?: boolean };
      return Boolean(json?.ok);
    } catch {
      return false;
    } finally {
      // Cleared on the microtask after every waiter has read it, so the next
      // 401 (a genuinely dead session, say) starts a fresh attempt.
      queueMicrotask(() => { inFlight = null; });
    }
  })();
  return inFlight;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: "same-origin", ...init });
  if (res.status !== 401) return res;
  if (!(await refreshOnce())) return res;
  return fetch(input, { credentials: "same-origin", ...init });
}
