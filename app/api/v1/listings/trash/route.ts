import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listTrash } from "@/lib/listings/service";
import { listTrashProjects } from "@/lib/listings/projects";
import { myListingDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/listings/trash — soft-deleted listings AND projects, restorable
 * for 30 days (Doc2 §5.4). Scoped to the session user in the query itself.
 *
 * Projects joined this list with migration 0079, which gave them a delete at
 * all; the trash screen is one list of the same card, and `subjectKind` decides
 * which restore/purge endpoint each row calls.
 *
 * `daysLeft` is computed here rather than in the browser: the purge deadline is
 * the server's clock, and a device with a wrong date must not be able to show
 * something as safe when it is about to be purged.
 */
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const TRASH_DAYS = 30;

const daysLeft = (deletedAt: string | null) =>
  deletedAt ? Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / DAY)) : TRASH_DAYS;

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const [rows, projects] = await Promise.all([listTrash(claims.sub), listTrashProjects(claims.sub)]);

  const items = [
    ...rows.map((r) => ({
      ...myListingDTO(r),
      subjectKind: "listing" as const,
      daysLeft: daysLeft(r.deleted_at),
      sortAt: r.deleted_at,
    })),
    ...projects.map(({ deletedAt, ...p }) => ({
      ...p,
      daysLeft: daysLeft(deletedAt),
      sortAt: deletedAt,
    })),
    // Newest deletion first, whichever table it came from.
  ].sort((a, b) => String(b.sortAt ?? "").localeCompare(String(a.sortAt ?? "")));

  return ok({
    items: items.map(({ sortAt: _sortAt, ...i }) => i),
    trashDays: TRASH_DAYS,
  });
}
