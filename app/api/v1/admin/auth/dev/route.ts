import { NextResponse, type NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { isProd } from "@/lib/env";
import { rateLimit } from "@/lib/auth/rate-limit";
import { devSignIn, googleMode } from "@/lib/admin/google";
import { recordLoginAttempt } from "@/lib/admin/auth";
import { requestMeta } from "@/lib/admin/session";
import { finishAdminLogin } from "@/lib/admin/login";

/**
 * POST /api/v1/admin/auth/dev — DEV-mode admin sign-in.
 *
 * Exists only while GOOGLE_OAUTH_CLIENT_ID/SECRET are unset, exactly like the
 * fixed-code OTP provider on the user side. It does NOT weaken authorisation:
 * the address still has to be an active row in `staff`, and every denial is
 * still written to the login audit. In production this route is a 404 twice
 * over — here, and again inside devSignIn().
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (isProd || googleMode() !== "dev") return fail("NOT_FOUND");

  const { ip } = requestMeta();
  const limited = await rateLimit(`admin-login:${ip}`, 20, 600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const email = typeof body.email === "string" ? body.email : "";
  const identity = devSignIn(email);
  if (!identity) {
    if (email) await recordLoginAttempt(email, "denied");
    return fail("VALIDATION_ERROR", { field: "email" });
  }

  // finishAdminLogin answers with a redirect and sets the session cookie through
  // next/headers `cookies()`, which attaches to THIS response — so the cookie is
  // already on the way out and only the destination needs relaying. A redirect
  // back to /login means the whitelist refused the address.
  const res = await finishAdminLogin(identity.email, identity.sub, identity.name);
  const location = res.headers.get("location") ?? "/";
  const denied = location.includes("/login");
  return NextResponse.json(
    denied
      ? { ok: false, error: { code: "FORBIDDEN", message_key: "error.forbidden" }, data: { next: location } }
      : { ok: true, data: { next: location } },
    { status: denied ? 403 : 200 },
  );
}
