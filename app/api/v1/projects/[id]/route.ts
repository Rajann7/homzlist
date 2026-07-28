import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getProject, updateProject, getProjectType, sanitizeProjectAttributes } from "@/lib/listings/projects";
import { getFieldDefinitions } from "@/lib/listings/service";

/** Option lists live in the database (migration 0062) — see the create route. */
async function optionValues(key: string): Promise<string[]> {
  const defs = await getFieldDefinitions();
  return (defs.find((d) => d.key === key)?.options ?? []).map((o) => o.value);
}
async function isExemptReason(code: string): Promise<boolean> {
  return Boolean(code) && (await optionValues("rera_exempt_reason")).includes(code);
}
async function validBuildStatus(v: unknown): Promise<string | null> {
  return typeof v === "string" && (await optionValues("build_status")).includes(v) ? v : null;
}

/**
 * GET   /api/v1/projects/:id (Doc7 §60) — project detail. Numbers are always
 *       public for projects (Doc2 §6). Non-live projects are owner-only → 404.
 * PATCH — the builder's own edit. Ownership-scoped, draws no second slot, and
 *       sends the project back to review.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const claims = await getCurrentUser();
  const project = await getProject(params.id, claims?.sub ?? null);
  if (!project) return fail("NOT_FOUND");
  return ok({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active" || profile.role !== "builder") return fail("FORBIDDEN");

  const limited = await rateLimit(`project-edit:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  // Same field rules as creating one — an edit can't sidestep the RERA gate.
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 3 || name.length > 120) return fail("VALIDATION_ERROR", { field: "name" });

  // Same as the create path: the scheme kind decides which extras it may carry.
  const projectType = await getProjectType(typeof body.projectType === "string" ? body.projectType : null);
  if (!projectType) return fail("VALIDATION_ERROR", { errors: { projectType: "Choose the project type" } });
  const buildStatus = await validBuildStatus(body.buildStatus);
  const allowedBanks = await optionValues("bank_approvals");
  const attributes = await sanitizeProjectAttributes(
    typeof body.attributes === "object" && body.attributes ? body.attributes : {},
    projectType,
    { build_status: buildStatus },
    );
  if (Number.isInteger(body.totalUnits) && Number.isInteger(body.availableUnits) && body.availableUnits > body.totalUnits) {
    return fail("VALIDATION_ERROR", { errors: { availableUnits: "Available units can't exceed total units" } });
  }

  const reraExempt = body.reraExempt === true;
  const reraNumber = typeof body.reraNumber === "string" ? body.reraNumber.trim() : "";
  const exemptReason = typeof body.reraExemptReason === "string" ? body.reraExemptReason.trim() : "";
  if (!reraExempt && !reraNumber) return fail("VALIDATION_ERROR", { field: "reraNumber" });
  if (reraExempt && !(await isExemptReason(exemptReason))) {
    return fail("VALIDATION_ERROR", { errors: { reraExemptReason: "Choose an exemption reason" } });
  }
  if (!body.cityId) return fail("VALIDATION_ERROR", { errors: { cityId: "Choose the project's city" } });

  // Same shape check as the create path — these are FK columns.
  for (const k of ["stateId", "districtId", "talukaId", "cityId", "areaId"] as const) {
    const v = body[k];
    if (v != null && !UUID_RE.test(String(v))) return fail("VALIDATION_ERROR", { field: k });
  }

  // Pincode is required on a project too — an edit may change it, never clear it.
  const pincode = String(body.pincode ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(pincode)) {
    return fail("VALIDATION_ERROR", { errors: { pincode: pincode ? "Enter a valid 6-digit pincode" : "Select a pincode" } });
  }

  const project = await updateProject(params.id, claims.sub, {
    name,
    reraNumber: reraExempt ? null : reraNumber,
    reraExempt,
    reraExemptReason: reraExempt ? exemptReason : null,
    buildStatus,
    possessionDate: buildStatus === "ready" ? null : (typeof body.possessionDate === "string" ? body.possessionDate : null),
    towers: Number.isInteger(body.towers) ? body.towers : null,
    floors: Number.isInteger(body.floors) ? body.floors : null,
    totalUnits: Number.isInteger(body.totalUnits) ? body.totalUnits : null,
    availableUnits: Number.isInteger(body.availableUnits) ? body.availableUnits : null,
    // Checked against the option list, not just "is a string" — the chips are
      // database rows now, so an unknown lender is a hand-made payload.
      bankApprovals: Array.isArray(body.bankApprovals)
        ? body.bankApprovals.filter((b: unknown) => typeof b === "string" && allowedBanks.includes(b)).slice(0, 20)
        : [],
    amenities: Array.isArray(body.amenities) ? body.amenities.filter((a: unknown) => typeof a === "string").slice(0, 40) : [],
    description: typeof body.description === "string" ? body.description.slice(0, 5000) : null,
    stateId: body.stateId ?? null,
    districtId: body.districtId ?? null,
    talukaId: body.talukaId ?? null,
    cityId: body.cityId,
    areaId: body.areaId ?? null,
    areaLabel: typeof body.areaLabel === "string" ? body.areaLabel.slice(0, 120) : null,
    pincode,
    projectType: projectType.code,
    attributes,
    units: Array.isArray(body.units) ? body.units.slice(0, 40) : [],
  });

  if (!project) return fail("NOT_FOUND");
  return ok({ project });
}
