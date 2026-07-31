import { ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { markAllNotificationsRead } from "@/lib/admin/notifications";

/**
 * POST /api/v1/admin/notifications/read-all — the bell sheet's "Mark all read".
 *
 * Audited even though it changes nothing a user can see: the feed is shared, so
 * "who cleared the alerts" is a real question when the next shift asks why the
 * payment-spike banner was already read.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const me = await requireAdmin("staff");
    const cleared = await markAllNotificationsRead();
    if (cleared > 0) {
      await writeAudit(me, {
        action: "notifications_read_all",
        entityType: "admin_notification",
        entityLabel: `${cleared} notifications`,
        summary: `Marked ${cleared} admin notification(s) as read`,
      });
    }
    return ok({ cleared });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
