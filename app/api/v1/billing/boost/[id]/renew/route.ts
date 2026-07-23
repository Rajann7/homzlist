import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBoost, getCatalogItem, isListingBoostEligible } from "@/lib/billing/service";

/**
 * POST /api/v1/billing/boost/:id/renew (Doc7 §41) — 1-tap renew.
 *
 * Doc2 §13: renew is a one-tap CTA, NOT an auto-charge. So this endpoint does
 * not move money — it validates that a renewal is legitimate and hands back the
 * checkout intent, which the client then pays for through the normal
 * server-priced checkout. Same eligibility gate as a fresh boost.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const boost = await getBoost(params.id, claims.sub);
  if (!boost) return fail("NOT_FOUND");

  // The listing must still be live — renewing a sold/hidden listing's boost is
  // exactly the "boost an ineligible listing" abuse Doc9 §11 calls out.
  if (!(await isListingBoostEligible(claims.sub, boost.listing_id))) return fail("LISTING_STATE_LOCKED");

  // Price is re-read from the catalog, so an admin rate change applies to the
  // renewal (a renewal is a new purchase, not a grandfathered one).
  const item = await getCatalogItem(boost.catalog_code);
  if (!item) return fail("NOT_FOUND");

  return ok({
    checkout: {
      planId: item.code,
      listingId: boost.listing_id,
      targeting: boost.targeting,
      targetLabel: boost.target_label,
    },
  });
}
