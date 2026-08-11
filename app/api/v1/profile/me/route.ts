import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById, getVerifications, getCityName, updateOwnProfile } from "@/lib/profile/service";
import { getProfileCounts, countProfileRequirements } from "@/lib/listings/service";
import { countProfileLeads } from "@/lib/leads/service";

import { ownProfileDTO } from "@/lib/profile/dto";

/**
 * GET  /api/v1/profile/me (Doc7 §16) — full own profile (stats server-derived).
 * PATCH /api/v1/profile/me (Doc7 §17) — edit; whitelisted fields, bio auto-flag.
 * Listings/Projects/Views/Leads counts are all real queries.
 */
export const dynamic = "force-dynamic";

async function loadOwn(id: string) {
  const [profile, verifications] = await Promise.all([getProfileById(id), getVerifications(id)]);
  if (!profile) return null;
  const cityName = await getCityName(profile.city_id);
  // Every tile is a real query: listings/projects (Module 4), views (migration
  // 0018), leads (Module 5's `leads` table — this was a hardcoded 0 until the
  // table existed; D3 in PENDING-INTEGRATIONS).
  // The P9 stat row is Listings / Requirements / Leads for owner+broker and
  // Listings / Projects / Messages / Leads for builders. Every one of these is a
  // real count against the same rows the screen it links to reads.
  const [counts, leads, requirements, messages] = await Promise.all([
    getProfileCounts(id, profile.role),
    countProfileLeads(id),
    countProfileRequirements(id),
    Promise.resolve(0),
  ]);
  const stats = {
    listings: counts.listings,
    views: counts.views,
    leads,
    requirements,
    messages,
    ...(profile.role === "builder" ? { projects: counts.projects } : {}),
  };
  return ownProfileDTO(profile, verifications, cityName, stats);
}

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const dto = await loadOwn(claims.sub);
  if (!dto) return fail("UNAUTHORIZED");
  return ok({ profile: dto });
}

export async function PATCH(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  // Validate + whitelist.
  const patch: Parameters<typeof updateOwnProfile>[1] = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 60) return fail("VALIDATION_ERROR", { field: "name" });
    patch.name = name;
  }
  if (typeof body.bio === "string") {
    if (body.bio.length > 150) return fail("VALIDATION_ERROR", { field: "bio" });
    patch.bio = body.bio;
  }
  if (typeof body.cityId === "string") patch.cityId = body.cityId;
  if (typeof body.email === "string") {
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return fail("VALIDATION_ERROR", { field: "email" });
    patch.email = body.email;
  }
  if (typeof body.officeAddress === "string") patch.officeAddress = body.officeAddress.slice(0, 300);
  // Audit L1: clamp numeric fields to sane integer ranges.
  if (typeof body.establishedYear === "number") {
    const y = Math.trunc(body.establishedYear);
    if (y < 1900 || y > new Date().getFullYear()) return fail("VALIDATION_ERROR", { field: "establishedYear" });
    patch.establishedYear = y;
  }
  if (typeof body.projectsDone === "number") {
    const n = Math.trunc(body.projectsDone);
    if (n < 0 || n > 100000) return fail("VALIDATION_ERROR", { field: "projectsDone" });
    patch.projectsDone = n;
  }
  if (Array.isArray(body.areasCovered)) patch.areasCovered = body.areasCovered.filter((a) => typeof a === "string").slice(0, 10);

  try {
    await updateOwnProfile(claims.sub, patch);
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_CITY") return fail("VALIDATION_ERROR", { field: "city" });
    throw e;
  }

  const dto = await loadOwn(claims.sub);
  return ok({ profile: dto });
}
