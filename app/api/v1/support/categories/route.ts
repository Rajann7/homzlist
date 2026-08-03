import { ok } from "@/lib/api";
import { listTicketCategories } from "@/lib/support/service";

/**
 * GET /api/v1/support/categories — the 7 rows of the "Choose a category" sheet,
 * each carrying its own conditional-field flags. The form asks the server which
 * extra inputs to draw; the server is also the thing that enforces them.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ categories: await listTicketCategories(true) });
}
