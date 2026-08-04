/**
 * Local Razorpay webhook harness — DEV ONLY.
 *
 * Razorpay cannot reach localhost, so you cannot receive real deliveries while
 * developing. This sends a delivery shaped exactly like theirs, signed with the
 * same HMAC-SHA256 over the raw body, straight at your local endpoint — which
 * exercises the identical code path a production delivery would.
 *
 * Usage:
 *   npm run webhook:test                      # signs + delivers payment.captured
 *   npm run webhook:test -- --order <uuid>    # target a specific local order
 *   npm run webhook:test -- --event payment.failed
 *   npm run webhook:test -- --bad-signature   # prove a forged delivery is rejected
 *   npm run webhook:test -- --replay          # prove idempotency (same event twice)
 */
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connect as dbConnect } from "./lib/dbx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function env() {
  const e = {};
  for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
    if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return e;
}

const E = env();
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);

const BASE = arg("--base") ?? "http://localhost:3000";
const PATH = "/api/v1/billing/webhook/rzp-3f9c1a";
const EVENT = arg("--event") ?? "payment.captured";

if (!E.RAZORPAY_WEBHOOK_SECRET) {
  console.error("RAZORPAY_WEBHOOK_SECRET is empty in .env.local — the endpoint rejects everything by design.");
  process.exit(1);
}

async function db() {
  // The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const c = await dbConnect();
  return c;
}

/** Pick an unpaid order to act on, so the run actually proves activation. */
async function pickOrder(c, explicit) {
  if (explicit) {
    const r = await c.query("select id, razorpay_order_id, total_paise, currency, catalog_code, status from orders where id=$1", [explicit]);
    return r.rows[0];
  }
  const r = await c.query(
    "select id, razorpay_order_id, total_paise, currency, catalog_code, status from orders where status in ('created','pending') and razorpay_order_id is not null order by created_at desc limit 1",
  );
  return r.rows[0];
}

async function main() {
  const c = await db();
  const order = await pickOrder(c, arg("--order"));
  if (!order) {
    console.error("No unpaid order with a razorpay_order_id found. Start a checkout first, then re-run.");
    await c.end();
    process.exit(1);
  }

  console.log(`order      ${order.id}`);
  console.log(`rzp order  ${order.razorpay_order_id}`);
  console.log(`amount     ₹${(order.total_paise / 100).toFixed(2)}  (status: ${order.status})`);

  const paymentId = "pay_TEST" + Math.random().toString(36).slice(2, 12).toUpperCase();
  const eventId = "evt_TEST" + Math.random().toString(36).slice(2, 12);

  // Same envelope Razorpay sends (Doc7 §30).
  const body = JSON.stringify({
    entity: "event",
    event: EVENT,
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount: Number(order.total_paise),
          currency: order.currency ?? "INR",
          status: EVENT === "payment.failed" ? "failed" : "captured",
          order_id: order.razorpay_order_id,
          method: "upi",
          vpa: "test@okhdfcbank",
          captured: EVENT !== "payment.failed",
          error_description: EVENT === "payment.failed" ? "Payment declined by bank (simulated)" : null,
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  });

  // HMAC over the RAW body — exactly what the endpoint recomputes.
  const good = createHmac("sha256", E.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
  const signature = has("--bad-signature") ? "0".repeat(64) : good;

  const send = async (label, evtId) => {
    const res = await fetch(BASE + PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": evtId,
      },
      body,
    });
    const text = await res.text();
    console.log(`\n${label}: HTTP ${res.status}  ${text.slice(0, 120)}`);
    return res.status;
  };

  await send(has("--bad-signature") ? "forged delivery" : "delivery", eventId);
  if (has("--replay")) await send("replay (same event id)", eventId);

  // Show what actually changed, so the result isn't taken on trust.
  const after = await c.query(
    `select o.status,
            (select count(*)::int from payments p where p.order_id=o.id) payments,
            (select count(*)::int from user_plans u where u.order_id=o.id) plans,
            (select count(*)::int from invoices i where i.order_id=o.id) invoices
       from orders o where o.id=$1`,
    [order.id],
  );
  const a = after.rows[0];
  console.log(`\nafter: order=${a.status}  payments=${a.payments}  user_plans=${a.plans}  invoices=${a.invoices}`);
  console.log(
    has("--bad-signature")
      ? (a.status === order.status ? "PASS — forged delivery changed nothing" : "FAIL — forged delivery had an effect")
      : EVENT === "payment.failed"
        ? (a.status === "failed" ? "PASS — order marked failed" : `unexpected: ${a.status}`)
        : (a.status === "paid" && a.plans === 1 && a.invoices === 1
            ? "PASS — activated exactly once (plan + invoice created)"
            : `check: order=${a.status} plans=${a.plans} invoices=${a.invoices}`),
  );

  await c.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
