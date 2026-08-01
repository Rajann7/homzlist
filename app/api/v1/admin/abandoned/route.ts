import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { sendAdminMessage } from "@/lib/admin/users";

/**
 * A17's Abandoned tab (template 1121) — checkouts started and never finished,
 * and the "Send retry link" the design puts on each one.
 *
 * Abandoned is an ORDER with no successful payment, so it has its own relation
 * rather than a status on the payments list: a chip filtering PAYMENTS for
 * "abandoned" could only ever be empty, because the whole point is that no
 * payment row exists.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin("admin");
    // The design says "in the last 24 hours"; the window is a parameter so the
    // screen can widen it rather than the tab simply going empty overnight.
    const hours = Math.min(720, Math.max(1, Number(new URL(req.url).searchParams.get("hours") ?? 24)));
    const from = new Date(Date.now() - hours * 3_600_000).toISOString();
    // `count` comes back from the same filtered query, so a window holding more
    // than the cap says so on screen instead of quietly showing the newest 100
    // as if that were all of them.
    const { data, count } = await createServiceClient()
      .from("admin_abandoned_checkouts")
      .select("*", { count: "exact" })
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(100);
    return ok({ rows: data ?? [], hours, total: count ?? (data?.length ?? 0) });
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAdmin("admin");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action !== "retry") return fail("VALIDATION_ERROR", { field: "action" });
    const orderId = typeof body.id === "string" ? body.id : "";
    if (!UUID_RE.test(orderId)) return fail("NOT_FOUND");

    const db = createServiceClient();
    const { data } = await db
      .from("admin_abandoned_checkouts")
      .select("id, profile_id, user_name, item_name, total_paise")
      .eq("id", orderId)
      .maybeSingle();
    const row = data as
      | { id: string; profile_id: string; user_name: string; item_name: string; total_paise: number }
      | null;
    // It is only abandoned while it is still unpaid. A retry link for an order
    // the user has since completed is a message telling them to pay twice.
    if (!row) return fail("VALIDATION_ERROR", { message: "That checkout is no longer abandoned" });

    const amount = `₹${Math.round(Number(row.total_paise) / 100).toLocaleString("en-IN")}`;
    const result = await sendAdminMessage(
      [row.profile_id],
      me,
      // The design's toast says "via WhatsApp + email"; the send reports what
      // each channel actually did rather than claiming both went.
      ["in_app", "email", "whatsapp"],
      "Finish your HomzList purchase",
      `Your ${row.item_name} (${amount}) is still waiting. Open HomzList to complete the payment.`,
    );
    if (!result.ok) return fail("VALIDATION_ERROR", { message: result.message });

    await writeAudit(me, {
      action: "retry_link",
      entityType: "order",
      entityId: orderId,
      entityLabel: row.user_name,
      summary: `Retry link sent — ${result.summary}`,
      diff: result.diff ?? null,
    });

    return ok({ done: true, summary: result.summary });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
