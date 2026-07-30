import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { reopenTicket } from "@/lib/support/service";

/**
 * POST /api/v1/support/tickets/:id/reopen — the closed thread's "Reopen ticket".
 * Without this, `closed` would be a state nothing exits (CLAUDE.md hidden-issue
 * question 3) and a user with a recurring problem would have to start over.
 */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const result = await reopenTicket(claims.sub, params.id);
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return fail("NOT_FOUND");
    return fail("LISTING_STATE_LOCKED");
  }
  return ok({ reopened: true });
}
