import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { refundPayment, isConfigured } from "@/lib/billing/razorpay";
import { refundAndRevoke } from "@/lib/billing/service";
import { notify } from "@/lib/notifications/service";
import type { AdminIdentity } from "./guard";

/**
 * The PAYMENT panel (template 1447-1470).
 *
 * It lives in P4 rather than P5 because A11's Payments tab pushes it
 * (template 1345): §5 says a click must land on the surface the design opens,
 * and a row that opened nothing would be the dead end the gate exists to catch.
 * P5 builds A18's payments LIST on top of this same panel.
 *
 * Everything the panel prints is read, never assumed — the money breakdown
 * comes off the ORDER (which stored its own tax split at checkout), the webhook
 * lines off `webhook_events`, the reconciliation line off
 * `reconciliation_items`. Where a fact does not exist for this payment, the
 * panel says so rather than printing the design's fixture.
 */

const db = () => createServiceClient();

export type RefundResult =
  | { ok: true; label: string; summary: string; diff?: Record<string, unknown> }
  | { ok: false; reason: "not_found" | "bad_state" | "validation"; message?: string };

export async function paymentDetail(id: string) {
  const { data: payment } = await db()
    .from("payments")
    .select(
      "id, order_id, profile_id, razorpay_payment_id, status, method, method_detail, amount_paise, failure_reason, refund_id, refund_reason, refunded_at, captured_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!payment) return null;
  const p = payment as Record<string, unknown>;

  const [{ data: order }, { data: profile }, { data: invoice }, { data: chargeback }] =
    await Promise.all([
      db()
        .from("orders")
        .select(
          "id, kind, catalog_code, terms_snapshot, base_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, coupon_code, razorpay_order_id, status, idempotency_key, created_at",
        )
        .eq("id", p.order_id as string)
        .maybeSingle(),
      db()
        .from("profiles")
        .select("id, name, photo_url, role")
        .eq("id", p.profile_id as string)
        .maybeSingle(),
      db()
        .from("invoices")
        .select("id, number, issued_at, emailed_at")
        .eq("payment_id", id)
        .maybeSingle(),
      db()
        .from("chargebacks")
        .select("id, reason, status, raised_at, resolved_at, plan_suspended")
        .eq("payment_id", id)
        .maybeSingle(),
    ]);

  const o = (order ?? {}) as Record<string, unknown>;

  const [{ data: webhooks }, { data: recon }, { data: plan }] = await Promise.all([
    o.razorpay_order_id
      ? db()
          .from("webhook_events")
          .select("event_type, status, received_at, note")
          .ilike("payload", `%${o.razorpay_order_id as string}%`)
          .limit(5)
      : Promise.resolve({ data: [] }),
    db()
      .from("reconciliation_items")
      .select("state, platform_paise, gateway_paise, rechecked_at, note")
      .eq("payment_id", id)
      .order("rechecked_at", { ascending: false })
      .limit(1),
    db()
      .from("user_plans")
      .select(
        "id, name, status, listing_quota, listing_used, requirement_quota, requirement_used, proposal_quota, proposal_used",
      )
      .eq("order_id", p.order_id as string)
      .maybeSingle(),
  ]);

  // "This plan is partly consumed. Refunding will revoke the plan…" (template
  // 1458) is a CONDITION, not a caption: it is only true when something was
  // actually used, so the panel is told whether it is.
  const pl = plan as Record<string, number | string> | null;
  const consumed = pl
    ? Number(pl.listing_used ?? 0) + Number(pl.requirement_used ?? 0) + Number(pl.proposal_used ?? 0)
    : 0;

  const { data: consumptions } = pl
    ? await db()
        .from("plan_consumptions")
        .select("kind, qty, ref_type, ref_id, created_at, reverted_at")
        .eq("user_plan_id", pl.id as string)
        .order("created_at", { ascending: true })
    : { data: [] };

  return {
    payment: p,
    order: o,
    user: profile as Record<string, unknown> | null,
    invoice: (invoice as Record<string, unknown>) ?? null,
    chargeback: (chargeback as Record<string, unknown>) ?? null,
    webhooks: (webhooks ?? []) as Record<string, unknown>[],
    reconciliation: ((recon ?? []) as Record<string, unknown>[])[0] ?? null,
    plan: pl,
    planConsumed: consumed,
    consumptions: (consumptions ?? []) as Record<string, unknown>[],
    gatewayConfigured: isConfigured(),
  };
}

/**
 * template 1463 + the refund confirmation — FULL refunds only (Doc2 §4.3), and
 * a typed confirmation before the money moves.
 *
 * Step 2 of 2 is the dangerous half: if Razorpay accepts the refund and our own
 * revoke then fails, the user has their money AND their plan. So the gateway
 * call happens first and `refundAndRevoke` — which is the existing single path
 * the boost sweep already uses — records the refund and revokes the plan in one
 * place. A gateway that is not configured refuses outright rather than marking
 * a payment refunded that nobody refunded.
 */
export async function refundPaymentFully(
  id: string,
  me: AdminIdentity,
  reason: string,
): Promise<RefundResult> {
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };

  const { data } = await db()
    .from("payments")
    .select("id, order_id, profile_id, razorpay_payment_id, status, amount_paise")
    .eq("id", id)
    .maybeSingle();
  const p = data as {
    id: string;
    order_id: string;
    profile_id: string;
    razorpay_payment_id: string | null;
    status: string;
    amount_paise: number;
  } | null;
  if (!p) return { ok: false, reason: "not_found" };
  if (p.status !== "success")
    return { ok: false, reason: "bad_state", message: `A ${p.status} payment cannot be refunded` };

  let refundId = "";
  if (p.razorpay_payment_id) {
    if (!isConfigured())
      return {
        ok: false,
        reason: "bad_state",
        message: "Razorpay is not configured on this environment — refund it in the dashboard",
      };
    try {
      const r = await refundPayment(p.razorpay_payment_id, p.amount_paise, {
        reason: reason.trim().slice(0, 200),
        refundedBy: me.name,
      });
      refundId = r.id;
    } catch (e) {
      // Nothing has been written yet, so the payment stays exactly as it was.
      return {
        ok: false,
        reason: "bad_state",
        message: e instanceof Error ? e.message : "The gateway refused the refund",
      };
    }
  } else {
    // A payment with no gateway id was never charged through Razorpay (seeded
    // or manual). It can still be marked refunded, and the id says which.
    refundId = `manual:${me.id}`;
  }

  await refundAndRevoke({
    paymentId: p.id,
    orderId: p.order_id,
    refundId,
    reason: reason.trim().slice(0, 300),
  });

  await notify({
    profileId: p.profile_id,
    type: "refund_processed",
    title: `₹${Math.round(p.amount_paise / 100).toLocaleString("en-IN")} refunded`,
    body: "It reaches your account in 5–7 working days.",
    actorId: me.id,
  });

  return {
    ok: true,
    label: `₹${Math.round(p.amount_paise / 100).toLocaleString("en-IN")}`,
    summary: `Full refund issued · ${reason.trim()}`,
    diff: { refundId, amountPaise: p.amount_paise, reason: reason.trim() },
  };
}
