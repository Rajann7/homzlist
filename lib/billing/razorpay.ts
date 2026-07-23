import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Razorpay provider layer (Doc7 §3.29–31, Doc9 §12).
 *
 * Rules baked in here:
 *  - Keys live in env, SERVER ONLY (`serverEnv()` throws in the browser).
 *  - Webhook + checkout callbacks are HMAC-verified with a constant-time compare.
 *  - Nothing is ever activated on the client's word: `fetchPayment` re-reads the
 *    truth from Razorpay before the caller activates anything.
 *  - Every call is timeout-bounded (Doc9 §API10 — unsafe third-party consumption).
 *
 * In dev without keys, `isConfigured()` is false and the routes fall back to a
 * simulated order/payment so the whole flow stays clickable end-to-end. The
 * simulation NEVER runs when keys are present, and never in production.
 */

const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 10_000;

export function isConfigured(): boolean {
  const { razorpay } = serverEnv();
  return Boolean(razorpay.keyId && razorpay.keySecret);
}

/** Public key id for Razorpay Checkout.js — safe to send to the browser. */
export function publicKeyId(): string {
  return serverEnv().razorpay.keyId;
}

function authHeader(): string {
  const { razorpay } = serverEnv();
  return "Basic " + Buffer.from(`${razorpay.keyId}:${razorpay.keySecret}`).toString("base64");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const json = (await res.json()) as T & { error?: { description?: string } };
    if (!res.ok) throw new Error(`razorpay ${path} ${res.status}: ${json?.error?.description ?? "unknown"}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RzpPayment {
  id: string;
  order_id: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  amount: number;
  currency: string;
  method?: string;
  wallet?: string | null;
  bank?: string | null;
  vpa?: string | null;
  card_id?: string | null;
  error_description?: string | null;
  captured?: boolean;
}

/** Create an order for an amount the SERVER computed (never a client figure). */
export function createOrder(args: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RzpOrder> {
  return call<RzpOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amountPaise,
      currency: args.currency,
      receipt: args.receipt,
      notes: args.notes,
      payment_capture: 1,
    }),
  });
}

/** Re-read a payment from Razorpay — the only trusted source of "did it pay?". */
export function fetchPayment(paymentId: string): Promise<RzpPayment> {
  return call<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export function fetchOrderPayments(orderId: string): Promise<{ items: RzpPayment[] }> {
  return call<{ items: RzpPayment[] }>(`/orders/${encodeURIComponent(orderId)}/payments`);
}

/** Full refund (Doc2 §4.3 — refunds are full-only, never partial). */
export function refundPayment(paymentId: string, amountPaise: number, notes: Record<string, string>) {
  return call<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: JSON.stringify({ amount: amountPaise, speed: "normal", notes }),
  });
}

/** Constant-time hex/utf8 compare — avoids leaking the signature via timing. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Webhook signature (Doc9 §12). `body` MUST be the raw request text — parsing
 * and re-stringifying changes the bytes and the HMAC will never match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = serverEnv().razorpay.webhookSecret;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

/** Checkout handler signature: HMAC(order_id|payment_id) with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = serverEnv().razorpay.keySecret;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Human label for the invoice/history row ("UPI · GPay", "Card", …). */
export function methodLabel(p: Pick<RzpPayment, "method" | "wallet" | "bank" | "vpa">): string {
  switch (p.method) {
    case "upi":
      return p.vpa ? `UPI · ${p.vpa.split("@")[1] ?? "UPI"}` : "UPI";
    case "card":
      return "Card";
    case "netbanking":
      return p.bank ? `Net Banking · ${p.bank}` : "Net Banking";
    case "wallet":
      return p.wallet ? `Wallet · ${p.wallet}` : "Wallet";
    default:
      return p.method ?? "—";
  }
}
