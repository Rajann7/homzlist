import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cancelDeletion } from "@/lib/account/service";

/**
 * POST /api/v1/account/cancel-deletion — the grace screen's "Cancel deletion".
 *
 * No OTP here on purpose: the user has just proved control of the number by
 * logging in, and putting a second challenge in front of the UNDO of a
 * destructive action is how a 30-day grace period turns into a trap.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const res = await cancelDeletion(claims.sub);
  if (!res.ok) return fail("NOT_FOUND");
  return ok({ state: res.state });
}
