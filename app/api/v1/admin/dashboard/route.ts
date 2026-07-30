import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { isDenial, requireStaff } from "@/lib/admin/auth";
import {
  anomalies,
  pendingTiles,
  revenueSeries,
  slaOverdue,
  systemStrips,
  todayStats,
  type ChartRange,
} from "@/lib/admin/dashboard";

/**
 * GET /api/v1/admin/dashboard — everything A2 draws, in one round trip.
 *
 * Staff-gated only (no capability): the dashboard is the landing screen for all
 * three levels, and Doc3 §1.1 gives even Staff the queues it counts.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const RANGES: ChartRange[] = ["7d", "30d", "6m"];

export async function GET(req: NextRequest) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;

  const asked = req.nextUrl.searchParams.get("range") as ChartRange | null;
  const range: ChartRange = asked && RANGES.includes(asked) ? asked : "7d";

  const [tiles, stats, banners, revenue, overdue, system] = await Promise.all([
    pendingTiles(),
    todayStats(),
    anomalies(),
    revenueSeries(range),
    slaOverdue(),
    systemStrips(),
  ]);

  return ok({ tiles, stats, anomalies: banners, revenue: { range, points: revenue }, overdue, system });
}
