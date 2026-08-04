import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { userHeader, userTab, type UserTab } from "@/lib/admin/users";

/**
 * GET /api/v1/admin/users/:id?tab=… — A11's header, and ONE tab.
 *
 * A tab at a time, deliberately: opening a user must not drag their whole chat
 * history across the wire, and the Chats tab is the most sensitive surface in
 * the panel. Reading it is audited as sensitive for the same reason the export
 * is — a read that would embarrass us if it were unlogged.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABS = new Set<UserTab>([
  "overview",
  "plans",
  "payments",
  "listings",
  "requirements",
  "leads",
  "chats",
  "communication",
  "notes",
  "timeline",
]);

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

    const header = await userHeader(params.id);
    if (!header) return fail("NOT_FOUND");

    const asked = (new URL(req.url).searchParams.get("tab") ?? "overview") as UserTab;
    const tab = TABS.has(asked) ? asked : "overview";
    const data = await userTab(params.id, tab);

    if (tab === "chats") {
      await writeAudit(me, {
        action: "view_chats",
        entityType: "user",
        entityId: params.id,
        entityLabel: header.name ?? params.id,
        summary: "Opened the read-only chat list",
        sensitive: true,
      });
    }

    return ok({ header, tab, data });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
