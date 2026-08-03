import { ok } from "@/lib/api";
import { publicMaintenanceState } from "@/lib/system/maintenance";

/**
 * GET /api/v1/system/maintenance — what the maintenance page prints (message +
 * ETA + when it started). Public and deliberately unauthenticated: this is the
 * one endpoint that must answer while everything else is refusing to.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await publicMaintenanceState());
}
