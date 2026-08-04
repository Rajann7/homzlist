import "server-only";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";

/**
 * How a failed sign-in reaches the login SCREEN.
 *
 * The design's A1 draws the refused email back to the person reading it
 * ("Signed in as: nirav@gmail.com", template 56). That is personal data, so it
 * does not travel in a query string where it would land in server logs, the
 * Referer header and the browser's history. It goes in a short-lived, httpOnly,
 * host-only cookie that the login page reads and the next action clears — the
 * same one-shot flash the outcome itself needs anyway, since a refusal must not
 * still be on screen after "use a different account".
 */

const COOKIE = "hz_admin_login";
/** Long enough to survive the redirect back from Google, short enough to be a flash. */
const TTL_SEC = 120;

export type LoginOutcomeKind = "not_whitelisted" | "revoked" | "error";
export type LoginOutcome = { kind: LoginOutcomeKind; email: string };

const KINDS: LoginOutcomeKind[] = ["not_whitelisted", "revoked", "error"];

function opts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setLoginOutcome(outcome: LoginOutcome): void {
  const value = JSON.stringify(outcome);
  (cookies() as unknown as UnsafeUnwrappedCookies).set(COOKIE, Buffer.from(value).toString("base64url"), opts(TTL_SEC));
}

/**
 * Read the flash. Reading does not clear it: a Server Component may not write
 * cookies, so `clearLoginOutcome()` is called by the route that acts next
 * (starting another sign-in, or dismissing with "Use a different account").
 */
export function readLoginOutcome(): LoginOutcome | null {
  const raw = (cookies() as unknown as UnsafeUnwrappedCookies).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as LoginOutcome;
    return KINDS.includes(parsed?.kind) && typeof parsed.email === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLoginOutcome(): void {
  (cookies() as unknown as UnsafeUnwrappedCookies).set(COOKIE, "", opts(0));
}
