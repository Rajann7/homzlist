import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTicket } from "@/lib/support/service";

/**
 * GET /api/v1/support/tickets/:id — the thread (P12 S2). Scoped to the owner, so
 * another user's ticket id is a 404 and never confirms the ticket exists.
 * Staff-internal notes are stripped in the service, not hidden in CSS.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const ticket = await getTicket(claims.sub, params.id);
  if (!ticket) return fail("NOT_FOUND");
  return ok(ticket);
}
