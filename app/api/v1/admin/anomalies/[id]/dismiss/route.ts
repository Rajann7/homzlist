import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/anomalies/:id/dismiss — the × on a dashboard banner.
 *
 * The design dismisses into component state, which would mean the alert came
 * back on the next page load and every admin dismissed it separately. It is
 * persisted instead: the banner is a shared operational signal, so dismissing
 * is a decision ("we have seen this") that belongs on the row, with the admin's
 * id on it. Same pixels, a control that actually does something.
 *
 * Dismissing an already-dismissed banner is not an error — two admins clicking
 * the same × is normal — but it does not overwrite who got there first.
 */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("staff");
    const db = createServiceClient();

    const { data: row } = await db
      .from("anomaly_events")
      .select("id, message, dismissed_at")
      .eq("id", params.id)
      .maybeSingle();
    if (!row) return fail("NOT_FOUND");
    if (row.dismissed_at) return ok({ dismissed: true });

    const { error } = await db
      .from("anomaly_events")
      .update({ dismissed_at: new Date().toISOString(), dismissed_by: me.id })
      .eq("id", params.id)
      .is("dismissed_at", null);
    if (error) throw new Error(error.message);

    await writeAudit(me, {
      action: "anomaly_dismiss",
      entityType: "anomaly_event",
      entityId: row.id,
      entityLabel: row.message,
      summary: "Dismissed a dashboard anomaly banner",
    });

    return ok({ dismissed: true });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
