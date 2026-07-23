import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getListingForViewer, listSimilar } from "@/lib/listings/service";
import { listingCardDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/listings/:id/similar — the "Similar properties" rail (designs/P4).
 *
 * PUBLIC, like the detail page it sits on. Only `live` listings can ever come
 * back (the query pins status), so this can't be used to enumerate someone's
 * drafts. Cards only — never contact details.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const claims = await getCurrentUser();

  // Same visibility gate as the detail itself — no rail for a listing you
  // aren't allowed to open.
  const listing = await getListingForViewer(params.id, claims?.sub ?? null);
  if (!listing) return fail("NOT_FOUND");

  const items = await listSimilar(listing);
  return ok({ items: items.map(listingCardDTO) });
}
