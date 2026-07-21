import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Subdomain routing + session isolation + login-bypass sealing (Doc6 §4, Doc9 §28).
 *
 * One codebase, three subdomains — resolved by internal REWRITE to a path prefix
 * so route groups don't collide:
 *   homzlist.com          → (public) group          (served at "/")
 *   seller.homzlist.com   → (seller) group          (rewritten to "/seller/*")
 *   account.homzlist.com  → (admin)  group          (rewritten to "/account/*")
 *
 * The internal prefixes (/seller, /account) are NEVER reachable from the public
 * host — guessing them 404s (bypass sealing). Cookies are subdomain-scoped by the
 * Supabase middleware helper, so an admin session is invalid on seller/public and
 * vice-versa.
 */

type Zone = "public" | "seller" | "admin";

function getZone(host: string): Zone {
  // Strip port, take the first label.
  const hostname = host.split(":")[0].toLowerCase();
  const label = hostname.split(".")[0];
  if (label === "seller") return "seller";
  if (label === "account") return "admin";
  return "public"; // homzlist.com, www, localhost, previews
}

/** Copy refreshed auth cookies from the session response onto a new response. */
function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export async function middleware(request: NextRequest) {
  const { response: sessionResponse, user } = await updateSession(request);

  const url = request.nextUrl.clone();
  const { pathname } = url;
  const zone = getZone(request.headers.get("host") ?? "");

  // API is a shared namespace across subdomains — never rewritten. Each route
  // enforces its own auth + zone check server-side (Doc7 §0).
  if (pathname.startsWith("/api")) {
    return sessionResponse;
  }

  // ----- PUBLIC (homzlist.com) ---------------------------------------------
  if (zone === "public") {
    // Internal-only prefixes must not be reachable from the public host.
    if (pathname.startsWith("/seller") || pathname.startsWith("/account")) {
      return withCookies(sessionResponse, NextResponse.rewrite(new URL("/404", request.url)));
    }
    // Guests browse freely (SEO). Gated actions handle their own login redirect.
    return sessionResponse;
  }

  // ----- SELLER (seller.homzlist.com) --------------------------------------
  if (zone === "seller") {
    const isLogin = pathname === "/login" || pathname.startsWith("/login/");

    // Already logged in hitting /login → send home (no re-login bypass, Doc9 §28).
    if (isLogin && user) {
      return withCookies(sessionResponse, NextResponse.redirect(new URL("/", request.url)));
    }
    // Unauthenticated on any gated route → login (server-side guard, no flash).
    if (!isLogin && !user) {
      return withCookies(sessionResponse, NextResponse.redirect(new URL("/login", request.url)));
    }
    // Serve the seller route group.
    url.pathname = `/seller${pathname === "/" ? "" : pathname}`;
    return withCookies(sessionResponse, NextResponse.rewrite(url));
  }

  // ----- ADMIN (account.homzlist.com) --------------------------------------
  // Fully isolated; Google-auth whitelist is enforced server-side in the route.
  const isAdminLogin = pathname === "/login" || pathname.startsWith("/login/");
  if (isAdminLogin && user) {
    return withCookies(sessionResponse, NextResponse.redirect(new URL("/", request.url)));
  }
  if (!isAdminLogin && !user) {
    return withCookies(sessionResponse, NextResponse.redirect(new URL("/login", request.url)));
  }
  url.pathname = `/account${pathname === "/" ? "" : pathname}`;
  return withCookies(sessionResponse, NextResponse.rewrite(url));
}

export const config = {
  // Run on everything except Next internals + static assets + the service worker.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
