import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { adminLead } from "@/lib/admin/leads";

/**
 * GET /api/v1/admin/leads/:id — the read-only LEAD viewer (replaces the chat
 * viewer at /admin/threads/:id, which had nothing left to read).
 *
 * There is no POST in this file, and that is the point: the same Doc9 rule that
 * made admin chat read-only applies here. A moderator resolves a report by
 * acting on the PEOPLE or on the report — never by editing someone's lead. The
 * write path does not exist to be found.
 *
 * Opening a lead exposes both parties' numbers, so it is a sensitive read and
 * is audited as one.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

    const lead = await adminLead(params.id);
    if (!lead) return fail("NOT_FOUND");

    await writeAudit(me, {
      action: "view_lead",
      entityType: "lead",
      entityId: params.id,
      entityLabel: `Lead ${params.id.slice(0, 8)}`,
      summary: "Opened a lead read-only (contact details visible)",
      sensitive: true,
    });

    return ok(lead);
  } catch (e) {
    return adminErrorResponse(e);
  }
}
