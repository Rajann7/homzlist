import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { revokeSession } from "@/lib/auth/session";
import { takeFromPool, writePool } from "@/lib/auth/account-pool";

/**
 * POST /api/v1/auth/accounts/remove { profileId } — sign a BACKGROUND account
 * out of this device (long-press a row in the P9 S1 sheet).
 *
 * This is a real sign-out, not a UI hide: the account's refresh session is
 * revoked server-side, so the parked token is dead even if the cookie were
 * replayed. The ACTIVE account cannot be removed this way — leaving it is what
 * "Log out" does, which also has to decide where the device lands.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { profileId?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  // Type-check before trimming: a non-string body field must be a 422, not a 500.
  if (typeof body.profileId !== "string") return fail("VALIDATION_ERROR");
  const profileId = body.profileId.trim();
  if (!profileId) return fail("VALIDATION_ERROR");
  if (profileId === claims.sub) return fail("FORBIDDEN"); // use /auth/logout

  const { entry, rest } = takeFromPool(profileId);
  if (!entry) return fail("NOT_FOUND");

  const [pid, sid] = entry.token.split(".");
  if (pid && sid) await revokeSession(pid, sid);
  writePool(rest);

  return ok({ removed: true, profileId });
}
