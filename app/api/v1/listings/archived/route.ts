import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listArchived } from "@/lib/listings/service";
import { myListingDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/listings/archived (P10 S5) — the owner's archived (sold/rented)
 * listings. Scoped to the session user in the query. `archivedAt` is added so
 * the row can print "Archived <date>"; `canReactivate` (from the DTO) is true
 * only for rented listings, which is what gates the Restore button.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const rows = await listArchived(claims.sub);
  return ok({
    items: rows.map((r) => ({ ...myListingDTO(r), archivedAt: (r as unknown as { archived_at: string | null }).archived_at })),
  });
}
