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

export async function payWithRazorpay({
  intent,
  prefill,
  onFailure,
  /** Dev-only simulation branch when Razorpay keys aren't configured. */
  simulate,
}: {
  intent: CheckoutIntent;
  prefill?: { name?: string; contact?: string; email?: string };
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
  if (session.simulated || !session.keyId) {
    const res = await billingApi.verify({ orderId: session.orderId, simulate: simulate ?? "success" });
    if (!res.ok) return { status: "failed", reason: res.error.code };
    return { ...res.data, duplicateWarning: session.duplicateWarning };
  }

  // ---- 2. Hosted checkout --------------------------------------------------
  const loaded = await loadCheckoutScript();
  if (!loaded || !window.Razorpay) {
    onFailure?.("Couldn't reach the payment gateway. Check your connection.");
    return { status: "failed", reason: "SCRIPT_LOAD" };
  }

  const handler = await new Promise<{ paymentId?: string; signature?: string; dismissed?: boolean; failed?: string }>((resolve) => {
    const rzp = new window.Razorpay!({
      key: session.keyId,
      order_id: session.razorpayOrderId,
      // Amount/currency are display-only here; Razorpay charges the ORDER's
      // amount, which only the server set.
      amount: session.amount,
      currency: session.currency,
      name: "HomzList",
      prefill,
      theme: { color: "#0F9D58" },
      handler: (r: any) => resolve({ paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => resolve({ dismissed: true }) },
    });
    rzp.on("payment.failed", (r: any) => resolve({ failed: r?.error?.description ?? "Payment failed" }));
    rzp.open();
  });

  if (handler.dismissed) {
    // User closed the sheet. The order stays open; the webhook settles it if a
    // payment actually landed (UPI collect can complete after dismissal).
    const res = await billingApi.verify({ orderId: session.orderId });
    if (res.ok && res.data.status === "success") return { ...res.data, duplicateWarning: session.duplicateWarning };
    return { status: "cancelled" };
  }

  // ---- 3. Server-verified activation ---------------------------------------
  const res = await billingApi.verify({
    orderId: session.orderId,
    razorpayPaymentId: handler.paymentId,
    razorpaySignature: handler.signature,
  });

  if (!res.ok) {
    onFailure?.("We couldn't confirm that payment. If money was deducted it's refunded in 5–7 days.");
    return { status: "failed", reason: res.error.code };
  }
  return { ...res.data, duplicateWarning: session.duplicateWarning };
}

/** Poll a pending (UPI-collect) order until it settles — "safe to close" screen. */
export async function pollOrder(orderId: string): Promise<PayResult> {
  const res = await billingApi.verify({ orderId });
  if (!res.ok) return { status: "pending" };
  return res.data;
}
