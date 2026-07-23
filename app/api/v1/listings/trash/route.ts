import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listTrash } from "@/lib/listings/service";
import { myListingDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/listings/trash — soft-deleted listings, restorable for 30 days
 * (Doc2 §5.4). Scoped to the session user in the query itself.
 *
 * `daysLeft` is computed here rather than in the browser: the purge deadline is
 * the server's clock, and a device with a wrong date must not be able to show
 * a listing as safe when it is about to be purged.
 */
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const TRASH_DAYS = 30;

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const rows = await listTrash(claims.sub);
  return ok({
    items: rows.map((r) => ({
      ...myListingDTO(r),
      daysLeft: r.deleted_at
        ? Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(r.deleted_at).getTime()) / DAY))
        : TRASH_DAYS,
    })),
    trashDays: TRASH_DAYS,
  });
}
