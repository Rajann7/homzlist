import { type NextRequest, NextResponse } from "next/server";
import { verifyAccessEdge } from "@/lib/auth/edge";
import { loginHref, sanitizeNext } from "@/lib/auth/next-url";
import { HINT_BOUNCE_PARAM, SESSION_HINT_COOKIE, sessionHintDomain } from "@/lib/auth/session-hint";
import { verifyAdminAccessEdge } from "@/lib/admin/edge";
import { edgeMaintenanceState } from "@/lib/system/maintenance-edge";

/**
 * Subdomain routing + session isolation + login-bypass sealing (Doc6 §4, Doc9 §28).
 *   homzlist.com          → (public) group   (served at "/")
 *   seller.homzlist.com   → (seller) group   (rewritten to "/seller/*")
 *   account.homzlist.com  → (admin)  group   (rewritten to "/account/*")
 *
 * The access-token cookie (hz_at) is verified here on the Edge (jose only). Cookies
 * are host-only → per-subdomain isolation. Refresh/rotation is a Node route; a
 * stale-access user hitting a gated route is bounced to /login, which silently
 * refreshes and returns them. Internal prefixes unreachable from the public host.
 */
const ACCESS_COOKIE = "hz_at";
const REFRESH_COOKIE = "hz_rt";
/** Multi-account pool (lib/auth/account-pool) — treated exactly like hz_rt. */
const POOL_COOKIE = "hz_accts";
/** The ADMIN session — a different cookie name on a different host (Doc9 §21). */
const ADMIN_ACCESS_COOKIE = "hz_admin_at";
const ADMIN_REFRESH_COOKIE = "hz_admin_rt";

type Zone = "public" | "seller" | "admin";
function getZone(host: string): Zone {
  const label = host.split(":")[0].toLowerCase().split(".")[0];
  if (label === "seller") return "seller";
  if (label === "account") return "admin";
  return "public";
}

/**
 * The first path segment of every screen that exists on BOTH hosts — the set a
 * signed-in device can safely be handed from homzlist.com to seller.homzlist.com.
 *
 * Shares always point at the main domain, so this is what turns a shared link
 * into the signed-in view for a user who already has a session (and leaves it
 * as the public guest page for everyone else).
 *
 * It is an explicit list rather than "everything", because `/area/*` and the
 * `[landing]` SEO pages are PUBLIC-ONLY — bouncing those to the seller host
 * would turn a working page into a 404. Keep it in step with
 * app/(seller)/seller/* : a segment only belongs here once the seller host
 * actually serves it.
 */
const SELLER_MIRRORED_SEGMENTS = new Set([
  "property",
  "project",
  "projects",
  "requirements",
  "profile",
  "search",
  "story",
  "blog",
  "legal",
  "messages",
  "notifications",
  "create",
]);

function mirroredOnSeller(pathname: string): boolean {
  if (pathname === "/") return true;
  return SELLER_MIRRORED_SEGMENTS.has(pathname.split("/")[1] ?? "");
}

/**
 * A redirect target on an EXPLICIT host.
 *
 * `new URL(request.url)` is not reliable for this: its host is the origin the
 * server was reached on, which is not always the Host header the browser used
 * (a proxy, a rewritten dev host, `seller.localhost` in front of :3000). A
 * seller-zone redirect built that way silently lands on the PUBLIC host, which
 * for a signed-in user means bouncing straight back again. Every redirect here
 * therefore names the host it means.
 */
function redirectTo(request: NextRequest, host: string, pathname: string, search = ""): NextResponse {
  const to = new URL(request.url);
  to.host = host;
  to.pathname = pathname;
  to.search = search;
  return NextResponse.redirect(to);
}

