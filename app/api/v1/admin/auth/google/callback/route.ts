import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { adminAuthProviderKind, googleIdentityFromCode } from "@/lib/admin/auth-provider";
import { signInAdmin } from "@/lib/admin/sign-in";
import { setLoginOutcome } from "@/lib/admin/login-outcome";
import { OAUTH_STATE_COOKIE, adminCallbackUrl, redirectToPath } from "@/lib/admin/oauth";

/**
 * Google's redirect back. Everything it carries is untrusted input, so the
 * order here matters:
 *
 *   1. `state` must equal the one-shot value we set before leaving. Without
 *      this a third-party page could walk an admin through a sign-in it did not
 *      start (CSRF onto a privileged session).
 *   2. the code is exchanged server-to-server with our client secret; the email
 *      comes out of that response, never out of the query string.
 *   3. only then does the whitelist decide, in the same `signInAdmin` the dev
 *      provider uses.
 *
 * Every ending lands on a SCREEN, never on JSON: this URL is reached by a
 * browser navigation, and a bare error envelope would be a dead end. The two
 * refusals ride back on the one-shot flash cookie, which is what makes A1's
 * "no admin access" and "access was removed" cards appear.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (adminAuthProviderKind() !== "google") return redirectToPath("/login");

  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  // The admin pressed "Cancel" on Google's screen, or the state does not match.
  // Both are silent returns to the login screen — neither is theirs to explain,
  // and neither should render an error the design does not have.
  if (!code || !state || !expected || state !== expected) return redirectToPath("/login");

  let result;
  try {
    const identity = await googleIdentityFromCode(code, adminCallbackUrl());
    result = await signInAdmin(identity);
  } catch (e) {
    console.error("[admin] google sign-in failed", e);
    setLoginOutcome({ kind: "error", email: "" });
    return redirectToPath("/login");
  }

  if (result.outcome === "ok") return redirectToPath("/");
  setLoginOutcome({ kind: result.outcome, email: result.email });
  return redirectToPath("/login");
}
