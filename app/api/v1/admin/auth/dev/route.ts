import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { adminAuthProviderKind, devIdentity } from "@/lib/admin/auth-provider";
import { signInAdmin } from "@/lib/admin/sign-in";
import { devAffordancesAllowed } from "@/lib/env";

/**
 * DEV-ONLY admin sign-in — the same shape the OTP layer already uses (fixed
 * code in dev, real provider later), for the same reason: no Google OAuth
 * credentials are configured yet, and the panel cannot be built or proven
 * without a real admin session.
 *
 * What this does NOT skip: the staff whitelist, the active/revoked check, the
 * role, the session row, the login-attempt log. It replaces exactly one step —
 * asking Google which account this is — so the authorization path exercised
 * here is the one that runs in production.
 *
 * Three independent locks:
 *   · `adminAuthProviderKind()` answers "unconfigured" in the production band
 *   · `devIdentity()` throws in the production band, always
 *   · this route 404s the moment the band is production
 *
 * "Band", not NODE_ENV: a staging deploy is a production BUILD, and gating on
 * the build meant a deployed test server had no way in at all. An undeclared
 * APP_ENV on a deployed build is still production, so this stays shut unless
 * APP_ENV=staging was set on purpose.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!devAffordancesAllowed()) return fail("NOT_FOUND");
  if (adminAuthProviderKind() !== "dev") return fail("NOT_FOUND");

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) return fail("VALIDATION_ERROR");

  const result = await signInAdmin(devIdentity(body.email));
  // The three outcomes map 1:1 onto the design's three login states
  // (template 37-69): signed in · no admin access · access removed.
  return ok(result);
}
