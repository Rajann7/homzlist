import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createProject, listMyProjects, getProjectType, sanitizeProjectAttributes, NoProjectSlotError } from "@/lib/listings/projects";
import { getFieldDefinitions, activeBoostsFor } from "@/lib/listings/service";
import { flagEnabled } from "@/lib/system/flags";

/**
 * The exemption reasons and the build statuses are `field_definitions` option
 * lists, not constants. Both used to be arrays of strings — one in the form
 * component and a second copy in this route — so the two could disagree and
 * the second one silently won.
 */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const items = await listMyProjects(claims.sub);
  // The builder's own Projects list states a running boost exactly as a
  // listing row does. It comes from the `boosts` table here rather than being
  // inferred from `status`, which only ever says live/hidden/under review.
  const boosts = await activeBoostsFor(items.map((p) => p.id), "project");
  return ok({
    items: items.map((p) => ({ ...p, promoted: boosts.has(p.id), boost: boosts.get(p.id) ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  // Projects are a Builder-only product (Doc2 §6).
  if (profile.role !== "builder") return fail("FORBIDDEN");
  // A22 Feature flags → Builder projects. Off = the product is closed. Default-on.
  if (!(await flagEnabled("projects", { role: profile.role, userId: claims.sub })))
    return fail("FORBIDDEN");

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

  // A project now declares WHAT KIND of scheme it is (migration 0062), and that
  // choice decides which extra fields it may carry. Without it the form had one
  // shape for a plotting scheme and a shopping complex alike.
  const projectType = await getProjectType(typeof body.projectType === "string" ? body.projectType : null);
  if (!projectType) return fail("VALIDATION_ERROR", { errors: { projectType: "Choose the project type" } });

  const reraExempt = body.reraExempt === true;
  const reraNumber = typeof body.reraNumber === "string" ? body.reraNumber.trim() : "";
  const exemptReason = typeof body.reraExemptReason === "string" ? body.reraExemptReason.trim() : "";
  if (!reraExempt && !reraNumber) return fail("VALIDATION_ERROR", { field: "reraNumber" });
  // The reason is an option CODE now, not free text, so check it against the
  // definition rather than against a length.
  if (reraExempt && !(await isExemptReason(exemptReason))) {
    return fail("VALIDATION_ERROR", { errors: { reraExemptReason: "Choose an exemption reason" } });
  }

  // Also an option list in the database now, so a fourth status is a row.
  const buildStatus = await validBuildStatus(body.buildStatus);
  const allowedBanks = await optionValues("bank_approvals");

  const attributes = await sanitizeProjectAttributes(
    typeof body.attributes === "object" && body.attributes ? body.attributes : {},
    projectType,
    { build_status: buildStatus },
    );

  // Available can never exceed total — the client checked it, nothing else did.
  if (Number.isInteger(body.totalUnits) && Number.isInteger(body.availableUnits) && body.availableUnits > body.totalUnits) {
    return fail("VALIDATION_ERROR", { errors: { availableUnits: "Available units can't exceed total units" } });
  }

  if (!body.cityId) return fail("VALIDATION_ERROR", { errors: { cityId: "Choose the project's city" } });

  // The location ids go straight into FK columns. Without a shape check a
  // malformed one is a 500 from Postgres rather than a 400 from us.
  for (const k of ["stateId", "districtId", "talukaId", "cityId", "areaId"] as const) {
    const v = body[k];
    if (v != null && !UUID_RE.test(String(v))) return fail("VALIDATION_ERROR", { field: k });
  }

  // Pincode is REQUIRED here for the same reason it is on a listing: it used to
  // be silently coerced to null when it didn't match, so most projects had none
  // and their area pages had no postal anchor. It is picked from the place's
  // real codes now, so a bad one means the payload was hand-made.
  const pincode = String(body.pincode ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(pincode)) {
    return fail("VALIDATION_ERROR", { errors: { pincode: pincode ? "Enter a valid 6-digit pincode" : "Select a pincode" } });
  }

  try {
    const project = await createProject(claims.sub, {
      name,
      reraNumber: reraExempt ? null : reraNumber,
      reraExempt,
      reraExemptReason: reraExempt ? exemptReason : null,
      buildStatus,
      // A finished scheme has no possession date to give — the form used to ask
      // for one on "Ready to move" and store whatever was picked.
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
    return ok({ project });
  } catch (e) {
    if (e instanceof NoProjectSlotError) return fail("PLAN_REQUIRED");
    throw e;
  }
}
