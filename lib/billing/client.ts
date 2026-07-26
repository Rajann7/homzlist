"use client";

/**
 * Client-side billing API helpers.
 *
 * Note what is NOT here: no prices, no quotas, no entitlement logic. This file
 * only asks the server questions and renders answers. Every amount shown comes
 * back from `/api/v1/billing/*`, and nothing about plan state is cached in
 * localStorage (CLAUDE.md backend lock §1/§3).
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    // Offline / network drop — the screens render their offline state on this.
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

// ---- shapes the screens render --------------------------------------------

export interface PlanCard {
  code: string;
  kind: "plan" | "topup" | "boost";
  name: string;
  price: string;
  pricePaise: number;
  subLabel: string | null;
  features: string[];
  lifetime: boolean;
}

export interface UsageBar {
  label: string;
  value: string;
  pct: number;
  helper: string | null;
  topUp?: boolean;
}

export interface MyPlan {
  state: "none" | "active" | "grace" | "expired" | "trial";
  cards: { id: string; name: string; isTrial: boolean; meta: string; canRenew: boolean; bars: UsageBar[] }[];
  pooled: { activePlans: number; proposalsLeft: number; unlimitedProposals: boolean; listingSlotsLeft: number };
  trace: { title: string; lines: string[] }[];
  /** Persisted preference from `notification_prefs`, not a client default. */
  expiryReminders: boolean;
  trial: { name: string; summary: string; note: string } | null;
  grace: { title: string; hoursLeft: number } | null;
  expiredCard: { name: string; meta: string } | null;
}

export interface PaymentRow {
  id: string;
  title: string;
  amount: string;
  status: "success" | "pending" | "failed" | "refunded" | "chargeback";
  statusLabel: string;
  when: string;
  method: string | null;
  failureReason: string | null;
  refundReason: string | null;
  refundedOn: string | null;
  invoiceId: string | null;
  orderId: string;
  catalogCode: string | null;
}

export interface QuoteView {
  planName: string;
  planSub: string | null;
  features: string[];
  rows: { k: string; v: string; kind: "line" | "discount" | "total" }[];
  totalLabel: string;
  totalPaise: number;
  couponCode: string | null;
  /** Set when a supplied code was rejected — the quote falls back to no discount. */
  couponError?: string | null;
}

export interface CheckoutSession {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  simulated: boolean;
  quote?: QuoteView;
  duplicateWarning: { minutes: number } | null;
  replayed?: boolean;
}

export interface BoostView {
  id: string;
  listingId: string;
  /** what `listingId` points at — a boost can be on a listing, project or requirement */
  subjectKind: "listing" | "project" | "requirement";
  subjectNoun: string;
  listingTitle: string;
  listingPrice: string;
  status: string;
  badge: { kind: string; label: string };
  durationLabel: string;
  targetLabel: string;
  price: string;
  startedOn: string | null;
  endsOn: string | null;
  daysLeft: number | null;
  progressPct: number;
  rejectReason: string | null;
  stoppedReason: string | null;
  refundedOn: string | null;
  paidAgo: string;
  paidAt: string;
}

export interface CheckoutIntent {
  planId: string;
  listingId?: string;
  /** Boost subject kind (Doc2 §13). Defaults to "listing" server-side. */
  subjectKind?: "listing" | "project" | "requirement";
  targeting?: string;
  /**
   * Display only. The server resolves the real label from the subject's location
   * and ignores this — a client-supplied label used to be stored verbatim.
   */
  targetLabel?: string;
  couponCode?: string | null;
  gstin?: string | null;
  /** Replay-safe: the same key returns the same order instead of a 2nd charge. */
  idempotencyKey?: string;
}

export const billingApi = {
  plans: () =>
    req<{
      role: string | null;
      recommended: string;
      plans: PlanCard[];
      addOns: PlanCard[];
      activePlan: { name: string; isTrial: boolean } | null;
      trial: { summary: string } | null;
    }>("/billing/plans", "GET"),

  myPlan: () => req<MyPlan>("/billing/my-plan", "GET"),

  /** Persist the expiry-reminder preference; resolves to what is now STORED. */
  setExpiryReminders: (on: boolean) =>
    req<{ expiryReminders: boolean }>("/profile/notification-prefs", "PATCH", { expiryReminders: on }),

  payments: (params: { status?: string; range?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return req<{ items: PaymentRow[]; summary: { totalSpent: string; transactions: number } }>(
      `/billing/payments${qs ? `?${qs}` : ""}`,
      "GET",
    );
  },
  paymentDetail: (id: string) => req<{ payment: Record<string, string | null> }>(`/billing/payments/${id}`, "GET"),
  invoice: (id: string) => req<{ invoice: any }>(`/billing/invoice/${id}`, "GET"),
  emailInvoice: (id: string) => req<{ queued: boolean }>(`/billing/invoice/${id}/email`, "POST", {}),

  validateCoupon: (code: string, planId: string) =>
    req<{ valid: boolean; message?: string; code?: string; discount?: string; label?: string; total?: string }>(
      "/billing/coupon/validate",
      "POST",
      { code, planId },
    ),

  /** Price the checkout screen without creating an order (same maths as checkout). */
  quote: (planId: string, couponCode?: string | null) =>
    req<{ quote: QuoteView }>("/billing/quote", "POST", { planId, couponCode: couponCode ?? null }),

  checkout: (intent: CheckoutIntent) => req<CheckoutSession>("/billing/checkout", "POST", intent),

  /** Never trusted on its own — the server re-reads Razorpay before activating. */
  verify: (payload: { orderId: string; razorpayPaymentId?: string; razorpaySignature?: string; simulate?: string }) =>
    req<{ status: "success" | "pending" | "failed"; orderId?: string; invoiceNumber?: string; reason?: string }>(
      "/billing/verify",
      "POST",
      payload,
    ),

  topup: () =>
    req<{
      addOn: PlanCard | null;
      balance: number;
      balancePct: number;
      hasActivePlan: boolean;
      expiryNote: string;
    }>("/billing/topup", "GET"),

  boostEligible: () =>
    req<{
      listings: {
        id: string; subjectKind: "listing" | "project" | "requirement";
        title: string; areaLabel: string | null; price: string;
        coverUrl: string | null; eligible: boolean; lockLabel: string | null;
      }[];
      durations: { code: string; label: string; price: string; pricePaise: number; perDay: string; bestValue: boolean }[];
      targets: { key: string; reach: string }[];
      /** "<kind>:<id>" → { area|city|state|india → the real place name } */
      targetLabels: Record<string, Record<string, string>>;
    }>("/billing/boost/eligible", "GET"),

  boostStatus: () =>
    req<{
      active: BoostView[];
      pending: BoostView[];
      past: BoostView[];
      counts: { active: number; pending: number; past: number };
      renewPrompt: { boostId: string; price: string; durationLabel: string; targetLabel: string } | null;
    }>("/billing/boost/status", "GET"),

  cancelBoost: (id: string) => req<{ cancelled: boolean; refund: string }>(`/billing/boost/${id}/cancel`, "POST", {}),
  renewBoost: (id: string) => req<{ checkout: CheckoutIntent }>(`/billing/boost/${id}/renew`, "POST", {}),
};

/** Fresh idempotency key per user-initiated pay attempt (Doc7 §0). */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}
