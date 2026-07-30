import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/payments/[id]/refund — A18's refund (Doc5 A18, Doc9 §12).
 *
 * The rule that shapes this endpoint: money must never move without the thing
 * it bought moving with it. So the refund is not two independent writes — it
 * calls Razorpay first, and only a gateway refund id lets `refundAndRevoke`
 * mark the payment, close the order and revoke the plan in one path. If
 * Razorpay refuses, nothing here changed.
 *
 * It is `refunds` capability (Admin+), full amount only. Partial refunds are a
 * pricing decision, not a moderation one, and Doc2 §4.3 does not have them.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireCapability("refunds");
  if (isDenial(gate)) return gate.response;

  let body: { reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

  const db = createServiceClient();
  const { data } = await db
    .from("payments")
    .select("id, order_id, profile_id, amount_paise, status, razorpay_payment_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) return fail("NOT_FOUND");
  const payment = data as {
    id: string;
    order_id: string | null;
    profile_id: string;
    amount_paise: number;
    status: string;
    razorpay_payment_id: string | null;
  };

  if (payment.status === "refunded") return fail("LISTING_STATE_LOCKED", { alreadyRefunded: true });
  if (payment.status !== "success") return fail("LISTING_STATE_LOCKED", { notSuccessful: true, status: payment.status });
  if (!payment.order_id) return fail("VALIDATION_ERROR", { detail: "no_order" });
  if (!payment.razorpay_payment_id) return fail("VALIDATION_ERROR", { detail: "no_gateway_id" });

  // ---- the gateway first ---------------------------------------------------
  const { isConfigured, refundPayment } = await import("@/lib/billing/razorpay");
  let refundId: string;
  if (isConfigured()) {
    try {
      const r = await refundPayment(payment.razorpay_payment_id, payment.amount_paise, {
        reason: reason.slice(0, 120),
        admin: gate.staff.email,
      });
      refundId = r.id;
    } catch {
      // Nothing has been written yet, so the caller can simply try again.
      return fail("SERVER_ERROR", { detail: "gateway_refused" });
    }
  } else {
    // DEV, where Razorpay keys are not configured. The id is marked so it can
    // never be mistaken for a real gateway refund in reconciliation.
    refundId = `rfnd_dev_${payment.id.replace(/-/g, "").slice(0, 12)}`;
  }

  // ---- our side, atomically ------------------------------------------------
  const { refundAndRevoke } = await import("@/lib/billing/service");
  const unpublished = await refundAndRevoke({
    paymentId: payment.id,
    orderId: payment.order_id,
    refundId,
    reason,
  });

  await audit({
    actor: gate.staff,
    action: "refund",
    entityType: "payment",
    entityId: payment.id,
    entityLabel: payment.razorpay_payment_id,
    summary: `Refunded ₹${(payment.amount_paise / 100).toLocaleString("en-IN")} — ${reason}`,
    diff: { status: { old: payment.status, new: "refunded" } },
    reason,
    sensitive: true,
  });

  return ok({ refundId, unpublished: unpublished.length, gateway: isConfigured() });
}
