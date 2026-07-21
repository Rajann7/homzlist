import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getProfileByUsername, getVerifications, getCityName } from "@/lib/profile/service";
import { publicProfileDTO } from "@/lib/profile/dto";

/**
 * GET /api/v1/profile/:username (Doc7 §15) — PUBLIC profile of another user.
 * Server strips Views/Leads, email and the raw phone (Doc9 §17). Suspended →
 * "unavailable"; deleted → "Deleted user". Guest-readable.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { username: string } }) {
  const profile = await getProfileByUsername(params.username);
  if (!profile || !profile.is_registered) return fail("NOT_FOUND");

  const [verifications, cityName] = await Promise.all([getVerifications(profile.id), getCityName(profile.city_id)]);
  // TODO(Module 4): real public listings/projects counts.
  const stats = { listings: 0, ...(profile.role === "builder" ? { projects: 0 } : {}) };
  return ok({ profile: publicProfileDTO(profile, verifications, cityName, stats) });
}
