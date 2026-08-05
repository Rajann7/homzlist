import "server-only";
import { headers } from "next/headers";

/**
 * The two things the OAuth start and its callback must agree on, kept out of
 * both route files: a Next route module may only export handlers, and a
 * redirect_uri that drifts between the two ends is rejected by Google with an
 * error that says nothing about which side is wrong.
 */

export const OAUTH_STATE_COOKIE = "hz_admin_oauth";

/**
 * Absolute callback on the host the BROWSER used.
 *
 * Not `new URL(path, req.url)`: inside a route handler Next reports `req.url`
 * as the internal origin (http://localhost:3000), not account.localhost — so
 * building from it sent the admin to the PUBLIC host, where none of their
 * host-only admin cookies exist. Google would also reject the mismatched
 * redirect_uri outright.
 *
 * The Host header is the browser's own answer, which is why it is the right
 * source here; a spoofed one only ever produces a redirect_uri Google does not
 * recognise, for the request that spoofed it.
 */
export async function adminCallbackUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}/api/v1/admin/auth/google/callback`;
}

/**
 * A same-host redirect that cannot leak onto another host.
 *
 * Location may be a relative reference (RFC 7231 §7.1.2) and the browser
 * resolves it against the URL it actually requested — which is exactly the
 * behaviour wanted here, and needs no trust in any header at all.
 */
export function redirectToPath(path: string): Response {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new Response(null, { status: 307, headers: { Location: safe } });
}
