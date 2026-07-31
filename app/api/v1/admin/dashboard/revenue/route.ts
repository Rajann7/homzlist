import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { isRevenueRange, revenueSeries } from "@/lib/admin/dashboard";

/**
 * GET /api/v1/admin/dashboard/revenue?range=7d|30d|6m — the chart's chips.
 *
 * The chips re-query rather than re-slicing one payload, because 6 months of
 * revenue is not something to ship to the browser so that a click can hide
 * five-sixths of it. An unknown range is refused rather than silently treated
 * as 7d, so a broken link says so.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("staff");
    const range = new URL(req.url).searchParams.get("range");
    if (!isRevenueRange(range)) return fail("VALIDATION_ERROR");
    return ok(await revenueSeries(range));
  } catch (e) {
    return adminErrorResponse(e);
  }
}
