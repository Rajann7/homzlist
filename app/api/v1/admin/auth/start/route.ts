import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { ok, fail } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import {
  adminAuthProviderKind,
  devIdentity,
  googleAuthorizeUrl,
  newOauthState,
} from "@/lib/admin/auth-provider";
import { signInAdmin } from "@/lib/admin/sign-in";
import { clearLoginOutcome, setLoginOutcome } from "@/lib/admin/login-outcome";
import { OAUTH_STATE_COOKIE, adminCallbackUrl } from "@/lib/admin/oauth";

/**
 * The A1 button, server side. ONE endpoint for both providers, because the
 * design has one button: whichever provider is configured, the screen and the
 * click are identical and only the answer differs.
 *
 *   google → { redirect } to Google's consent screen; the callback finishes it
 *   dev    → signs in as ADMIN_DEV_EMAIL and answers with the outcome directly
 *
 * The dev branch exists so the panel can be built and proven before Google
 * credentials arrive, and it deliberately does NOT add a field to the screen:
 * the operator configures one email in .env.local and the design stays exactly
 * as drawn. Everything downstream — whitelist, revoked check, role, session,
 * audit — is the same code in both branches.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // A sign-in endpoint is reachable by anyone; the whitelist behind it answers
  // the same way every time, so the only thing to protect is the cost.
  const limit = await rateLimit(`admin:signin:${clientIp(req.headers)}`, 20, 15 * 60, "login");
  if (!limit.allowed) return fail("RATE_LIMITED", { retry_after: limit.retryAfterSec });

  // A new attempt clears the previous refusal, so the error card cannot outlive
  // the thing it was about.
  clearLoginOutcome();

  if (adminAuthProviderKind() === "google") {
    const state = newOauthState();
    cookies().set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return ok({ redirect: googleAuthorizeUrl(adminCallbackUrl(), state) });
  }

  const email = process.env.ADMIN_DEV_EMAIL;
  if (!email) {
    console.error(
      "[admin] ADMIN_DEV_EMAIL is not set — the dev admin sign-in has no identity to offer. " +
        "Set it in .env.local (see .env.local.example).",
    );
    return fail("SERVER_ERROR");
  }

  const result = await signInAdmin(devIdentity(email));
  if (result.outcome !== "ok") setLoginOutcome({ kind: result.outcome, email: result.email });
  return ok({ outcome: result.outcome });
}
