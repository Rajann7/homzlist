import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchOrderPayments, refundPayment, isConfigured, methodLabel } from "./razorpay";
import {
  activatePaidOrder, refundAndRevoke, expirePlans, expireBoosts, releaseCouponSlot,
  sendExpiryReminders, claimBoostRefund, releaseBoostRefundClaim, getSettings, type OrderRow,
} from "./service";

/**
 * Hourly billing reconciliation (Doc2 §4.3, Doc7 §21 item 12).
 *
 * Repairs the states that a crash, a dropped webhook or an admin action can
 * leave behind. Everything here is idempotent and safe to re-run.
 *
 *  1. Orders stuck `paid` with no payment row — the crash window between the
 *     order claim and the payment insert in `activatePaidOrder`. Re-opened to
 *     `pending` so the next webhook/verify completes them.
 *  2. Orders `pending` past the window — asks Razorpay directly whether they
 *     actually paid, and activates if so. This is the safety net for a webhook
 *     that never arrived.
 *  3. Boosts left `rejected` on a paid order — issues the automatic refund
 *     Doc2 §13 promises.
 *  4. Plan + boost expiry (also run on read, but the cron is the guarantee).
 */

const db = () => createServiceClient();
const MIN = 60_000;

export interface ReconcileReport {
  reopenedStuck: number;
  activatedLate: number;
  markedFailed: number;
  boostRefunds: number;
  boostsTimedOut: number;
  plansExpired: number;
  remindersSent: number;
  checked: number;
}

/** 1. `paid` but no payment row → the activation never finished. */
async function reopenStuckOrders(): Promise<number> {
  const { data } = await db()
    .from("orders")
    .select("id, payments(id)")
    .eq("status", "paid")
    .lt("updated_at", new Date(Date.now() - 10 * MIN).toISOString());

  const stuck = ((data ?? []) as any[]).filter((o) => !(o.payments ?? []).length);
  for (const o of stuck) {
    await db().from("orders").update({ status: "pending" }).eq("id", o.id).eq("status", "paid");
    await note(o.id, "reopened: paid with no payment row");
  }
  return stuck.length;
}

/**
 * 2. Ask Razorpay about orders still pending. Activation goes through the same
 *    `activatePaidOrder` as the webhook, so the amount/currency/order-binding
 *    checks all still apply — this is a retry, not a shortcut.
 */
async function settlePendingOrders(): Promise<{ activated: number; failed: number; checked: number }> {
  if (!isConfigured()) return { activated: 0, failed: 0, checked: 0 };

  const { data } = await db()
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .not("razorpay_order_id", "is", null)
    .lt("created_at", new Date(Date.now() - 10 * MIN).toISOString())
    .gt("created_at", new Date(Date.now() - 7 * 24 * 60 * MIN).toISOString())
    .limit(100);

  const orders = (data ?? []) as OrderRow[];
  let activated = 0, failed = 0;

  for (const order of orders) {
    try {
      const { items } = await fetchOrderPayments(order.razorpay_order_id!);
      const captured = items.find((p) => p.status === "captured");

      if (captured) {
        const res = await activatePaidOrder(order, {
          paymentId: captured.id,
          razorpayOrderId: captured.order_id,
          amountPaise: captured.amount,
          currency: captured.currency,
          status: "captured",
          method: captured.method,
          methodDetail: methodLabel(captured),
        });
        if (res.activated) {
          activated++;
          await note(order.id, "activated by reconciliation (webhook missed)");
        }
      } else if (items.length && items.every((p) => p.status === "failed")) {
        await db().from("orders").update({ status: "failed" }).eq("id", order.id).eq("status", "pending");
        // A dead order must not keep sitting on the user's coupon slot.
        await releaseCouponSlot(order.id);
        failed++;
      }
    } catch (e) {
      await note(order.id, "reconcile error: " + (e instanceof Error ? e.message.slice(0, 120) : "unknown"));
    }
  }
  return { activated, failed, checked: orders.length };
}

/**
 * 3a. A paid boost nobody ever approved → auto-refund after the configured
 * window (migration 0012).
 *
 * Nothing transitions `pending_approval` → `active` until the admin module
 * (P13-15) ships, so without this a buyer's money sits in a dead-end state
 * forever. Refunding is the safe direction: auto-APPROVING would bypass the
 * moderation gate Doc2 §13 requires. Marking them `rejected` hands them to the
 * existing refund sweep below, which is already single-flight and idempotent.
 */
