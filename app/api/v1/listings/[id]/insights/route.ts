import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cheapestBoostPaise, getListingForViewer, isPromoted, listingPlanLabel, ownerListingInsights } from "@/lib/listings/service";
import { listingInsightsDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/listings/:id/insights (designs/P9 S5).
 *
 * OWNER ONLY, and the check is ownership of the row — not "is this id in my
 * list", which a caller could influence. Views/saves/shares/leads are private
 * business data (Doc9 §17), so a listing that exists but isn't the caller's
 * answers 404 exactly like one that doesn't exist: the same response for both
 * means the endpoint can't be used to test whether an id is real.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // `getListingForViewer` already 404s a soft-deleted row (Trash is its own
  // screen) and every owner-only state for a non-owner; the ownership check
  // below closes the remaining case — someone else's LIVE listing, which is
  // readable as a detail page but whose numbers are private.
  const listing = await getListingForViewer(params.id, claims.sub);
  if (!listing || listing.profile_id !== claims.sub) return fail("NOT_FOUND");

  const [stats, promoted, planLabel, boostFromPaise] = await Promise.all([
    ownerListingInsights(listing.id),
    isPromoted(listing.id),
    listingPlanLabel(listing.id),
    cheapestBoostPaise(),
  ]);

  return ok({ listing: listingInsightsDTO(listing, { stats, promoted, planLabel, boostFromPaise }) });
}
