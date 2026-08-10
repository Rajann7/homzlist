/**
 * The `?next=` contract — ONE place that decides where a user lands after
 * signing in or registering.
 *
 * Every guest CTA in the app ends at `/login`. Until now that is all it said,
 * so a guest who tapped "Save" on a listing, "Post a Requirement" from a search
 * with filters, or the grievance link on the legal reader was dropped on the
 * feed after signing in, with no way back to what they were doing. (The legal
 * reader already *sent* `?next=`, which nothing read — a promise with no job
 * behind it.)
 *
 * The value is always reduced to a PATH, never a host. That is the whole
 * open-redirect defence: there is no input that can make this return a URL
 * pointing at another origin, so the caller can only ever navigate within the
 * host it is already on. Login runs on the seller host, which is exactly where
 * a signed-in user belongs, so a path is also the right target.
 *
 * Isomorphic on purpose — the middleware (Edge), server components and client
 * components all have to agree on what a legal `next` is.
 */

/** Paths that must never be a post-login destination. */
function forbidden(pathOnly: string): boolean {
  if (pathOnly.startsWith("/api/")) return true;
  if (pathOnly === "/login" || pathOnly.startsWith("/login/")) return true;
  // Internal rewrite prefixes — reachable only through the middleware's own
  // rewrite, never as a destination someone should be sent to.
  if (pathOnly.startsWith("/seller") || pathOnly.startsWith("/account")) return true;
  return false;
}

/**
 * Reduce an untrusted `next` to a same-host path, or null.
 *
 * Rejects: anything with a scheme (absolute URLs, `javascript:`, `data:`),
 * anything not starting with a single "/", protocol-relative ("//evil.com") and
 * its backslash variant ("/\evil.com", which several browsers normalise to a
 * host), the API surface, and /login itself (which would loop).
 */
export function sanitizeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;

  // Anything carrying a scheme is refused outright rather than "cleaned up".
  // Every caller in the app passes a path, so accepting an absolute URL buys
  // nothing and costs a class of surprise: `next=https://evil.com/x` reduced to
  // its path would still send the user somewhere they did not ask to go, on our
  // own host, which is exactly the confusion an open-redirect check is for.
  // `javascript:` and `data:` are refused by the same line.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;

  if (!v.startsWith("/")) return null;
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  if (v.includes("\n") || v.includes("\r")) return null;

  const pathOnly = v.split(/[?#]/)[0];
  if (forbidden(pathOnly)) return null;
  return v;
}

/** `/login`, plus `?next=` when there is a legal destination to come back to. */
export function loginHref(next?: string | null): string {
  const n = sanitizeNext(next);
  return n ? `/login?next=${encodeURIComponent(n)}` : "/login";
}

/**
 * Where the browser is right now, in `next` form. Safe to call during render —
 * it returns "/" on the server, and callers that render an href use
 * `useLoginHref` so the two renders agree.
 */
export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
