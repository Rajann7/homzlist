import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/admin/guard";
import { adminErrorResponse } from "@/lib/admin/respond";
import { writeAudit } from "@/lib/admin/audit";
import { paymentDetail, refundPaymentFully } from "@/lib/admin/payment-detail";

/**
 * GET  /api/v1/admin/payments/:id — the payment panel (template 1447).
 * POST /api/v1/admin/payments/:id — refund, full only, typed confirmation.
 *
 * The panel is pushed from A11's Payments tab, which is why it lands in P4.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
    const detail = await paymentDetail(params.id);
    if (!detail) return fail("NOT_FOUND");
    return ok(detail);
  } catch (e) {
    return adminErrorResponse(e);
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const me = await requireAdmin("admin");
    if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action !== "refund") return fail("VALIDATION_ERROR", { field: "action" });
    // The dialog makes the admin type the amount back; so does the server.
    if (typeof body.confirm !== "string" || body.confirm.trim() !== "REFUND")
      return fail("VALIDATION_ERROR", { message: "Type REFUND to confirm" });

    const result = await refundPaymentFully(
      params.id,
      me,
      typeof body.reason === "string" ? body.reason : "",
    );
    if (!result.ok) {
      if (result.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { message: result.message ?? result.reason });
    }

    await writeAudit(me, {
      action: "refund",
      entityType: "payment",
      entityId: params.id,
      entityLabel: result.label,
      summary: result.summary,
      diff: result.diff ?? null,
      sensitive: true,
    });

    return ok({ done: true, summary: result.summary });
  } catch (e) {
    return adminErrorResponse(e);
  }
}
