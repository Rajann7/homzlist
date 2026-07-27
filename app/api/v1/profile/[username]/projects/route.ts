import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getProfileByUsername } from "@/lib/profile/service";
import { listPublicProjectsByProfile } from "@/lib/listings/projects";

/**
 * GET /api/v1/profile/:username/projects — the visitor profile's Projects tab
 * (P9 S2, builders only).
 *
 * The tab existed with no endpoint behind it and fell through to the listings
 * array, so it rendered the same content as Sell / Rent. Live projects only,
 * matching the public rule for listings; the DTO is the same one the project
 * detail uses, so nothing owner-only (review notes, reject reasons) is exposed.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { username: string } }) {
  const profile = await getProfileByUsername(params.username);
  if (!profile || !profile.is_registered) return fail("NOT_FOUND");
  // Projects are a Builder-only product (Doc2 §6) — anyone else has none, and
  // answering with an empty list keeps the shape stable for the client.
  if (profile.role !== "builder") return ok({ items: [] });
  const items = await listPublicProjectsByProfile(profile.id);
  return ok({ items });
}
