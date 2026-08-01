import { ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/admin/message-templates — what the Send-message sheet's dropdown
 * offers (template 1720).
 *
 * The design lists four literals ("Custom · Listing approved · Renewal reminder
 * · Verification pending"). Shipping those would offer an admin a template that
 * may not exist and hide one that does — CLAUDE.md bans an option list
 * hardcoded in a component. `message_templates` is the table A21 owns, so the
 * sheet can only ever offer something that will actually render.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    await requireAdmin("staff");
    const db = createServiceClient();
    const { data } = await db
      .from("message_templates")
      .select("code, name, subject, body, channel")
      .eq("is_active", true)
      .in("channel", ["email", "in_app", "whatsapp"])
      .order("name");
    return ok({ rows: data ?? [] });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
