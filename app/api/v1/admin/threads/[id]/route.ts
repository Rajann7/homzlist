import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { adminThread } from "@/lib/admin/users";

/**
 * GET /api/v1/admin/threads/:id — the READ-ONLY chat viewer (template 1390).
 *
 * There is no POST in this file, and that is the point: Doc9 requires admin
 * chats to be read-only enforced at the API, so the send path does not exist to
 * be found rather than existing and being disabled. Opening a thread is a
 * sensitive read and is audited as one.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

    const thread = await adminThread(params.id);
    if (!thread) return fail("NOT_FOUND");

    await writeAudit(me, {
      action: "view_chat",
      entityType: "thread",
      entityId: params.id,
      entityLabel: `Thread ${params.id.slice(0, 8)}`,
      summary: "Opened a chat thread read-only",
      sensitive: true,
    });

    return ok(thread);
  } catch (e) {
    return adminErrorResponse(e);
  }
}
