import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTicketThread } from "@/lib/support/service";

/**
 * GET /api/v1/support/tickets/:id — one thread.
 *
 * The IDOR guard is the query itself: the row is fetched with
 * `profile_id = me`, so another user's ticket id is a 404, not a 403 that
 * confirms the ticket exists.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const thread = await getTicketThread(claims.sub, params.id);
  if (!thread) return fail("NOT_FOUND");
  return ok(thread);
}
