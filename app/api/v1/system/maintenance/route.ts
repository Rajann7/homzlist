import { ok } from "@/lib/api";
import { publicMaintenanceState } from "@/lib/system/maintenance";

/**
 * GET /api/v1/system/maintenance — what the maintenance page prints (message +
 * ETA + when it started). Public and deliberately unauthenticated: this is the
 * one endpoint that must answer while everything else is refusing to.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET() {
  return ok(await publicMaintenanceState());
}
