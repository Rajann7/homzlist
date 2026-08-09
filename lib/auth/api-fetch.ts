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
 *
 * ONE EXCEPTION, ADDED AFTER WATCHING A GUEST BROWSE: a guest has no refresh
 * cookie at all, so every 401 they collect — and a guest collects one per
 * navigation, because `/profile/me` is how the feed asks who it is talking to —
 * fired a POST /api/v1/auth/refresh that could only ever answer 401 as well.
 * Two red lines in the console per screen, for a question already answered, on
 * a browser that will never have a different answer until the page reloads.
 * A refresh that comes back with an explicit 401 therefore LATCHES: there is
 * demonstrably no refresh cookie on this document, so we stop asking.
 *
 * The latch is deliberately narrow. A refresh that fails for any OTHER reason —
 * offline, a 5xx, a parse error — does NOT latch, because those say nothing
 * about whether a session exists, and latching on them would strand a genuinely
 * signed-in user on stale-token errors until they navigated. Only the server's
 * own "you have no refresh token" is treated as final, and only for the life of
 * this document: signing in navigates (login lives on the seller host), which
 * loads a fresh module and clears it.
 */

let inFlight: Promise<boolean> | null = null;
/** Server said, in so many words, that this document carries no refresh token. */
let noRefreshCookie = false;

async function refreshOnce(): Promise<boolean> {
  if (noRefreshCookie) return false;
  inFlight ??= (async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
      // 401 here is definitive — the route's only unauthorized answer is "no
      // usable refresh token". Anything else (5xx, network) stays retryable.
      if (res.status === 401) { noRefreshCookie = true; return false; }
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
