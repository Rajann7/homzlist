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
  const zone = getZone(request.headers.get("host") ?? "");

  if (pathname.startsWith("/api")) return NextResponse.next();

  const user = await verifyAccessEdge(request.cookies.get(ACCESS_COOKIE)?.value);

  if (zone === "public") {
    if (pathname.startsWith("/seller") || pathname.startsWith("/account")) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
    return NextResponse.next();
  }

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

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
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
