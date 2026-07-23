/**
 * Buy plan quota the REAL way, shared by the seed and QA scripts.
 *
 * Razorpay cannot reach localhost, so the delivery is signed locally with the
 * same HMAC-SHA256 over the raw body that production recomputes — the endpoint
 * and every downstream effect (payment, user_plan, invoice, slot) are identical.
 * Nothing here writes entitlement rows behind the app's back: the plan wall is
 * satisfied by paying through it, never by bypassing it.
 */
import { createHmac } from "node:crypto";
import { env } from "./dbx.mjs";

/** The only catalog plan that grants a listing slot (Doc2 §4.2). */
export const SLOT_PLAN = "p999";

/**
 * @param base   origin of the running dev server
 * @param sql    connected pg client (to read the razorpay order id back)
 * @param post   async (path, initObj) => { status, json } authenticated as the buyer
 */
export async function buyPlan(base, sql, post, planId = SLOT_PLAN, tag = "qa") {
  const co = await post("/api/v1/billing/checkout", {
    method: "POST",
    body: JSON.stringify({
      planId,
      idempotencyKey: `${tag}-${planId}-${Date.now()}-${Math.random()}`,
    }),
  });
  const orderId = co.json?.data?.orderId;
  if (!orderId) throw new Error(`checkout ${planId}: ${co.status} ${JSON.stringify(co.json?.error)}`);

  const { rows: [order] } = await sql.query(
    `select razorpay_order_id, total_paise, currency from orders where id = $1`, [orderId],
  );
  if (!order?.razorpay_order_id) throw new Error(`order ${orderId} has no razorpay order id`);

  const body = JSON.stringify({
    entity: "event", event: "payment.captured", contains: ["payment"],
    payload: { payment: { entity: {
      id: "pay_" + tag.toUpperCase() + Math.random().toString(36).slice(2, 10).toUpperCase(),
      entity: "payment", amount: Number(order.total_paise), currency: order.currency ?? "INR",
      status: "captured", order_id: order.razorpay_order_id, method: "upi",
      vpa: "test@okhdfcbank", captured: true, error_description: null,
    } } },
    created_at: Math.floor(Date.now() / 1000),
  });
  const res = await fetch(`${base}/api/v1/billing/webhook/rzp-3f9c1a`, {
    method: "POST", body,
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex"),
      "x-razorpay-event-id": `evt_${tag}` + Math.random().toString(36).slice(2, 12),
    },
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
  return orderId;
}

/**
 * Ensure `profileId` has at least `want` of `kind` ("listing" | "requirement")
 * left across its active plans, buying whole plans until it does.
 *
 * Quota is a pooled sum over active plans (Doc2 §4.2), so this reads the pool
 * back from the database rather than assuming what one purchase granted.
 */
export async function ensureQuota(base, sql, post, profileId, kind, want = 1, tag = "qa") {
  const col = kind === "requirement" ? "requirement" : "listing";
  const remaining = async () => {
    const { rows: [r] } = await sql.query(
      `select coalesce(sum(
                 case when ${col}_quota < 0 then 1000000
                      else ${col}_quota - ${col}_used end), 0)::int as left
         from user_plans
        where profile_id = $1 and status = 'active'
          and (expires_at is null or expires_at > now())`, [profileId]);
    return r.left;
  };

  let guard = 0;
  while (await remaining() < want) {
    if (++guard > 10) throw new Error(`could not reach ${want} ${kind} quota for ${profileId}`);
    await buyPlan(base, sql, post, SLOT_PLAN, tag);
  }
  return remaining();
}
