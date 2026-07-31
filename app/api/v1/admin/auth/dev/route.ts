import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { adminAuthProviderKind, devIdentity } from "@/lib/admin/auth-provider";
import { signInAdmin } from "@/lib/admin/sign-in";

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
 *   · `adminAuthProviderKind()` throws in production when credentials are absent
 *   · `devIdentity()` throws in production, always
 *   · this route 404s the moment NODE_ENV is production
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return fail("NOT_FOUND");
  if (adminAuthProviderKind() !== "dev") return fail("NOT_FOUND");

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) return fail("VALIDATION_ERROR");

  const result = await signInAdmin(devIdentity(body.email));
  // The three outcomes map 1:1 onto the design's three login states
  // (template 37-69): signed in · no admin access · access removed.
  return ok(result);
}
