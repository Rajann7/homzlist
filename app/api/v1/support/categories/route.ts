import { ok } from "@/lib/api";
import { listTicketCategories } from "@/lib/support/service";

/**
 * GET /api/v1/support/categories — the 7 rows of the "Choose a category" sheet,
 * each carrying its own conditional-field flags. The form asks the server which
 * extra inputs to draw; the server is also the thing that enforces them.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET() {
  return ok({ categories: await listTicketCategories(true) });
}
