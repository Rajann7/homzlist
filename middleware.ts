import { type NextRequest, NextResponse } from "next/server";
import { verifyAccessEdge } from "@/lib/auth/edge";

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

type Zone = "public" | "seller" | "admin";
function getZone(host: string): Zone {
  const label = host.split(":")[0].toLowerCase().split(".")[0];
  if (label === "seller") return "seller";
  if (label === "account") return "admin";
  return "public";
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname } = url;
  const host = request.headers.get("host") ?? "";
  const zone = getZone(host);

  if (pathname.startsWith("/api")) return NextResponse.next();

  const user = await verifyAccessEdge(request.cookies.get(ACCESS_COOKIE)?.value);

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
      const to = new URL(request.url);
      to.host = `seller.${host}`;
      to.pathname = "/login";
      to.search = "";
      return NextResponse.redirect(to);
    }
    if (user) {
      // Strip ONLY the auth cookies from the forwarded request so downstream
      // (pages + APIs via getCurrentUser) sees a guest on THIS request; keep any
      // UI-only cookies (theme, onboarding). Clear them on the browser too.
      const requestHeaders = new Headers(request.headers);
      const cookie = requestHeaders.get("cookie") ?? "";
      const kept = cookie
        .split(/;\s*/)
        .filter((c) => c && !c.startsWith(`${ACCESS_COOKIE}=`) && !c.startsWith(`${REFRESH_COOKIE}=`))
        .join("; ");
      if (kept) requestHeaders.set("cookie", kept);
      else requestHeaders.delete("cookie");
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.cookies.delete(ACCESS_COOKIE);
      res.cookies.delete(REFRESH_COOKIE);
      return res;
    }
    // /messages and /notifications are seller-only authenticated surfaces — they
    // must not render their shell for an anonymous visitor on the public host
    // (Doc9 §28 guest gate).
    if (!user && (pathname.startsWith("/messages") || pathname.startsWith("/notifications"))) {
      const to = new URL(request.url);
      to.host = `seller.${host}`;
      to.pathname = "/login";
      to.search = "";
      return NextResponse.redirect(to);
    }
    return NextResponse.next();
  }

  if (zone === "seller") {
    if (isLogin && user) return NextResponse.redirect(new URL("/", request.url));
    if (!isLogin && !user) return NextResponse.redirect(new URL("/login", request.url));
    url.pathname = `/seller${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // admin — Google-auth whitelist enforced server-side (Module 11)
  if (isLogin && user) return NextResponse.redirect(new URL("/", request.url));
  if (!isLogin && !user) return NextResponse.redirect(new URL("/login", request.url));
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
