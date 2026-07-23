import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature, methodLabel } from "@/lib/billing/razorpay";
import { activatePaidOrder, getOrderByRazorpayId, recordFailedPayment } from "@/lib/billing/service";

/**
 * POST /api/v1/billing/webhook/rzp-3f9c1a (Doc7 §30) — Razorpay webhook.
 *
 * Everything Doc9 §12 asks of a webhook lives here:
 *  - HMAC-verified against the RAW body (parsing first would break the digest).
 *  - Idempotent: the event id is stored unique-keyed, so re-deliveries no-op.
 *  - Activation only after the server itself confirms amount + currency +
 *    `captured` — a forged client "success" can never reach this code path.
 *  - Guess-proof path (the `rzp-3f9c1a` segment) so the endpoint isn't trivially
 *    discoverable by scanning /api/v1/billing/*.
 *
 * Always answers 200 once the signature is valid: a non-2xx makes Razorpay
 * retry forever over a bug that a retry cannot fix.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // RAW text — must not be JSON.parse'd before the HMAC check.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    // Generic 401, no detail — an attacker learns nothing about why.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const db = createServiceClient();
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${event?.event}:${event?.payload?.payment?.entity?.id}`;

  // Idempotency gate: unique(provider, event_id) — a duplicate insert throws and
  // we return early without touching a single entitlement.
  const { error: dupe } = await db.from("webhook_events").insert({
    provider: "razorpay",
    event_id: eventId,
    event_type: event?.event ?? null,
    payload: event ?? null,
    status: "processed",
  });
  if (dupe) return NextResponse.json({ ok: true, duplicate: true });

  const entity = event?.payload?.payment?.entity;
  if (!entity?.order_id) return NextResponse.json({ ok: true });

  const order = await getOrderByRazorpayId(entity.order_id);
  if (!order) {
    await db.from("webhook_events").update({ status: "skipped", note: "no matching order" }).eq("event_id", eventId);
    return NextResponse.json({ ok: true });
  }

  try {
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const result = await activatePaidOrder(order, {
        paymentId: entity.id,
        razorpayOrderId: entity.order_id,
        amountPaise: entity.amount,
        currency: entity.currency,
        status: "captured",
        method: entity.method,
        methodDetail: methodLabel(entity),
      });
      if (!result.activated && result.reason === "amount_mismatch") {
        await db.from("webhook_events").update({ status: "mismatch" }).eq("event_id", eventId);
      }
    } else if (event.event === "payment.failed") {
      await recordFailedPayment(order, entity.error_description ?? "Payment failed", entity.id);
    }
  } catch (err) {
    await db
      .from("webhook_events")
      .update({ status: "failed", note: err instanceof Error ? err.message.slice(0, 300) : "unknown" })
      .eq("event_id", eventId);
    // Still 200 — the hourly reconciliation cron (Doc2 §4.3) repairs the row.
  }

  return NextResponse.json({ ok: true });
}
