import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireStaff } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/anomalies/:id/dismiss — A2 row 3's × button.
 *
 * A banner an admin has dealt with must stay gone after a reload, so dismissal
 * is a column (dismissed_at/dismissed_by), not component state. It is also who
 * dismissed it: an anomaly waved away is a decision someone made.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;
  if (!UUID_RE.test(params.id)) return fail("VALIDATION_ERROR", { field: "id" });

  const db = createServiceClient();
  const { data } = await db
    .from("anomaly_events")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: gate.staff.id })
    .eq("id", params.id)
    .is("dismissed_at", null)
    .select("id");

  if (!data?.length) return fail("NOT_FOUND");
  return ok({ dismissed: params.id });
}
