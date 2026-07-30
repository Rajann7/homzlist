import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cancelPendingAction } from "@/lib/account/service";

/**
 * POST /api/v1/account/cancel-deletion — the grace screen's "Cancel deletion".
 *
 * This is the exit from the `scheduled` state. Without it the state machine would
 * dead-end in a place the user paid to avoid (CLAUDE.md hidden-issue question 3):
 * the account would sit deactivated with a purge date and no way back.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const result = await cancelPendingAction(claims.sub);
  if (!result.ok) return fail("NOT_FOUND");
  return ok({ cancelled: true, kind: result.kind });
}
