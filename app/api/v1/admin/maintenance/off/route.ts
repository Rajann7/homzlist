import { ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/maintenance/off — the "Turn off" link on the shell's
 * maintenance banner (template 125-128).
 *
 * Turning maintenance ON, the message, the ETA and the bypass roles are A22
 * Settings and belong to a later part. Turning it OFF is here because the
 * banner is here: a banner that says the whole site is down and offers a link
 * that does nothing is worse than no link. Super only — the same rank A22 will
 * require, so the gate does not loosen when that screen lands.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const me = await requireAdmin("super");
    const db = createServiceClient();

    const { error } = await db
      .from("maintenance_settings")
      .update({ enabled: false, updated_by: me.id, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);

    await writeAudit(me, {
      action: "maintenance_off",
      entityType: "maintenance_settings",
      entityLabel: "Maintenance mode",
      summary: "Turned maintenance mode off",
      sensitive: true,
    });

    return ok({ enabled: false });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
