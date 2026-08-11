import { NextResponse, type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { refreshUserSession } from "@/lib/auth/refresh";
import { cookieOpts } from "@/lib/auth/session";
import { loginHref, sanitizeNext } from "@/lib/auth/next-url";
import { HINT_BOUNCE_PARAM } from "@/lib/auth/session-hint";
import { publicOriginFromRequest } from "@/lib/hosts";

/**
 * /api/v1/auth/refresh (Doc7 §1.9). Rotate refresh + mint fresh access.
 * Invalidates the session if the account was suspended/role-changed/deleted (Doc9 §1).
 *
 * POST — the client-side silent refresh (AuthFlow's splash).
 * GET  — the NAVIGATION bridge. The access token lasts 15 minutes and the
 *        middleware can only verify THAT (KV lives in Node, not on the Edge), so
 *        every page request made 15 minutes after the last one looked exactly
 *        like a signed-out visitor: the seller host bounced it to /login and the
 *        public host threw away the cross-subdomain session hint, which is how a
 *        signed-in user ended up being shown a login screen on the main domain
 *        and on any link they pasted. Middleware now sends those requests here
 *        instead — the pair is rotated and the browser continues to the page it
 *        asked for. Mirrors /api/v1/admin/auth/refresh, which already did this.
 */
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  return (await refreshUserSession()) ? ok({ refreshed: true }) : fail("UNAUTHORIZED");
}

/**
 * A relative Location on purpose: the seller host is reached under several
 * names (seller.homzlist.com, seller.lvh.me:3000, a preview URL), and rebuilding
 * an absolute URL from `req.url` can name the wrong one — the exact mistake
 * middleware.ts documents. `next` is reduced to a same-host path first, so a
 * crafted link can never turn this into an open redirect.
 *
 * `hzb=1` means the request being revived is a shared/pasted MAIN-DOMAIN link
 * that the public host handed over on the strength of the session hint. If the
 * session turns out to be dead, that visit must go back to the public host and
 * render as a guest — a shared link never becomes a login wall. The host is
 * derived from our own Host header, never from the query, so this stays a
 * same-deployment redirect.
 */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const next = sanitizeNext(params.get("next")) ?? "/";
  const fromSharedLink = params.get(HINT_BOUNCE_PARAM) === "1";
  // A KV/DB hiccup must not turn into an error page in the middle of someone's
  // navigation — it means "could not revive", which is what /login is for.
  const refreshed = await refreshUserSession().catch(() => false);

  let location: string;
  if (refreshed) location = next;
  else if (fromSharedLink) {
    const back = new URL(next, await publicOriginFromRequest());
    back.searchParams.set(HINT_BOUNCE_PARAM, "1");
    location = back.toString();
  } else location = loginHref(next);

  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: location, "cache-control": "no-store" },
  });
  if (refreshed) {
    // The middleware's loop-breaker (REFRESH_BRIDGE_COOKIE): if the request we
    // are sending back arrives still looking signed-out, it must go to /login
    // rather than round-trip here forever. 10s is long enough for the redirect
    // and far shorter than the 15-minute access token it just minted.
    res.cookies.set("hz_rf", "1", { ...cookieOpts(10) });
  }
  return res;
}
