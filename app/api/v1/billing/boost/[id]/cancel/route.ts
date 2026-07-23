import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  cancelPendingBoost, getBoost, refundAndRevoke, claimBoostRefund, releaseBoostRefundClaim,
} from "@/lib/billing/service";
import { createServiceClient } from "@/lib/supabase/server";
import { refundPayment, isConfigured } from "@/lib/billing/razorpay";

/**
 * POST /api/v1/billing/boost/:id/cancel (Doc7 §42) — cancel a boost that is
 * still waiting for admin approval, with an automatic refund.
 *
 * Only `pending_approval` can be cancelled: once a boost is live it has already
 * delivered placement, and Doc2 §13 is explicit that unused days are not
 * refunded. That rule is enforced by the UPDATE's `status` predicate, so a
 * crafted request against an active boost changes nothing.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // Ownership first — a boost belonging to someone else is simply not found.
  const boost = await getBoost(params.id, claims.sub);
  if (!boost) return fail("NOT_FOUND");
  if (boost.status !== "pending_approval") return fail("LISTING_STATE_LOCKED");

  const cancelled = await cancelPendingBoost(params.id, claims.sub);
  if (!cancelled) return fail("LISTING_STATE_LOCKED");

  // Refund the captured payment for this order, atomically revoking the benefit.
  if (cancelled.order_id) {
    const db = createServiceClient();
    const { data } = await db
      .from("payments")
      .select("id,razorpay_payment_id,amount_paise")
      .eq("order_id", cancelled.order_id)
      .eq("status", "success")
      .maybeSingle();
    const payment = data as { id: string; razorpay_payment_id: string | null; amount_paise: number } | null;

    // Single-flight (migration 0011): the hourly sweep refunds cancelled boosts
    // too, so without a claim both could call Razorpay for the same payment.
    // Losing the claim means the sweep already has it — report pending, don't
    // refund again.
    if (payment && !(await claimBoostRefund(params.id))) {
      return ok({ cancelled: true, refund: "5–7 days", refundPending: true });
    }

    if (payment) {
      // The boost is ALREADY cancelled at this point. If the refund call throws
      // here and we let it 500, the user has lost the boost and the money with
      // no retry anywhere — so a failure must not escape. Releasing the claim
      // hands it to the hourly reconciler, and the user is told the refund is
      // pending rather than shown a dead error.
      try {
        let refundId = `rfnd_dev_${payment.id.replace(/-/g, "").slice(0, 12)}`;
        if (isConfigured() && payment.razorpay_payment_id) {
          const r = await refundPayment(payment.razorpay_payment_id, payment.amount_paise, {
            reason: "boost cancelled before approval",
            boostId: params.id,
          });
          refundId = r.id;
        }
        await refundAndRevoke({
          paymentId: payment.id,
          orderId: cancelled.order_id,
          refundId,
          reason: "Boost cancelled before approval",
        });
        await db.from("boosts").update({ refunded_at: new Date().toISOString() }).eq("id", params.id);
      } catch {
        await releaseBoostRefundClaim(params.id);
        return ok({ cancelled: true, refund: "5–7 days", refundPending: true });
      }
    }
  }

  return ok({ cancelled: true, refund: "5–7 days" });
}
