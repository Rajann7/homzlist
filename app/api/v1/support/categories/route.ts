import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTicketCategories } from "@/lib/support/service";

/**
 * GET /api/v1/support/categories — the category sheet on the new-ticket form,
 * and the conditional field each one reveals. Authenticated: raising a ticket is
 * an account action.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok({ categories: await getTicketCategories() });
}
