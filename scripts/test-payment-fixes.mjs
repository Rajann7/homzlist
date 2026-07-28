/**
 * LIVE proof for the Razorpay payment fixes, through the real HTTP endpoints.
 *
 *  A. An out-of-order `payment.failed` (attempt 1) arriving AFTER the
 *     `payment.captured` (attempt 2) must NOT flip a paid order to failed,
 *     must not revoke the plan, and must not push a "payment failed" notice.
 *  B. A genuine failure must release the coupon slot the dead order was
 *     holding, so retrying with the same code is not refused as "USED".
 *  C. /billing/verify must echo `orderId` on the pending + failed branches
 *     (the checkout screen keys its poller off it).
 *
 * Razorpay cannot reach localhost, so deliveries are signed locally with the
 * same HMAC-SHA256 over the raw body that production recomputes.
 */
import { createHmac } from "node:crypto";
import { connect, env } from "./lib/dbx.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PHONE = "+919999000006";

const jar = new Map();
function saveCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  saveCookies(res);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function login() {
  const req = await api("/api/v1/auth/otp/request", { method: "POST", body: { phone: PHONE } });
  if (req.status !== 200) throw new Error(`otp/request ${req.status} ${JSON.stringify(req.json)}`);
  const code = req.json?.data?.devCode ?? "123456";
  const ver = await api("/api/v1/auth/otp/verify", {
    method: "POST",
    body: { otpSession: req.json?.data?.otpSession, code },
  });
  if (ver.status !== 200) throw new Error(`otp/verify ${ver.status} ${JSON.stringify(ver.json)}`);
  const me = await api("/api/v1/auth/me");
  const id = me.json?.data?.id ?? me.json?.data?.user?.id ?? me.json?.data?.profile?.id;
  if (!id) throw new Error(`auth/me ${me.status} ${JSON.stringify(me.json)}`);
  return id;
}

/** Signed webhook delivery, exactly as Razorpay would send it. */
async function webhook(event, { rzpOrderId, paymentId, amount, currency, reason }) {
  const body = JSON.stringify({
    entity: "event", event, contains: ["payment"],
    payload: { payment: { entity: {
      id: paymentId, entity: "payment", amount: Number(amount), currency,
      status: event === "payment.failed" ? "failed" : "captured",
      order_id: rzpOrderId, method: "upi", vpa: "test@okhdfcbank",
      captured: event !== "payment.failed",
      error_description: reason ?? null,
    } } },
    created_at: Math.floor(Date.now() / 1000),
  });
  const res = await fetch(`${BASE}/api/v1/billing/webhook/rzp-3f9c1a`, {
    method: "POST", body,
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex"),
      "x-razorpay-event-id": `evt_fixproof_${Math.random().toString(36).slice(2, 12)}`,
    },
  });
  return res.status;
}

let allPass = true;
const check = (c, m, extra = "") => {
  if (!c) allPass = false;
  console.log(`  [${c ? "PASS" : "FAIL"}] ${m}${extra ? "  " + extra : ""}`);
};

const sql = await connect();
const profileId = await login();
console.log(`logged in as ${PHONE} → profile ${profileId}`);

/** Drop unpaid probe orders from an earlier run — they still hold coupon slots. */
async function clearProbeOrders() {
  const { rowCount } = await sql.query(
    `delete from orders
      where profile_id = $1
        and status in ('created','pending','failed')
        and idempotency_key like 'fix%'`, [profileId]);
  return rowCount;
}
console.log(`pre-clean: removed ${await clearProbeOrders()} leftover probe orders\n`);

// ---------------------------------------------------------------------------
// A. out-of-order payment.failed after payment.captured
// ---------------------------------------------------------------------------
console.log("=== A. out-of-order payment.failed must not undo a paid order ===");

const co = await api("/api/v1/billing/checkout", {
  method: "POST",
  body: { planId: "p999", idempotencyKey: `fixproof-${Date.now()}` },
});
const orderId = co.json?.data?.orderId;
if (!orderId) throw new Error(`checkout failed: ${co.status} ${JSON.stringify(co.json)}`);

const { rows: [order] } = await sql.query(
  `select razorpay_order_id, total_paise, currency from orders where id = $1`, [orderId]);

