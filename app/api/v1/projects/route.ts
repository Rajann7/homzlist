import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createProject, listMyProjects, NoProjectSlotError } from "@/lib/listings/projects";

/**
 * POST /api/v1/projects (Doc7 §59) — create a Builder project (₹9,999 slot).
 * GET  — the builder's own projects.
 *
 * Two gates, both server-side:
 *  - Builder-only. An Owner/Broker posting here is refused regardless of UI.
 *  - RERA is REQUIRED unless explicitly exempt WITH a reason (Doc2 §6).
 * Payment-first applies exactly as for listings: a project slot is drawn from a
 * paid ₹9,999 plan before anything is written.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok({ items: await listMyProjects(claims.sub) });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  // Projects are a Builder-only product (Doc2 §6).
  if (profile.role !== "builder") return fail("FORBIDDEN");

  const limited = await rateLimit(`project-create:${claims.sub}`, 20, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 3 || name.length > 120) return fail("VALIDATION_ERROR", { field: "name" });

  const reraExempt = body.reraExempt === true;
  const reraNumber = typeof body.reraNumber === "string" ? body.reraNumber.trim() : "";
  const exemptReason = typeof body.reraExemptReason === "string" ? body.reraExemptReason.trim() : "";
  if (!reraExempt && !reraNumber) return fail("VALIDATION_ERROR", { field: "reraNumber" });
  if (reraExempt && exemptReason.length < 5) return fail("VALIDATION_ERROR", { field: "reraExemptReason" });

  if (!body.cityId) return fail("VALIDATION_ERROR", { field: "cityId" });

  try {
    const project = await createProject(claims.sub, {
      name,
      reraNumber: reraExempt ? null : reraNumber,
      reraExempt,
      reraExemptReason: reraExempt ? exemptReason : null,
      buildStatus: ["booking_open", "under_construction", "ready"].includes(body.buildStatus) ? body.buildStatus : null,
      possessionDate: typeof body.possessionDate === "string" ? body.possessionDate : null,
      towers: Number.isInteger(body.towers) ? body.towers : null,
      floors: Number.isInteger(body.floors) ? body.floors : null,
      totalUnits: Number.isInteger(body.totalUnits) ? body.totalUnits : null,
      availableUnits: Number.isInteger(body.availableUnits) ? body.availableUnits : null,
      bankApprovals: Array.isArray(body.bankApprovals) ? body.bankApprovals.filter((b: unknown) => typeof b === "string").slice(0, 20) : [],
      amenities: Array.isArray(body.amenities) ? body.amenities.filter((a: unknown) => typeof a === "string").slice(0, 40) : [],
      description: typeof body.description === "string" ? body.description.slice(0, 5000) : null,
      stateId: body.stateId ?? null,
      cityId: body.cityId,
      areaId: body.areaId ?? null,
      areaLabel: typeof body.areaLabel === "string" ? body.areaLabel.slice(0, 120) : null,
      pincode: /^[1-9]\d{5}$/.test(String(body.pincode ?? "")) ? String(body.pincode) : null,
      units: Array.isArray(body.units) ? body.units.slice(0, 40) : [],
    });
    return ok({ project });
  } catch (e) {
    if (e instanceof NoProjectSlotError) return fail("PLAN_REQUIRED");
    throw e;
  }
}
