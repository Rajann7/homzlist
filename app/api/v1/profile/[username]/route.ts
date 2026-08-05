import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getProfileByUsername, getVerifications, getCityName } from "@/lib/profile/service";
import { getPublicProfileCounts } from "@/lib/listings/service";
import { publicProfileDTO } from "@/lib/profile/dto";

/**
 * GET /api/v1/profile/:username (Doc7 §15) — PUBLIC profile of another user.
 * Server strips Views/Leads, email and the raw phone (Doc9 §17). Suspended →
 * "unavailable"; deleted → "Deleted user". Guest-readable.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const profile = await getProfileByUsername(params.username);
  if (!profile || !profile.is_registered) return fail("NOT_FOUND");

  const [verifications, cityName, counts] = await Promise.all([
    getVerifications(profile.id),
    getCityName(profile.city_id),
    // Real query — this was a hardcoded `listings: 0` with a TODO left in a
    // shipped screen, so every public profile claimed the poster had none.
    // Live+available only: a visitor is never told about unpublished stock.
    getPublicProfileCounts(profile.id, profile.role),
  ]);
  const stats = { listings: counts.listings, ...(profile.role === "builder" ? { projects: counts.projects } : {}) };
  return ok({ profile: publicProfileDTO(profile, verifications, cityName, stats) });
}
