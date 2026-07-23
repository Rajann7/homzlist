import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { updateProjectUnits, getProject } from "@/lib/listings/projects";

/** PATCH /api/v1/projects/:id/units (Doc7 §61) — update unit availability. */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // Match the throttle on every sibling mutation route (audit finding).
  const limited = await rateLimit(`project-units:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  const units = Array.isArray(body.units) ? body.units.filter((u: any) => typeof u?.id === "string") : [];
  if (!units.length) return fail("VALIDATION_ERROR", { field: "units" });

  const okd = await updateProjectUnits(params.id, claims.sub, units);
  if (!okd) return fail("NOT_FOUND");
  return ok({ project: await getProject(params.id, claims.sub) });
}
