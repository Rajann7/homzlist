"use client";

import { billingApi, type CheckoutIntent } from "@/lib/billing/client";

/**
 * The single client-side payment driver. Every "Pay" button in the app goes
 * through here so the sequence can never be skipped:
 *
 *   1. POST /billing/checkout  → the SERVER computes the amount and creates the
 *      Razorpay order. The browser never names a price.
 *   2. Razorpay Checkout.js collects the payment (card data never touches us —
 *      Doc9 §12 PCI).
 *   3. POST /billing/verify    → the SERVER re-reads the payment from Razorpay
 *      and only then activates. The handler's payload here is a hint, not proof.
 *
 * Nothing is granted client-side at any step: if the network dies after step 2,
 * the webhook still activates the order (Doc7 §30).
 */

export type PayStatus = "success" | "pending" | "failed" | "cancelled";

export interface PayResult {
  status: PayStatus;
  orderId?: string;
  invoiceNumber?: string;
  reason?: string;
  /** Server flagged a same-plan payment inside the double-pay window. */
  duplicateWarning?: { minutes: number } | null;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void };
  }
}

let scriptPromise: Promise<boolean> | null = null;

function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Our method keys → the ids Razorpay Checkout understands for `prefill.method`. */
const RZP_METHOD: Record<string, string> = {
  upi: "upi",
  card: "card",
  net: "netbanking",
  netbanking: "netbanking",
  wallet: "wallet",
};

export async function payWithRazorpay({
  intent,
  prefill,
  method,
  onFailure,
  /** Dev-only simulation branch when Razorpay keys aren't configured. */
  simulate,
}: {
  intent: CheckoutIntent;
  prefill?: { name?: string; contact?: string; email?: string };
  /**
   * The method the user picked on our own checkout screen. Passed to Razorpay so
   * the sheet opens on that tab — without it the radio group was decorative and
   * picking "UPI" still landed the user on Cards. Preselects only: every other
   * method stays available inside the sheet.
   */
  method?: string;
  onFailure?: (message: string) => void;
  simulate?: "success" | "pending" | "failed";
}): Promise<PayResult> {
  // ---- 1. Server-priced order ---------------------------------------------
  const created = await billingApi.checkout(intent);
  if (!created.ok) {
    const code = created.error.code;
    onFailure?.(
      code === "OFFLINE" ? "You're offline — try again when you're back"
      : code === "RATE_LIMITED" ? "Too many attempts. Please wait a moment."
      : code === "FORBIDDEN" ? "This plan isn't available for your role"
      : code === "LISTING_STATE_LOCKED" ? "That listing can't be boosted right now"
      : "Couldn't start checkout. Please try again.",
    );
    return { status: "failed", reason: code };
  }

  const session = created.data;

  // ---- Dev path: no keys configured → verify with a simulated outcome ------
  // Every early return from here on carries the order id: the caller needs it to
  // poll a pending order and to offer "Check status" after a failure.
  if (session.simulated || !session.keyId) {
    const res = await billingApi.verify({ orderId: session.orderId, simulate: simulate ?? "success" });
    if (!res.ok) return { status: "failed", orderId: session.orderId, reason: res.error.code };
    return { ...res.data, orderId: res.data.orderId ?? session.orderId, duplicateWarning: session.duplicateWarning };
  }

  // ---- 2. Hosted checkout --------------------------------------------------
  const loaded = await loadCheckoutScript();
  if (!loaded || !window.Razorpay) {
    onFailure?.("Couldn't reach the payment gateway. Check your connection.");
    return { status: "failed", orderId: session.orderId, reason: "SCRIPT_LOAD" };
  }

  // Razorpay fires `payment.failed` for EVERY declined attempt but keeps its own
  // sheet open with a "Retry payment with…" list, so one order can produce several
  // failures before it succeeds. Resolving on that event ended the flow at the
  // first decline: our screen jumped to "Payment failed — your money wasn't
  // deducted" while the sheet was still up, and when the user then paid
  // successfully in that same sheet the success callback resolved an
  // already-settled promise and was silently dropped. Proven live on 2026-07-28:
  // Razorpay captured pay_TIqDd2AvIZMP0I while the app showed "Payment failed".
  //
  // So: remember the reason, never resolve on it. The sheet closes itself on
  // success (→ `handler`) or when the user gives up (→ `ondismiss`), and only
  // then does the reason describe a real, final failure.
  let lastFailure: string | undefined;

  const handler = await new Promise<{ paymentId?: string; signature?: string; dismissed?: boolean; failed?: string }>((resolve) => {
    const rzp = new window.Razorpay!({
      key: session.keyId,
      order_id: session.razorpayOrderId,
      // Amount/currency are display-only here; Razorpay charges the ORDER's
      // amount, which only the server set.
      amount: session.amount,
      currency: session.currency,
      name: "HomzList",
      prefill: { ...prefill, ...(method && RZP_METHOD[method] ? { method: RZP_METHOD[method] } : {}) },
      theme: { color: "#0F9D58" },
      handler: (r: any) => resolve({ paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => resolve({ dismissed: true, failed: lastFailure }) },
    });
    rzp.on("payment.failed", (r: any) => { lastFailure = r?.error?.description ?? "Payment failed"; });
    rzp.open();
  });

  if (handler.dismissed) {
    // User closed the sheet. The order stays open; the webhook settles it if a
    // payment actually landed (UPI collect can complete after dismissal).
    const res = await billingApi.verify({ orderId: session.orderId });
    if (res.ok && res.data.status === "success") {
      return { ...res.data, orderId: res.data.orderId ?? session.orderId, duplicateWarning: session.duplicateWarning };
    }
    // Closed AFTER a decline they chose not to retry — that is a failure the
    // screen must name, not a silent trip back to the form.
    if (handler.failed) return { status: "failed", orderId: session.orderId, reason: handler.failed };
    // Still carries the order id: a dismissed UPI collect can land minutes later,
    // and the screen needs something to poll.
    return { status: "cancelled", orderId: session.orderId };
  }

  // ---- 3. Server-verified activation ---------------------------------------
  const res = await billingApi.verify({
    orderId: session.orderId,
    razorpayPaymentId: handler.paymentId,
    razorpaySignature: handler.signature,
  });

  if (!res.ok) {
    onFailure?.("We couldn't confirm that payment. If money was deducted it's refunded in 5–7 days.");
    return { status: "failed", orderId: session.orderId, reason: res.error.code };
  }
  return { ...res.data, orderId: res.data.orderId ?? session.orderId, duplicateWarning: session.duplicateWarning };
}

/** Poll a pending (UPI-collect) order until it settles — "safe to close" screen. */
export async function pollOrder(orderId: string): Promise<PayResult> {
  const res = await billingApi.verify({ orderId });
  if (!res.ok) return { status: "pending" };
  return res.data;
}
