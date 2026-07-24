import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getProfileByUsername } from "@/lib/profile/service";
import { listPublicByProfile } from "@/lib/listings/service";
import { listingCardDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/profile/:username/listings — the public profile grid (P9 S2).
 *
 * The grid used to be a hardcoded "No listings to show yet." with no fetch at
 * all, so a profile could claim "12 Listings" and show none — a dead end for
 * anyone who tapped a poster in the feed.
 *
 * `listingCardDTO` (not `myListingDTO`) on purpose: the owner-only shape carries
 * status badges, review notes and reject reasons, none of which a visitor may
 * see. Live + available only, matching the count on the same screen.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { username: string } }) {
  const profile = await getProfileByUsername(params.username);
  if (!profile || !profile.is_registered) return fail("NOT_FOUND");
  const rows = await listPublicByProfile(profile.id);
  return ok({ items: rows.map(listingCardDTO) });
}
