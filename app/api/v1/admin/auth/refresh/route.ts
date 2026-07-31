import type { NextRequest } from "next/server";
import { refreshAdminSession } from "@/lib/admin/sign-in";
import { redirectToPath } from "@/lib/admin/oauth";

/**
 * GET /api/v1/admin/auth/refresh?next=/some/panel/path
 *
 * Admin ACCESS tokens last 30 minutes on purpose — a panel that can suspend
 * accounts should not idle open. The refresh token lasts 12 hours, and until
 * now nothing spent it: half an hour into a shift the middleware stopped
 * recognising the access cookie and threw the admin back to the login screen
 * mid-review, with a perfectly good session sitting in the cookie jar.
 *
 * This is the rotation the user side already has (/api/v1/auth/refresh), in
 * the same shape: middleware sends a stale-access request here, the token pair
 * is rotated — re-checking the staff row and that the session has not been
 * ended — and the admin is returned to the page they asked for. A refresh that
 * fails lands on /login, which is also what breaks any redirect loop.
 *
 * `next` is only ever used as a PATH: an absolute URL from a crafted link would
 * make this an open redirect that hands an admin from our domain to someone
 * else's, and `redirectToPath` refuses anything that is not a local path.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const next = new URL(req.url).searchParams.get("next") ?? "/";
  const ok = await refreshAdminSession();
  return redirectToPath(ok ? next : "/login");
}
