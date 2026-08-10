/**
 * The cross-subdomain SESSION HINT — how the public host knows this device has
 * a seller session, without ever being able to read one.
 *
 * The problem it solves: shares always point at the main domain (that is the
 * link people paste into WhatsApp), but the authenticated experience lives on
 * seller.*, and the real session cookies are HOST-ONLY by design (middleware,
 * "per-subdomain isolation"). So homzlist.com genuinely cannot tell a signed-in
 * user from a guest, and a signed-in user opening their own shared listing was
 * shown the guest view with a "Sign in to save, inquire and chat" strip.
 *
 * What this cookie is: the single byte "1", set on the registrable domain so
 * both hosts see it. It carries NO identity, NO role, NO entitlement, and it
 * grants nothing — the seller host verifies the real `hz_at`/`hz_rt` exactly as
 * before, and every API still authorises server-side. It is a ROUTING hint, in
 * the same class as a theme preference, which is why it does not violate the
 * "no business data outside the server" rule: forging it gets an attacker a
 * redirect to a login screen.
 *
 * What happens when it is stale (session expired, cookies cleared on one host):
 * the seller host finds no session, bounces the visit straight back to the
 * public host and deletes the hint — so a shared link never turns into a login
 * wall. See middleware.ts, `HINT_BOUNCE_PARAM`.
 *
 * httpOnly because nothing in the browser needs to read it; only the two
 * middlewares do.
 */
export const SESSION_HINT_COOKIE = "hz_sh";

/**
 * The query marker on the one-hop public → seller redirect, so the seller host
 * can tell "I was sent here by a stale hint" from a normal visit and bounce
 * back instead of demanding a login. Stripped again either way, so it never
 * survives into the address bar or into a re-share.
 */
export const HINT_BOUNCE_PARAM = "hzb";

/**
 * The domain to scope the hint to: the host with any `seller.`/`account.` label
 * removed, so it is shared by every zone.
 *
 * Returns null where a Domain attribute cannot work or is not needed — a bare
 * IP (no subdomains exist) and a host with no dot other than `localhost` (which
 * browsers do accept as a cookie domain, and `seller.localhost` needs it).
 */
export function sessionHintDomain(host: string): string | null {
  const h = (host ?? "").split(":")[0].toLowerCase();
  if (!h) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  const base = h.replace(/^(seller|account)\./, "");
  if (!base) return null;
  if (base !== "localhost" && !base.includes(".")) return null;
  return base;
}
