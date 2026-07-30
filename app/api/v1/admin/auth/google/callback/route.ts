import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/auth/rate-limit";
import { exchangeCode } from "@/lib/admin/google";
import { finishAdminLogin, loginUrl } from "@/lib/admin/login";
import { requestMeta } from "@/lib/admin/session";

/**
 * GET /api/v1/admin/auth/google/callback — Google returns here.
 *
 * The order matters, and it is the order Doc3 §1.1 describes:
 *   1. verify the ID token against Google's JWKS (authentication)
 *   2. look the address up in `staff` (authorisation — the whitelist)
 *   3. record the attempt either way (the login audit)
 * A denied attempt lands back on A1 with a reason the screen can render as one
 * of its two designed error states, never as a generic failure.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { ip } = requestMeta();
  const limited = await rateLimit(`admin-login:${ip}`, 20, 600);
  if (!limited.allowed) return NextResponse.redirect(loginUrl({ error: "rate_limited" }, req));

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!code || !state) return NextResponse.redirect(loginUrl({ error: "failed" }, req));

  const identity = await exchangeCode(code, state);
  if (!identity) return NextResponse.redirect(loginUrl({ error: "failed" }, req));

  return finishAdminLogin(identity.email, identity.sub, identity.name, req);
}
