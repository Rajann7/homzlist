import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrder, activatePaidOrder, recordFailedPayment } from "@/lib/billing/service";
import { fetchOrderPayments, verifyCheckoutSignature, isConfigured, methodLabel } from "@/lib/billing/razorpay";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/billing/verify (Doc7 §31) — the client's post-checkout callback.
 *
 * The client's word is only ever a HINT that something happened. We then:
 *   1. verify the checkout HMAC (order|payment signed with our key secret), and
 *   2. re-read the payment FROM Razorpay and activate on that reading alone.
 * A forged `{razorpay_payment_id: "x", status: "paid"}` gets nothing (Doc9 §12).
 *
 * Activation is shared with the webhook and is idempotent, so whichever arrives
 * first wins and the second is a no-op.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // This endpoint calls out to Razorpay on every hit — cap it per user so it
  // can't be used to hammer the gateway or as an amplifier (Doc9 §13).
  const limited = await rateLimit(`verify:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  if (!orderId) return fail("VALIDATION_ERROR", { field: "orderId" });

  // Ownership check — someone else's order is a 404, not a 403 (Doc9 §API1).
  const order = await getOrder(orderId, claims.sub);
  if (!order) return fail("NOT_FOUND");

  if (order.status === "paid") return ok({ status: "success", orderId: order.id });

  // ---- Dev simulation (no Razorpay keys) ----------------------------------
  // Lets the whole flow be exercised locally. Never runs in production, and
  // never runs when keys ARE configured.
  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") return fail("SERVER_ERROR");
    const simulate = typeof body.simulate === "string" ? body.simulate : "success";
    if (simulate === "failed") {
      await recordFailedPayment(order, "Payment declined by bank (simulated)");
      return ok({ status: "failed", orderId: order.id });
    }
    if (simulate === "pending") return ok({ status: "pending", orderId: order.id });
    const result = await activatePaidOrder(order, {
      paymentId: `pay_dev_${order.id.replace(/-/g, "").slice(0, 14)}`,
      razorpayOrderId: order.razorpay_order_id ?? "",
      amountPaise: order.total_paise,
      currency: order.currency,
      status: "captured",
      method: "upi",
      methodDetail: "UPI · GPay",
    });
    return ok({ status: "success", orderId: order.id, invoiceNumber: result.invoiceNumber });
  }

  // ---- Real verification ---------------------------------------------------
  // Every branch below echoes `orderId`. The checkout screen keys its poller and
  // its "Check status" button off it, so a pending/failed answer without one
  // leaves a UPI-collect order with no way to ever settle on screen.
  if (!order.razorpay_order_id) return ok({ status: "pending", orderId: order.id });

  // If the client passed back a Checkout handoff, its HMAC must be valid. This
  // is an early reject only — it is NOT what activation is based on.
  const claimedPaymentId = typeof body.razorpayPaymentId === "string" ? body.razorpayPaymentId : null;
  const signature = typeof body.razorpaySignature === "string" ? body.razorpaySignature : null;
  if (claimedPaymentId && signature && !verifyCheckoutSignature(order.razorpay_order_id, claimedPaymentId, signature)) {
    return fail("PAYMENT_FAILED");
  }

  // Resolve the payment BY THE ORDER, never by a client-supplied payment id.
  // Razorpay itself tells us which payments belong to this order, so a captured
  // payment from some other order can't be replayed here to mint entitlement.
  const { items } = await fetchOrderPayments(order.razorpay_order_id);
  const payment = items.find((p) => p.status === "captured") ?? items[0];

  if (!payment) return ok({ status: "pending", orderId: order.id });

  if (payment.status === "failed") {
    await recordFailedPayment(order, payment.error_description ?? "Payment failed", payment.id);
    return ok({ status: "failed", orderId: order.id, reason: payment.error_description ?? null });
  }
  if (payment.status !== "captured") return ok({ status: "pending", orderId: order.id });

  const result = await activatePaidOrder(order, {
    paymentId: payment.id,
    razorpayOrderId: payment.order_id,
    amountPaise: payment.amount,
    currency: payment.currency,
    status: "captured",
    method: payment.method,
    methodDetail: methodLabel(payment),
  });

  if (!result.activated && (result.reason === "amount_mismatch" || result.reason === "order_mismatch")) {
    return fail("PAYMENT_FAILED");
  }
  return ok({ status: "success", orderId: order.id, invoiceNumber: result.invoiceNumber });
}