async function timeoutStalePendingBoosts(): Promise<number> {
  const settings = await getSettings();
  const raw = Number(settings.boost_pending_max_hours ?? 48);
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  // Clamp to 1 hour … 30 days. This value becomes editable from the admin
  // settings screen (P13-15), and a fat-fingered `0.01` would otherwise refund
  // every pending boost on the next tick. A floor makes that impossible.
  const maxHours = Math.min(Math.max(raw, 1), 24 * 30);

  const cutoff = new Date(Date.now() - maxHours * 3_600_000).toISOString();
  const { data } = await db()
    .from("boosts")
    .update({
      status: "rejected",
      reject_reason: `Not reviewed within ${maxHours} hours — automatically refunded`,
    })
    .eq("status", "pending_approval")
    .lt("created_at", cutoff)
    .select("id");

  return data?.length ?? 0;
}

/** 3. Rejected boost on a paid order → automatic refund (Doc2 §13). */
async function refundRejectedBoosts(): Promise<number> {
  // `cancelled` belongs here too: the cancel endpoint refunds inline, but if
  // that call fails (Razorpay blip, rate limit) the boost is already gone while
  // the money is not back. Without this the user silently loses both.
  const { data } = await db()
    .from("boosts")
    .select("id, order_id, status")
    .in("status", ["rejected", "cancelled"])
    .is("refunded_at", null)
    .not("order_id", "is", null)
    .limit(50);

  let refunded = 0;
  for (const b of (data ?? []) as { id: string; order_id: string; status: string }[]) {
    const { data: pay } = await db()
      .from("payments")
      .select("id, razorpay_payment_id, amount_paise, status")
      .eq("order_id", b.order_id)
      .in("status", ["success", "refunded"])
      .maybeSingle();
    const payment = pay as {
      id: string; razorpay_payment_id: string | null; amount_paise: number; status: string;
    } | null;
    if (!payment) continue;

    // The money already went back but the boost never got stamped — a failure
    // between the two writes. Backfill rather than refunding a second time.
    if (payment.status === "refunded") {
      await db().from("boosts").update({ refunded_at: new Date().toISOString() }).eq("id", b.id);
      continue;
    }

    // Single-flight: skip anything the cancel handler is already refunding.
    if (!(await claimBoostRefund(b.id))) continue;

    const cancelled = b.status === "cancelled";
    try {
      let refundId = `rfnd_auto_${payment.id.replace(/-/g, "").slice(0, 12)}`;
      if (isConfigured() && payment.razorpay_payment_id) {
        const r = await refundPayment(payment.razorpay_payment_id, payment.amount_paise, {
          reason: cancelled ? "boost cancelled before approval" : "boost rejected by admin",
          boostId: b.id,
        });
        refundId = r.id;
      }
      await refundAndRevoke({
        paymentId: payment.id,
        orderId: b.order_id,
        refundId,
        reason: cancelled
          ? "Boost cancelled before approval — automatic refund"
          : "Boost rejected — automatic refund",
      });
      await db().from("boosts").update({ refunded_at: new Date().toISOString() }).eq("id", b.id);
      refunded++;
    } catch {
      // Hand the claim back so next hour's sweep can try again — holding it
      // would strand the refund until the staleness window elapsed.
      await releaseBoostRefundClaim(b.id);
    }
  }
  return refunded;
}

/** Audit trail — reuses webhook_events so every anomaly is in one place. */
async function note(orderId: string, text: string) {
  await db().from("webhook_events").insert({
    provider: "reconcile",
    event_id: `reconcile:${orderId}:${Date.now()}`,
    event_type: "reconciliation",
    status: "processed",
    note: text,
  });
}

export async function runBillingReconciliation(): Promise<ReconcileReport> {
  const reopenedStuck = await reopenStuckOrders();
  const settled = await settlePendingOrders();
  // Time out unreviewed boosts FIRST so this same sweep refunds them, rather
  // than leaving the buyer waiting another hour.
  const boostsTimedOut = await timeoutStalePendingBoosts();
  const boostRefunds = await refundRejectedBoosts();

  // Reminders BEFORE expiry runs, so a plan crossing its end date in this same
  // sweep still gets its 1-day notice rather than silently flipping to expired.
  const remindersSent = await sendExpiryReminders();

  await expirePlans();
  await expireBoosts();
  const { count } = await db()
    .from("user_plans")
    .select("id", { count: "exact", head: true })
    .eq("status", "expired");

  return {
    reopenedStuck,
    activatedLate: settled.activated,
    markedFailed: settled.failed,
    boostRefunds,
    boostsTimedOut,
    plansExpired: count ?? 0,
    remindersSent,
    checked: settled.checked,
  };
}