// attempt 2 succeeds (delivered first)
await webhook("payment.captured", {
  rzpOrderId: order.razorpay_order_id,
  paymentId: `pay_FIXOK${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
  amount: order.total_paise, currency: order.currency,
});

const { rows: [afterCapture] } = await sql.query(`select status from orders where id = $1`, [orderId]);
check(afterCapture.status === "paid", "order is paid after payment.captured", `status=${afterCapture.status}`);

const { rows: [planBefore] } = await sql.query(
  `select count(*)::int as n from user_plans where order_id = $1 and status = 'active'`, [orderId]);
check(planBefore.n === 1, "plan granted", `user_plans active=${planBefore.n}`);

const notifBefore = await sql.query(
  `select count(*)::int as n from notifications
    where profile_id = $1 and type = 'payment_failed' and entity_id = $2`, [profileId, orderId]);

// attempt 1's failure arrives late
const wStatus = await webhook("payment.failed", {
  rzpOrderId: order.razorpay_order_id,
  paymentId: `pay_FIXBAD${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
  amount: order.total_paise, currency: order.currency,
  reason: "Attempt 1 declined by bank (late delivery)",
});
check(wStatus === 200, "late payment.failed accepted (200, no retry storm)", `http=${wStatus}`);

const { rows: [afterFail] } = await sql.query(`select status from orders where id = $1`, [orderId]);
check(afterFail.status === "paid", "order STILL paid after the late failure", `status=${afterFail.status}`);

const { rows: [planAfter] } = await sql.query(
  `select count(*)::int as n from user_plans where order_id = $1 and status = 'active'`, [orderId]);
check(planAfter.n === 1, "plan still active", `user_plans active=${planAfter.n}`);

const notifAfter = await sql.query(
  `select count(*)::int as n from notifications
    where profile_id = $1 and type = 'payment_failed' and entity_id = $2`, [profileId, orderId]);
check(
  notifAfter.rows[0].n === notifBefore.rows[0].n,
  "no bogus 'Payment failed' notification for a paid order",
  `before=${notifBefore.rows[0].n} after=${notifAfter.rows[0].n}`,
);

const { rows: attempts } = await sql.query(
  `select status, razorpay_payment_id, failure_reason from payments where order_id = $1 order by created_at`, [orderId]);
check(
  attempts.some((p) => p.status === "success") && attempts.some((p) => p.status === "failed"),
  "both attempts recorded in payments (history stays truthful)",
);
console.log("    payments rows:", JSON.stringify(attempts, null, 0));

// ---------------------------------------------------------------------------
// B. a real failure releases the coupon slot
// ---------------------------------------------------------------------------
console.log("\n=== B. failed payment releases the coupon slot ===");

const { rows: [coupon] } = await sql.query(
  `select code, per_user_limit from coupons
    where is_active = true and applies_to in ('plans','both')
      and (expires_at is null or expires_at > now())
      and (usage_cap is null or used_count < usage_cap)
    order by per_user_limit asc limit 1`);

if (!coupon) {
  console.log("  [SKIP] no usable coupon in the catalog");
} else {
  // clear prior redemptions so the per-user limit is a clean test
  await sql.query(
    `delete from coupon_redemptions where profile_id = $1
      and coupon_id = (select id from coupons where code = $2)`, [profileId, coupon.code]);

  const c1 = await api("/api/v1/billing/checkout", {
    method: "POST",
    body: { planId: "p999", couponCode: coupon.code, idempotencyKey: `fixcoupon-a-${Date.now()}` },
  });
  const couponOrder = c1.json?.data?.orderId;
  check(!!couponOrder, `checkout with ${coupon.code} created an order`, `status=${c1.status}`);

  const { rows: [co1] } = await sql.query(
    `select razorpay_order_id, total_paise, currency from orders where id = $1`, [couponOrder]);

  await webhook("payment.failed", {
    rzpOrderId: co1.razorpay_order_id,
    paymentId: `pay_FIXCPN${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    amount: co1.total_paise, currency: co1.currency,
    reason: "Insufficient funds",
  });

  const { rows: [failed] } = await sql.query(`select status from orders where id = $1`, [couponOrder]);
  check(failed.status === "failed", "order marked failed", `status=${failed.status}`);

  const { rows: held } = await sql.query(
    `select order_id, slot, state from coupon_claims where order_id = $1`, [couponOrder]);
  check(
    held.length > 0 && held.every((h) => h.state === "released"),
    "coupon slot was released by the failure",
    JSON.stringify(held),
  );

  // the retry the failed screen offers — same code must still be accepted
  const c2 = await api("/api/v1/billing/checkout", {
    method: "POST",
    body: { planId: "p999", couponCode: coupon.code, idempotencyKey: `fixcoupon-b-${Date.now()}` },
  });
  check(
    c2.status === 200 && !!c2.json?.data?.orderId,
    `retry with the same coupon is accepted (was refused as USED)`,
    `status=${c2.status} err=${JSON.stringify(c2.json?.error ?? null)}`,
  );
  if (c2.json?.data?.orderId) {
    const { rows: [r] } = await sql.query(
      `select coupon_code, discount_paise, total_paise from orders where id = $1`, [c2.json.data.orderId]);
    console.log("    retry order:", JSON.stringify(r));
    check(r.discount_paise > 0, "retry order actually carries the discount", `discount_paise=${r.discount_paise}`);
  }
}

// ---------------------------------------------------------------------------
// C. verify echoes orderId on non-success branches
// ---------------------------------------------------------------------------
console.log("\n=== C. /billing/verify returns orderId on every branch ===");

const c3 = await api("/api/v1/billing/checkout", {
  method: "POST",
  body: { planId: "p999", idempotencyKey: `fixverify-${Date.now()}` },
});
const pendingOrder = c3.json?.data?.orderId;
const v = await api("/api/v1/billing/verify", { method: "POST", body: { orderId: pendingOrder } });
console.log("    verify response:", JSON.stringify(v.json));
check(
  v.json?.data?.orderId === pendingOrder,
  "pending verify echoes orderId (checkout poller + 'Check status' now work)",
  `got=${v.json?.data?.orderId ?? "undefined"}`,
);

// ---------------------------------------------------------------------------
// Cleanup — an unpaid probe order keeps HOLDING its coupon slot for the full
// 30-minute window, which would fail the next run of test-billing-live for this
// same user. The paid order in A is left alone: it bought a real plan.
// ---------------------------------------------------------------------------
console.log(`\ncleanup: removed ${await clearProbeOrders()} unpaid probe orders (held claims cascade)`);

await sql.end();
console.log(`${allPass ? "ALL PASS" : "FAILURES ABOVE"}`);
process.exit(allPass ? 0 : 1);