/** `/login?next=<where they were>` — the shared post-auth return contract. */
function loginRedirect(request: NextRequest, url: URL, host: string): NextResponse {
  const [path, query] = loginHref(`${url.pathname}${url.search}`).split("?");
  return redirectTo(request, host, path, query ? `?${query}` : "");
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname } = url;
  const host = request.headers.get("host") ?? "";
  const zone = getZone(host);

  const user = await verifyAccessEdge(request.cookies.get(ACCESS_COOKIE)?.value);

  /**
   * A31 read-only, enforced at the API — Doc5 A31 and Doc9's "no send even in
   * impersonation".
   *
   * 119 route files call getCurrentUser() directly; adding a check to each is
   * 119 chances to forget one. The session itself carries the restriction (a
   * signed `imp` claim), so ONE gate here covers every endpoint that exists and
   * every endpoint anyone adds later. Reads pass; nothing else does.
   */
  if (pathname.startsWith("/api")) {
    // The one exception, and it is the opposite of a hole: ending the session
    // is how an admin gets OUT of read-only mode. Refusing it would leave the
    // tab live until the 30-minute expiry with no way to close it.
    const isExit = pathname === "/api/v1/impersonate/exit";
    const isRead = ["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (user?.imp && !isExit && !isRead) {
      return NextResponse.json(
        { ok: false, error: { code: "IMPERSONATION_READ_ONLY", message: "This is a read-only admin view — sends, payments and messages are disabled." } },
        { status: 403 },
      );
    }

    /**
     * P12 S8 — the maintenance WRITE FREEZE.
     *
     * MaintenanceGate stops a visitor loading a screen. It does not stop an
     * already-open tab, or anything calling the API directly, from writing
     * straight through the window — which is precisely the case maintenance
     * exists for. This is the other half.
     *
     * Only WRITES are frozen: reads cost nothing to serve and the pages are
     * gated anyway, so a read-heavy site pays nothing for this check.
     *
     * Four things stay open, and each would otherwise be a trap:
     *   · /admin/*, which is where maintenance gets switched back OFF;
     *   · /auth/*, so a staff member can still sign in to go and do that;
     *   · /cron/*, which is shared-secret guarded and is often the reason the
     *     window is open at all;
     *   · /system/maintenance, which the maintenance page polls to know when
     *     to let go.
     *
     * The exemption is by PATH, never by `zone`. `zone` comes from the Host
     * header, which the client sets — so `Host: account.…` on any request would
     * have skipped the freeze with no admin session anywhere in sight. Host is
     * fine for ROUTING (the admin routes it reaches are gated again by
     * requireAdmin server-side); it is not something to hang a guard on.
     */
    if (!isRead) {
      const exempt =
        pathname.startsWith("/api/v1/auth/") ||
        pathname.startsWith("/api/v1/admin/") ||
        pathname.startsWith("/api/v1/cron/") ||
        pathname === "/api/v1/system/maintenance" ||
        isExit;
      if (!exempt) {
        const m = await edgeMaintenanceState();
        if (m.enabled) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "MAINTENANCE",
                message_key: "error.maintenance",
                message: m.message ?? "HomzList is under maintenance. We'll be right back.",
                eta: m.eta,
              },
            },
            { status: 503, headers: { "retry-after": "300" } },
          );
        }
      }
    }
    return NextResponse.next();
  }

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

  if (zone === "public") {
    if (pathname.startsWith("/seller") || pathname.startsWith("/account")) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
    // STRICT: the public host is the GUEST surface only (SEO/browse). ALL
    // authenticated experience lives on the seller subdomain. So:
    //   • login always happens on seller — public /login → seller /login;
    //   • a public session (legacy) is STRIPPED so public renders logged-out
    //     content on this very request, and the cookies are cleared so it stays
    //     that way. A signed-in user visiting the public host therefore sees the
    //     guest view; their content is only on seller.<host>.
    if (isLogin) {
      // The search string used to be WIPED here, which silently ate the whole
      // `?next=` contract: every guest CTA on the public host (save, inquire,
      // report, "Post a Requirement", the grievance link) sends the user to
      // /login with where-to-come-back-to attached, and this hop threw it away
      // before the login screen ever saw it. Only the two params that mean
      // something to the flow survive, re-sanitised — nothing else from a
      // public URL is carried onto the seller host.
      const next = sanitizeNext(url.searchParams.get("next"));
      const carried = new URLSearchParams();
      if (next) carried.set("next", next);
      if (url.searchParams.get("add") === "1") carried.set("add", "1");
      return redirectTo(request, `seller.${host}`, "/login", carried.toString() ? `?${carried}` : "");
    }

    /**
     * A device that already HAS a session, opening a main-domain link.
     *
     * Shares are always minted on homzlist.com (lib/utils `publicHref`), which
     * is what makes a pasted link work for everyone. But the signed-in
     * experience lives on seller.*, and the real session cookies are host-only
     * — so a signed-in user opening their own shared listing landed in the
     * guest view with a "Sign in to save, inquire and chat" strip over content
     * they own. The domain-wide hint (lib/auth/session-hint) is what lets this
     * host tell the two cases apart; it is a routing flag, not a credential,
     * and the seller host re-verifies the real session on arrival.
     *
     * Guests never see any of this — no hint cookie, no redirect, and crawlers
     * (which carry no cookies) keep getting the same public HTML they do today.
     */
    const bounced = url.searchParams.get(HINT_BOUNCE_PARAM) === "1";
    if (bounced) {
      // The seller host sent this back: the hint was stale (session expired or
      // cleared on that host). Drop the hint so it cannot bounce again, and
      // serve the page here as a guest.
      const clean = new URLSearchParams(url.search);
      clean.delete(HINT_BOUNCE_PARAM);
      const res = redirectTo(request, host, pathname, clean.toString() ? `?${clean}` : "");
      const domain = sessionHintDomain(host);
      res.cookies.set(SESSION_HINT_COOKIE, "", { path: "/", maxAge: 0, ...(domain ? { domain } : {}) });
      return res;
    }
    if (
      request.method === "GET" &&
      request.cookies.has(SESSION_HINT_COOKIE) &&
      mirroredOnSeller(pathname)
    ) {
      const carried = new URLSearchParams(url.search);
      carried.set(HINT_BOUNCE_PARAM, "1");
      return redirectTo(request, `seller.${host}`, pathname, `?${carried}`);
    }

    if (user) {
      // Strip ONLY the auth cookies from the forwarded request so downstream
      // (pages + APIs via getCurrentUser) sees a guest on THIS request; keep any
      // UI-only cookies (theme, onboarding). Clear them on the browser too.
      const requestHeaders = new Headers(request.headers);
      const cookie = requestHeaders.get("cookie") ?? "";
      const kept = cookie
        .split(/;\s*/)
        .filter(
          (c) =>
            c &&
            !c.startsWith(`${ACCESS_COOKIE}=`) &&
            !c.startsWith(`${REFRESH_COOKIE}=`) &&
            !c.startsWith(`${POOL_COOKIE}=`),
        )
        .join("; ");
      if (kept) requestHeaders.set("cookie", kept);
      else requestHeaders.delete("cookie");
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.cookies.delete(ACCESS_COOKIE);
      res.cookies.delete(REFRESH_COOKIE);
      res.cookies.delete(POOL_COOKIE);
      return res;
    }
    // /leads, /notifications and /saved are seller-only authenticated
    // surfaces — they must not render their shell for an anonymous visitor on
    // the public host (Doc9 §28 guest gate).
    //
    // /saved was the one missing from this list, and the public host answered it
    // with a "Saved is coming" placeholder from before P10 shipped — so the feed
    // header's bookmark icon, which renders for guests, opened a screen that
    // lied about a feature that exists. It goes through the same gate now and
    // the stale placeholder page is gone.
    if (!user && (pathname.startsWith("/leads") || pathname.startsWith("/messages") || pathname.startsWith("/notifications") || pathname.startsWith("/saved"))) {
      // …and they come back here after signing in, rather than being dumped on
      // the feed having lost the screen they asked for.
      return loginRedirect(request, url, `seller.${host}`);
    }

    return NextResponse.next();
  }

  if (zone === "seller") {
    // "Add account" (P9 S1) is the one reason a signed-in user may reach /login:
    // they are deliberately signing a SECOND account into this device. Every
    // other authenticated hit on /login still bounces home.
    const addingAccount = url.searchParams.get("add") === "1";
    if (isLogin && user && !addingAccount) {
      // Straight to where they were headed when the login screen was reached,
      // not always the feed. Sanitised, so `next` can only ever be a path on
      // this host — never somewhere else's origin.
      const [nextPath, nextQuery] = (sanitizeNext(url.searchParams.get("next")) ?? "/").split("?");
      return redirectTo(request, host, nextPath, nextQuery ? `?${nextQuery}` : "");
    }

    /**
     * Arrived from the public host's session-hint redirect. Either way the
     * marker is stripped, so it never sits in the address bar and never gets
     * re-shared.
     */
    const bounced = url.searchParams.get(HINT_BOUNCE_PARAM) === "1";
    if (bounced) {
      const clean = new URLSearchParams(url.search);
      clean.delete(HINT_BOUNCE_PARAM);
      const query = clean.toString() ? `?${clean}` : "";
      if (user) return redirectTo(request, host, pathname, query);
      // The hint lied — there is no session on this host. A shared link must
      // not turn into a login wall, so hand the visit back to the public host,
      // which clears the hint and renders the guest page.
      clean.set(HINT_BOUNCE_PARAM, "1");
      return redirectTo(request, host.replace(/^seller\./i, ""), pathname, `?${clean}`);
    }

    if (!isLogin && !user) return loginRedirect(request, url, host);
    url.pathname = `/seller${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // admin — the ADMIN session decides here, never the user one. hz_at is
  // host-only to the public/seller hosts and can never be present on
  // account.*, so gating on `user` locked every signed-in admin out of the
  // panel. The whitelist, the role and the revoked check are still enforced
  // server-side on every request by requireAdmin(); this only routes.
  const admin = await verifyAdminAccessEdge(request.cookies.get(ADMIN_ACCESS_COOKIE)?.value);
  if (isLogin && admin) return NextResponse.redirect(new URL("/", request.url));
  if (!isLogin && !admin) {
    // The 30-minute access token has expired but the 12-hour refresh may not
    // have. Rotate it and come back, rather than throwing a working session
    // out to the login screen halfway through a review. KV and Supabase are
    // unreachable from the Edge, so the rotation itself is a Node route.
    if (request.cookies.has(ADMIN_REFRESH_COOKIE)) {
      const to = new URL("/api/v1/admin/auth/refresh", request.url);
      to.searchParams.set("next", `${pathname}${url.search}`);
      return NextResponse.redirect(to);
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  url.pathname = `/account${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // `_dx` is the unpacked design prototypes (scripts/build-designcheck.mjs),
    // static files used only by the pixel-diff harness — they must not be
    // rewritten into a route group or gated behind the seller login.
    "/((?!_next/static|_next/image|_dx/|favicon.ico|manifest.webmanifest|sw.js|offline|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
