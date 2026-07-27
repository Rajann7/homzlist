import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { computeTax, formatShortRupees, type TaxBreakdown, COUPON_RE } from "./money";
import { formatPhone } from "@/lib/auth/phone";
import { isBoostSubjectEligible } from "./boost";
import { notify } from "@/lib/notifications/service";

/**
 * Billing persistence + business rules (Doc2 §4, Doc7 §3, Doc9 §11–12).
 *
 * Everything money- or entitlement-related is decided HERE, on the server:
 * prices, GST, coupon validity, quota draws, slot transitions, activation.
 * Callers must have already authorized the session; this layer then re-checks
 * ownership on every row it touches (Doc9 §API1 — IDOR is the #1 risk).
 */

export type Role = "owner" | "broker" | "builder";
export type BillingKind = "plan" | "topup" | "boost";

export interface CatalogRow {
  code: string;
  kind: BillingKind;
  name: string;
  sub_label: string | null;
  price_paise: number;
  period_days: number | null;
  roles: Role[];
  features: string[];
  listing_quota: number;
  requirement_quota: number;
  requirement_days: number | null;
  proposal_quota: number;
  proposals_expire_with_plan: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface UserPlanRow {
  id: string;
  profile_id: string;
  order_id: string | null;
  catalog_code: string;
  name: string;
  terms: CatalogRow;
  listing_quota: number;
  listing_used: number;
  requirement_quota: number;
  requirement_used: number;
  proposal_quota: number;
  proposal_used: number;
  purchased_at: string;
  starts_at: string;
  expires_at: string | null;
  status: "active" | "expired" | "revoked";
  is_trial: boolean;
}

export interface OrderRow {
  id: string;
  profile_id: string;
  kind: BillingKind;
  catalog_code: string;
  terms_snapshot: CatalogRow;
  base_paise: number;
  discount_paise: number;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  currency: string;
  coupon_id: string | null;
  coupon_code: string | null;
  gstin: string | null;
  place_of_supply: string;
  razorpay_order_id: string | null;
  status: "created" | "pending" | "paid" | "failed" | "expired" | "refunded";
  boost_request: {
    listingId: string;
    catalogCode: string;
    targeting: string;
    targetLabel: string;
    /** what `listingId` points at — listing (default), project or requirement */
    subjectKind?: "listing" | "project" | "requirement";
  } | null;
  created_at: string;
}

const db = () => createServiceClient();

/**
 * How long an unpaid order keeps holding its coupon. Long enough to finish a
 * UPI collect, short enough that an abandoned checkout doesn't burn the code.
 */
const ORDER_HOLD_MINUTES = 30;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

let settingsCache: { at: number; map: Record<string, unknown> } | null = null;

/** Admin-editable knobs (GST rate, grace window…). Cached 60s to spare the DB. */
export async function getSettings(): Promise<Record<string, any>> {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.map;
  const { data } = await db().from("billing_settings").select("key,value");
  const map: Record<string, unknown> = {};
  for (const row of (data ?? []) as { key: string; value: unknown }[]) map[row.key] = row.value;
  settingsCache = { at: Date.now(), map };
  return map;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** Role-filtered live catalog (Doc7 §27 — ₹9,999 is Builder-only, server-side). */
export async function getCatalog(role: Role | null, kind?: BillingKind): Promise<CatalogRow[]> {
  let q = db().from("plan_catalog").select("*").eq("is_active", true).order("sort_order");
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  const rows = (data ?? []) as CatalogRow[];
  // Filter in code (not SQL) so a null role degrades to "nothing role-specific".
  return rows.filter((r) => (role ? r.roles.includes(role) : r.roles.length === 3));
}

export async function getCatalogItem(code: string): Promise<CatalogRow | null> {
  const { data } = await db().from("plan_catalog").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  return (data as CatalogRow) ?? null;
}

// ---------------------------------------------------------------------------
// Coupons (Doc2 §4.3 — per-user limit, expiry, usage cap, min value, scope)
// ---------------------------------------------------------------------------

export type CouponError = "INVALID" | "EXPIRED" | "USED" | "MIN_VALUE" | "SCOPE";

export interface CouponResult {
  ok: boolean;
  error?: CouponError;
  couponId?: string;
  code?: string;
  discountPaise?: number;
}

/**
 * Validate a coupon for a specific user + amount + scope. Returns a generic
 * INVALID for unknown codes so the endpoint can't be used to enumerate coupons.
 */
export async function validateCoupon(
  profileId: string,
  rawCode: string,
  basePaise: number,
  scope: "plans" | "boosts",
): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase();
  if (!COUPON_RE.test(code)) return { ok: false, error: "INVALID" };

  // Exact match — codes are stored uppercase (CHECK constraint), so no `ilike`
  // and therefore no `%`/`_` wildcard enumeration (Doc9 §7).
  const { data } = await db().from("coupons").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  if (!data) return { ok: false, error: "INVALID" };

  const c = data as {
    id: string;
    code: string;
    discount_type: "flat" | "percent";
    discount_value: number;
    max_discount_paise: number | null;
    min_value_paise: number;
    applies_to: "plans" | "boosts" | "both";
    per_user_limit: number;
    usage_cap: number | null;
    used_count: number;
    expires_at: string | null;
  };

  if (c.expires_at && new Date(c.expires_at) < new Date()) return { ok: false, error: "EXPIRED" };
  if (c.usage_cap !== null && c.used_count >= c.usage_cap) return { ok: false, error: "USED" };
  if (c.applies_to !== "both" && c.applies_to !== scope) return { ok: false, error: "SCOPE" };
  if (basePaise < c.min_value_paise) return { ok: false, error: "MIN_VALUE" };

  // Per-user limit counts BOTH already-redeemed coupons and orders currently
  // holding it. Without the second half, a user could open N unpaid orders with
  // the same code and pay them all — the redemption row is only written on
  // activation (Doc9 §11 coupon abuse).
  const [{ count: redeemed }, { count: held }] = await Promise.all([
    db().from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", c.id).eq("profile_id", profileId),
    db()
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", c.id)
      .eq("profile_id", profileId)
      .in("status", ["created", "pending"])
      .gte("created_at", new Date(Date.now() - ORDER_HOLD_MINUTES * 60_000).toISOString()),
  ]);
  if ((redeemed ?? 0) + (held ?? 0) >= c.per_user_limit) return { ok: false, error: "USED" };

  const raw = c.discount_type === "flat" ? c.discount_value : Math.round((basePaise * c.discount_value) / 100);
  const capped = c.max_discount_paise ? Math.min(raw, c.max_discount_paise) : raw;
  return { ok: true, couponId: c.id, code: c.code.toUpperCase(), discountPaise: Math.min(capped, basePaise) };
}

// ---------------------------------------------------------------------------
// Pricing — the single place an amount is ever decided (Doc9 §12)
// ---------------------------------------------------------------------------

export interface QuoteInput {
  profileId: string;
  item: CatalogRow;
  couponCode?: string | null;
  gstin?: string | null;
  /** Buyer's state code; drives CGST+SGST vs IGST. Defaults to the home state. */
  stateCode?: string | null;
}

export interface Quote extends TaxBreakdown {
  item: CatalogRow;
  couponId: string | null;
  couponCode: string | null;
  couponError: CouponError | null;
  placeOfSupply: string;
  currency: "INR";
}

/** Compute the authoritative price. Client-sent amounts are never consulted. */
export async function quote(input: QuoteInput): Promise<Quote> {
  const settings = await getSettings();
  const gstRateBps = Number(settings.gst_rate_bps ?? 1800);
  const homeState = String(settings.home_state ?? "GJ");
  const placeOfSupply = (input.stateCode || homeState).toUpperCase();

  const base = input.item.price_paise;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let couponError: CouponError | null = null;
  let discount = 0;

  if (input.couponCode) {
    const scope = input.item.kind === "boost" ? "boosts" : "plans";
    const res = await validateCoupon(input.profileId, input.couponCode, base, scope);
    if (res.ok) {
      couponId = res.couponId!;
      couponCode = res.code!;
      discount = res.discountPaise!;
    } else {
      couponError = res.error!;
    }
  }

  const tax = computeTax(base, discount, { gstRateBps, intraState: placeOfSupply === homeState });
  return { ...tax, item: input.item, couponId, couponCode, couponError, placeOfSupply, currency: "INR" };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function createOrderRow(args: {
  profileId: string;
  quote: Quote;
  idempotencyKey?: string | null;
  boostRequest?: OrderRow["boost_request"];
}): Promise<OrderRow> {
  const q = args.quote;
  const { data, error } = await db()
    .from("orders")
    .insert({
      profile_id: args.profileId,
      kind: q.item.kind,
      catalog_code: q.item.code,
      terms_snapshot: q.item, // grandfathering (Doc2 §4.1)
      base_paise: q.basePaise,
      discount_paise: q.discountPaise,
      taxable_paise: q.taxablePaise,
      cgst_paise: q.cgstPaise,
      sgst_paise: q.sgstPaise,
      igst_paise: q.igstPaise,
      total_paise: q.totalPaise,
      currency: q.currency,
      coupon_id: q.couponId,
      coupon_code: q.couponCode,
      gstin: null,
      place_of_supply: q.placeOfSupply,
      idempotency_key: args.idempotencyKey ?? null,
      boost_request: args.boostRequest ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OrderRow;
}

/**
 * Atomically take one of this user's coupon slots for `orderId` (migration 0009).
 *
 * `validateCoupon` above is advisory only — it reads counts and returns, so two
 * concurrent checkouts can both pass it. This is the binding check: the unique
 * index on the live (coupon, profile, slot) triples and the row lock on the
 * coupon decide the per-user limit and the global usage cap inside one
 * transaction. A false here means the code is spent; the caller must not sell
 * the order at the discounted price.
 */
export async function claimCouponSlot(couponId: string, profileId: string, orderId: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_coupon_slot", {
    p_coupon: couponId,
    p_profile: profileId,
    p_order: orderId,
    p_hold_minutes: ORDER_HOLD_MINUTES,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Kill an unpaid order that can't proceed (and free anything it was holding).
 *
 * Scoped to the owner on purpose: without the profile filter this would be an
 * IDOR primitive — anyone who learned an order id could fail a stranger's live
 * order and release their coupon hold. Today's only caller passes an order it
 * just created, but the guarantee belongs in here, not in caller discipline.
 */
export async function abandonOrder(orderId: string, profileId: string): Promise<void> {
  const { data } = await db()
    .from("orders")
    .update({ status: "failed" })
    .eq("id", orderId)
    .eq("profile_id", profileId)
    .neq("status", "paid")
    .select("id");
  if (data?.length) await releaseCouponSlot(orderId);
}

/** Hand a held coupon slot back (abandoned or failed checkout). */
export async function releaseCouponSlot(orderId: string): Promise<void> {
  await db().rpc("release_coupon_claim", { p_order: orderId });
}

/** Ownership-checked order fetch — returns null (not 403) for someone else's. */
export async function getOrder(orderId: string, profileId: string): Promise<OrderRow | null> {
  const { data } = await db().from("orders").select("*").eq("id", orderId).eq("profile_id", profileId).maybeSingle();
  return (data as OrderRow) ?? null;
}

export async function getOrderByRazorpayId(rzpOrderId: string): Promise<OrderRow | null> {
  const { data } = await db().from("orders").select("*").eq("razorpay_order_id", rzpOrderId).maybeSingle();
  return (data as OrderRow) ?? null;
}

export async function findIdempotentOrder(profileId: string, key: string): Promise<OrderRow | null> {
  const { data } = await db()
    .from("orders")
    .select("*")
    .eq("profile_id", profileId)
    .eq("idempotency_key", key)
    .maybeSingle();
  return (data as OrderRow) ?? null;
}

export async function attachRazorpayOrder(orderId: string, rzpOrderId: string, gstin: string | null) {
  await db().from("orders").update({ razorpay_order_id: rzpOrderId, gstin, status: "pending" }).eq("id", orderId);
}

/**
 * Double-payment guard (Doc2 §4.3): same user + same item paid within the
 * window → the UI warns instead of charging again, and admin gets a refund case.
 */
export async function recentPaidOrder(profileId: string, code: string, minutes: number): Promise<OrderRow | null> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data } = await db()
    .from("orders")
    .select("*")
    .eq("profile_id", profileId)
    .eq("catalog_code", code)
    .in("status", ["paid", "pending"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as OrderRow) ?? null;
}

// ---------------------------------------------------------------------------
// Activation — the ONLY path that grants entitlements (webhook / verify)
// ---------------------------------------------------------------------------

export interface ActivationResult {
  activated: boolean;
  reason?: "already" | "amount_mismatch" | "not_captured" | "no_order" | "order_mismatch";
  userPlanId?: string;
  boostId?: string;
  invoiceNumber?: string;
}

/**
 * Activate a paid order. Idempotent: a webhook and the client `verify` callback
 * both land here and only the first one grants anything (Doc9 §12 race).
 *
 * `verified` MUST come from a server-side read of Razorpay (webhook payload or
 * fetchOrderPayments) — never from client-posted JSON.
 *
 * TODO(reconciliation cron, Doc7 §21.12): the order claim and the payment insert
 * are separate round-trips. A thrown error rolls the claim back, but a hard
 * process kill between the two would leave an order at `paid` with no payment
 * row and no grant. The hourly reconciliation sweep should re-open such orders
 * to `pending` so the next webhook/verify completes them.
 */
export async function activatePaidOrder(
  order: OrderRow,
  verified: {
    paymentId: string;
    /** The Razorpay order the payment actually belongs to. */
    razorpayOrderId: string;
    amountPaise: number;
    currency: string;
    status: string;
    method?: string;
    methodDetail?: string;
  },
): Promise<ActivationResult> {
  // 1a. BIND the payment to THIS order. Without this, any captured payment of a
  //     matching amount could be replayed against a different (or someone
  //     else's) order to mint an entitlement for free — matching amount and
  //     currency alone is not proof that this order was paid.
  if (!order.razorpay_order_id || verified.razorpayOrderId !== order.razorpay_order_id) {
    await recordWebhookMismatch(order.id, verified);
    return { activated: false, reason: "order_mismatch" };
  }

  // 1b. Server-verifies amount + currency + status BEFORE anything is granted.
  if (verified.status !== "captured") return { activated: false, reason: "not_captured" };
  if (verified.amountPaise !== order.total_paise || verified.currency !== order.currency) {
    await db().from("orders").update({ status: "failed" }).eq("id", order.id);
    await db().rpc("release_coupon_claim", { p_order: order.id });
    await recordWebhookMismatch(order.id, verified);
    return { activated: false, reason: "amount_mismatch" };
  }

  // 2. Claim the order FIRST with a conditional update. Only one caller can
  //    move it out of a non-paid state, so the webhook and the client `verify`
  //    racing each other produce exactly one activation (Doc9 §12 race).
  const { data: claimed } = await db()
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .neq("status", "paid")
    .select("id");
  if (!claimed?.length) return { activated: false, reason: "already" };

  // Idempotency belt-and-braces: the unique index on razorpay_payment_id makes
  // a duplicate delivery of the SAME payment a no-op too.
  const { error: payErr } = await db().from("payments").insert({
    order_id: order.id,
    profile_id: order.profile_id,
    razorpay_payment_id: verified.paymentId,
    status: "success",
    method: verified.method ?? null,
    method_detail: verified.methodDetail ?? null,
    amount_paise: verified.amountPaise,
    currency: verified.currency,
    captured_at: new Date().toISOString(),
  });
  if (payErr) {
    // 23505 = unique violation → this payment was already processed. Release the
    // claim we just took so the order reflects reality.
    if ((payErr as { code?: string }).code === "23505") {
      return { activated: false, reason: "already" };
    }
    await db().from("orders").update({ status: "pending" }).eq("id", order.id);
    throw payErr;
  }

  // 3. Redeem the coupon (one row per order — unique index blocks replay).
  if (order.coupon_id) {
    // unique(order_id) makes a replayed webhook a no-op rather than a 2nd redeem.
    const { error: redErr } = await db()
      .from("coupon_redemptions")
      .insert({ coupon_id: order.coupon_id, profile_id: order.profile_id, order_id: order.id });
    if (!redErr) await db().rpc("increment_coupon_use", { p_coupon: order.coupon_id });
    // Burn the slot this order has been holding since checkout (migration 0009),
    // so it can never be released back and re-used by a later order.
    await db().rpc("redeem_coupon_claim", { p_order: order.id });
  }

  const payment = await getPaymentByRazorpayId(verified.paymentId);
  const result: ActivationResult = { activated: true };

  // 4. Grant the entitlement for this order kind.
  if (order.kind === "plan" || order.kind === "topup") {
    result.userPlanId = await grantUserPlan(order);
  } else if (order.kind === "boost") {
    result.boostId = await activateBoostForOrder(order);
  }

  // 5. Invoice (GST line items — Doc2 §4.3).
  result.invoiceNumber = await issueInvoice(order, payment?.id ?? null);

  // 6. Tell them (Doc2 §14: "payment success"). designs/P11 S7:
  //    "Payment successful — <b>₹999 Listing Plan</b>" + View invoice.
  await notify({
    profileId: order.profile_id,
    type: "payment_success",
    title: `Payment successful — **${rupeeLabel(order.total_paise)} ${order.terms_snapshot?.name ?? "purchase"}**`,
    body: `Invoice ${result.invoiceNumber}. Tap to view or download it.`,
    entityKind: "order", entityId: order.id,
    data: { orderId: order.id, invoiceNumber: result.invoiceNumber },
  });
  return result;
}

async function recordWebhookMismatch(orderId: string, verified: unknown) {
  await db().from("webhook_events").insert({
    provider: "razorpay",
    event_id: `mismatch:${orderId}:${Date.now()}`,
    event_type: "amount.mismatch",
    payload: verified as Record<string, unknown>,
    status: "mismatch",
    note: "verified amount/currency did not match the server-computed order",
  });
}

/** Create the entitlement row from the order's SNAPSHOT (never live catalog). */
async function grantUserPlan(order: OrderRow): Promise<string> {
  const t = order.terms_snapshot;
  const now = new Date();
  const expires = t.period_days ? new Date(now.getTime() + t.period_days * 86_400_000) : null;

  const { data, error } = await db()
    .from("user_plans")
    .insert({
      profile_id: order.profile_id,
      order_id: order.id,
      catalog_code: t.code,
      name: t.name,
      terms: t,
      listing_quota: t.listing_quota,
      requirement_quota: t.requirement_quota,
      proposal_quota: t.proposal_quota,
      purchased_at: now.toISOString(),
      starts_at: now.toISOString(),
      expires_at: expires?.toISOString() ?? null,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;

  // A paid purchase ends any running trial (Doc2 §4.2).
  if (order.kind === "plan") {
    await db()
      .from("user_plans")
      .update({ status: "expired" })
      .eq("profile_id", order.profile_id)
      .eq("is_trial", true)
      .eq("status", "active");
  }
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

async function issueInvoice(order: OrderRow, paymentId: string | null): Promise<string> {
  const existing = await db().from("invoices").select("number").eq("order_id", order.id).maybeSingle();
  if (existing.data) return (existing.data as { number: string }).number;

  const { data: seq } = await db().rpc("nextval_invoice");
  const n = Number(seq ?? Date.now() % 100000);
  const number = `HL-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;

  const { data: profile } = await db().from("profiles").select("name,phone").eq("id", order.profile_id).single();
  const t = order.terms_snapshot;

  await db().from("invoices").insert({
    number,
    order_id: order.id,
    payment_id: paymentId,
    profile_id: order.profile_id,
    gstin: order.gstin,
    // The buyer's own tax invoice legitimately shows their full number.
    billed_to: {
      name: (profile as any)?.name ?? "—",
      phone: (profile as any)?.phone ? formatPhone((profile as any).phone) : "—",
    },
    line_items: [{ title: `${rupeeLabel(t.price_paise)} ${t.name}`, contents: t.features, amount_paise: order.base_paise }],
    totals: {
      base: order.base_paise,
      discount: order.discount_paise,
      taxable: order.taxable_paise,
      cgst: order.cgst_paise,
      sgst: order.sgst_paise,
      igst: order.igst_paise,
      total: order.total_paise,
      couponCode: order.coupon_code,
    },
  });
  return number;
}

function rupeeLabel(paise: number) {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

// ---------------------------------------------------------------------------
// Payments / history
// ---------------------------------------------------------------------------

export async function getPaymentByRazorpayId(rzpId: string) {
  const { data } = await db().from("payments").select("*").eq("razorpay_payment_id", rzpId).maybeSingle();
  return data as { id: string; order_id: string; profile_id: string; status: string; amount_paise: number } | null;
}

export async function recordFailedPayment(order: OrderRow, reason: string, rzpPaymentId?: string) {
  await db().from("payments").insert({
    order_id: order.id,
    profile_id: order.profile_id,
    razorpay_payment_id: rzpPaymentId ?? null,
    status: "failed",
    amount_paise: order.total_paise,
    currency: order.currency,
    failure_reason: reason,
  });
  await db().from("orders").update({ status: "failed" }).eq("id", order.id);

  // designs/P11 S7: "Payment failed — <b>₹499 top-up</b>" + a Retry button.
  // Retry re-opens the normal server-priced checkout; nothing here charges.
  await notify({
    profileId: order.profile_id,
    type: "payment_failed",
    title: `Payment failed — **${rupeeLabel(order.total_paise)} ${order.terms_snapshot?.name ?? "purchase"}**`,
    body: reason.slice(0, 160),
    entityKind: "order", entityId: order.id,
    data: { orderId: order.id, code: order.terms_snapshot?.code ?? null },
  });
}

export async function listPayments(
  profileId: string,
  filter: { status?: string; since?: string } = {},
) {
  let q = db()
    .from("payments")
    .select("*, orders!inner(catalog_code,terms_snapshot,total_paise,coupon_code,kind), invoices(number,id)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.since) q = q.gte("created_at", filter.since);
  const { data } = await q;
  return (data ?? []) as any[];
}

export async function getPayment(paymentId: string, profileId: string) {
  const { data } = await db()
    .from("payments")
    .select("*, orders!inner(*), invoices(number,id)")
    .eq("id", paymentId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return data as any | null;
}

export async function getInvoice(invoiceId: string, profileId: string) {
  const { data } = await db()
    .from("invoices")
    .select("*, payments(razorpay_payment_id,method,method_detail)")
    .eq("id", invoiceId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return data as any | null;
}

export async function markInvoiceEmailed(invoiceId: string) {
  await db().from("invoices").update({ emailed_at: new Date().toISOString() }).eq("id", invoiceId);
}

// ---------------------------------------------------------------------------
// My-plan aggregation (Doc7 §28 — everything computed server-side)
// ---------------------------------------------------------------------------

export async function getActivePlans(profileId: string): Promise<UserPlanRow[]> {
  const { data } = await db()
    .from("user_plans")
    .select("*")
    .eq("profile_id", profileId)
    .in("status", ["active", "expired"])
    .order("purchased_at", { ascending: true });
  return (data ?? []) as UserPlanRow[];
}

export async function getConsumptions(profileId: string) {
  const { data } = await db()
    .from("plan_consumptions")
    .select("*")
    .eq("profile_id", profileId)
    .is("reverted_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as {
    id: string;
    user_plan_id: string;
    kind: "listing" | "requirement" | "proposal";
    qty: number;
    ref_type: string | null;
    ref_id: string | null;
    note: string | null;
    created_at: string;
  }[];
}

/**
 * Roll expired plans over (also run hourly by the cron — Doc7 §21.6). Doing it
 * on read as well means the dashboard is never stale between cron ticks.
 */
export async function expirePlans(profileId?: string) {
  let q = db().from("user_plans").update({ status: "expired" }).eq("status", "active").lt("expires_at", new Date().toISOString());
  if (profileId) q = q.eq("profile_id", profileId);
  await q;
}

// ---------------------------------------------------------------------------
// Quota + slots (atomic, via the SQL functions in migration 0003)
// ---------------------------------------------------------------------------

/** Draw from the pooled balance, oldest plan first. Returns null when empty. */
export async function consumeQuota(
  profileId: string,
  kind: "listing" | "requirement" | "proposal",
  qty = 1,
  ref?: { type: string; id?: string; note?: string },
): Promise<string | null> {
  const { data, error } = await db().rpc("consume_quota", {
    p_profile: profileId,
    p_kind: kind,
    p_qty: qty,
    p_ref_type: ref?.type ?? null,
    p_ref_id: ref?.id ?? null,
    p_note: ref?.note ?? null,
  });
  if (error) throw error;
  return (data as string) ?? null;
}

/**
 * Undo a draw when the thing it paid for could not be created (migration 0024).
 *
 * FAILURE-ONLY. Doc2 §4.2 is explicit that ordinary withdrawal — deleting a
 * requirement, toggling one off — does NOT return quota, so this must never be
 * wired to those paths. It exists so a create that dies *after* `consumeQuota`
 * cannot leave the user charged for something that does not exist.
 *
 * Best-effort by design: it is called from a catch block, and masking the
 * original error with a secondary one would hide the real failure.
 */
export async function releaseQuota(
  profileId: string,
  userPlanId: string,
  kind: "listing" | "requirement" | "proposal",
  qty = 1,
  reason = "create failed",
): Promise<boolean> {
  const { data, error } = await db().rpc("release_quota", {
    p_profile: profileId,
    p_user_plan: userPlanId,
    p_kind: kind,
    p_qty: qty,
    p_reason: reason,
  });
  if (error) {
    console.error("[billing] release_quota failed — quota may be stranded", {
      profileId, userPlanId, kind, qty, error: error.message,
    });
    return false;
  }
  return data === true;
}

/** Reserve a listing slot on submit (state machine: reserved → …). */
export async function reserveSlot(profileId: string, userPlanId: string, orderId?: string) {
  const { data, error } = await db()
    .from("listing_slots")
    .insert({ profile_id: profileId, user_plan_id: userPlanId, order_id: orderId ?? null, state: "reserved" })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function transitionSlot(slotId: string, profileId: string, state: "released" | "consumed", reason?: string) {
  await db()
    .from("listing_slots")
    .update({ state, released_reason: state === "released" ? (reason ?? null) : null })
    .eq("id", slotId)
    .eq("profile_id", profileId);
}

// ---------------------------------------------------------------------------
// Refund (Doc2 §4.3 — technical failure / boost reject only; atomic revoke)
// ---------------------------------------------------------------------------

export async function refundAndRevoke(args: {
  paymentId: string;
  orderId: string;
  refundId: string;
  reason: string;
}) {
  await db()
    .from("payments")
    .update({ status: "refunded", refund_id: args.refundId, refund_reason: args.reason, refunded_at: new Date().toISOString() })
    .eq("id", args.paymentId);
  await db().from("orders").update({ status: "refunded" }).eq("id", args.orderId);
  // Money back and benefit gone in the same statement (Doc9 §12 refund integrity).
  const { data } = await db().rpc("revoke_plan_for_refund", { p_order: args.orderId, p_reason: args.reason });

  // designs/P11 S7: "<b>₹999 refunded</b> — it will reach your account in 5–7
  // days". The amount is read back from the payment row, not passed in.
  const { data: pay } = await db()
    .from("payments").select("profile_id,amount_paise").eq("id", args.paymentId).maybeSingle();
  const p = pay as { profile_id: string; amount_paise: number } | null;
  if (p) {
    await notify({
      profileId: p.profile_id,
      type: "refund_processed",
      title: `**${rupeeLabel(p.amount_paise)} refunded** — it will reach your account in 5–7 days`,
      body: args.reason.slice(0, 160),
      entityKind: "order", entityId: args.orderId,
      data: { orderId: args.orderId, paymentId: args.paymentId },
    });
  }
  return (data ?? []) as string[]; // listing ids to unpublish
}

// ---------------------------------------------------------------------------
// Boost (Doc2 §13)
// ---------------------------------------------------------------------------

export interface BoostRow {
  id: string;
  profile_id: string;
  /** the SUBJECT id — resolve it in the table named by `subject_kind` */
  listing_id: string;
  subject_kind: "listing" | "project" | "requirement";
  order_id: string | null;
  catalog_code: string;
  duration_days: number;
  targeting: "area" | "city" | "state" | "india";
  target_label: string;
  price_paise: number;
  status: "pending_payment" | "pending_approval" | "active" | "paused" | "expired" | "rejected" | "stopped" | "cancelled";
  starts_at: string | null;
  ends_at: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  stopped_reason: string | null;
  refunded_at: string | null;
  created_at: string;
}

export async function createBoost(args: {
  profileId: string;
  listingId: string;
  item: CatalogRow;
  targeting: BoostRow["targeting"];
  targetLabel: string;
  orderId: string;
  subjectKind?: "listing" | "project" | "requirement";
  /**
   * Resolved targeting geography (migration 0038). Placement matches these ids
   * against the viewer, so they are derived server-side from the SUBJECT — never
   * from anything the browser sent.
   */
  targetAreaId?: string | null;
  targetCityId?: string | null;
  targetStateId?: string | null;
}): Promise<string> {
  const { data, error } = await db()
    .from("boosts")
    .insert({
      profile_id: args.profileId,
      listing_id: args.listingId,
      subject_kind: args.subjectKind ?? "listing",
      order_id: args.orderId,
      catalog_code: args.item.code,
      duration_days: args.item.period_days ?? 7,
      targeting: args.targeting,
      target_label: args.targetLabel,
      target_area_id: args.targetAreaId ?? null,
      target_city_id: args.targetCityId ?? null,
      target_state_id: args.targetStateId ?? null,
      price_paise: args.item.price_paise,
      status: "pending_payment",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Payment landed → the boost joins the admin approval queue. Doc2 §13's "race
 * sealed": the webhook re-checks listing eligibility here; an ineligible
 * listing auto-refunds instead of silently going live.
 */
async function activateBoostForOrder(order: OrderRow): Promise<string | undefined> {
  const { data } = await db().from("boosts").select("id,listing_id,subject_kind").eq("order_id", order.id).maybeSingle();
  if (!data) return undefined;
  const boost = data as { id: string; listing_id: string; subject_kind: "listing" | "project" | "requirement" };

  // Subject-aware since Module 9: a project or requirement boost has to be
  // re-checked against ITS table, not against `listings` (where its id simply
  // isn't found — which used to reject every non-listing boost outright).
  const eligible = await isBoostSubjectEligible(order.profile_id, boost.subject_kind ?? "listing", boost.listing_id);
  if (!eligible) {
    const noun = boost.subject_kind === "requirement" ? "Requirement" : boost.subject_kind === "project" ? "Project" : "Listing";
    await db().from("boosts").update({ status: "rejected", reject_reason: `${noun} was not live at payment time` }).eq("id", boost.id);
    return boost.id; // the refund worker picks rejected+paid boosts up
  }
  await db().from("boosts").update({ status: "pending_approval" }).eq("id", boost.id);
  return boost.id;
}

/**
 * Eligibility = a LIVE, still-available listing owned by the caller (Doc2 §13 /
 * Doc9 §11 "boost a hidden/ineligible listing"). Checked at checkout and again
 * in the webhook, so a listing that stops being eligible mid-payment is caught.
 * Any error fails CLOSED.
 */
export async function isListingBoostEligible(profileId: string, listingId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("listings")
    .select("id,status,availability,deleted_at")
    .eq("id", listingId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) return false;
  const l = data as { status?: string; availability?: string; deleted_at?: string | null } | null;
  return !!l && l.status === "live" && l.availability === "available" && !l.deleted_at;
}

/**
 * The boost picker's list. Ineligible listings are returned too — the design
 * shows them dimmed with a lock label — but `eligible` is the server's verdict
 * and checkout re-checks it regardless.
 */
export async function listEligibleListings(profileId: string) {
  const { data, error } = await db()
    .from("listings")
    .select("id,title,price_paise,area_label,cover_url,status,availability")
    .eq("profile_id", profileId)
    .in("status", ["live", "pending_review", "hidden"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []) as any[];
}

/**
 * Title + price for a set of the CALLER'S OWN listings, keyed by id. Used to
 * label boost cards and the consumed-trace. The `profile_id` filter is what
 * stops an id from another account resolving to a real title (Doc9 §API1).
 */
export async function getListingLabels(
  profileId: string,
  listingIds: string[],
): Promise<Record<string, { title: string; price: string }>> {
  const ids = [...new Set(listingIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await db()
    .from("listings")
    .select("id,title,price_paise,price_on_request,area_label")
    .eq("profile_id", profileId)
    .in("id", ids);
  if (error) return {};
  const out: Record<string, { title: string; price: string }> = {};
  for (const l of (data ?? []) as any[]) {
    out[l.id] = {
      title: l.title ?? l.area_label ?? "Listing",
      price: l.price_on_request || l.price_paise === null ? "Price on request" : formatShortRupees(l.price_paise),
    };
  }
  return out;
}

export async function listBoosts(profileId: string): Promise<BoostRow[]> {
  const { data } = await db()
    .from("boosts")
    .select("*")
    .eq("profile_id", profileId)
    .neq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as BoostRow[];
}

export async function getBoost(boostId: string, profileId: string): Promise<BoostRow | null> {
  const { data } = await db().from("boosts").select("*").eq("id", boostId).eq("profile_id", profileId).maybeSingle();
  return (data as BoostRow) ?? null;
}

/**
 * Become the single refunder for this boost (migration 0011). Both the inline
 * cancel handler and the hourly sweep call this first — only the winner may
 * talk to Razorpay, so the same payment can't be refunded twice.
 */
export async function claimBoostRefund(boostId: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_boost_refund", { p_boost: boostId, p_stale_minutes: 15 });
  if (error) throw error;
  return data === true;
}

/** Give the claim back after a failed attempt so the next sweep retries it. */
export async function releaseBoostRefundClaim(boostId: string): Promise<void> {
  await db().rpc("release_boost_refund_claim", { p_boost: boostId });
}

export async function cancelPendingBoost(boostId: string, profileId: string) {
  // Only a boost still awaiting approval can be cancelled — an active one has
  // already delivered value (Doc2 §13: no refund for unused days).
  const { data } = await db()
    .from("boosts")
    .update({ status: "cancelled" })
    .eq("id", boostId)
    .eq("profile_id", profileId)
    .eq("status", "pending_approval")
    .select("id,order_id")
    .maybeSingle();
  return data as { id: string; order_id: string | null } | null;
}

// ---------------------------------------------------------------------------
// Expiry reminders (Doc2 §4.2) — the job behind the My Plan "Reminders" card
// ---------------------------------------------------------------------------

/** Days-before-expiry at which we notify. Mirrors the copy on the My Plan card. */
export const REMINDER_MILESTONES = [7, 1] as const;

export interface NotificationPrefs {
  expiryReminders: boolean;
}

/**
 * Read a user's real, persisted preferences. Every profile is backfilled with a
 * row in migration 0010, but fall back to the schema default rather than
 * throwing if one is somehow missing.
 */
export async function getNotificationPrefs(profileId: string): Promise<NotificationPrefs> {
  const { data } = await db()
    .from("notification_prefs")
    .select("expiry_reminders")
    .eq("profile_id", profileId)
    .maybeSingle();
  return { expiryReminders: (data as { expiry_reminders: boolean } | null)?.expiry_reminders ?? true };
}

/** Persist a preference change and echo back what is now stored. */
export async function setNotificationPrefs(
  profileId: string,
  patch: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const row: Record<string, unknown> = { profile_id: profileId, updated_at: new Date().toISOString() };
  if (patch.expiryReminders !== undefined) row.expiry_reminders = patch.expiryReminders;

  const { data, error } = await db()
    .from("notification_prefs")
    .upsert(row, { onConflict: "profile_id" })
    .select("expiry_reminders")
    .single();
  if (error) throw error;
  return { expiryReminders: (data as { expiry_reminders: boolean }).expiry_reminders };
}

/**
 * Send the due expiry reminders. Called hourly by the billing cron.
 *
 * Only plans that are active, have a real expiry, and belong to a user who has
 * NOT opted out are considered. `plan_reminders` has a unique (plan, milestone)
 * index, so a re-run inside the same window is a no-op rather than a second
 * notification — the insert is what claims the send.
 */
export async function sendExpiryReminders(): Promise<number> {
  const now = Date.now();
  let sent = 0;

  for (const milestone of REMINDER_MILESTONES) {
    // Plans whose expiry falls inside this milestone's window.
    const windowEnd = new Date(now + milestone * 86_400_000).toISOString();
    const { data: plans } = await db()
      .from("user_plans")
      .select("id, profile_id, name, expires_at, is_trial, terms")
      .eq("status", "active")
      .not("expires_at", "is", null)
      .gt("expires_at", new Date(now).toISOString())
      .lte("expires_at", windowEnd);

    for (const p of (plans ?? []) as { id: string; profile_id: string; name: string; expires_at: string; is_trial: boolean; terms: any }[]) {
      const prefs = await getNotificationPrefs(p.profile_id);
      if (!prefs.expiryReminders) continue;

      // The unique index decides — losing this insert means it already went out.
      const { error } = await db().from("plan_reminders").insert({
        user_plan_id: p.id,
        profile_id: p.profile_id,
        milestone,
        expires_at: p.expires_at,
      });
      if (error) continue;

      await deliverExpiryReminder(p, milestone);
      sent++;
    }
  }
  return sent;
}

/**
 * Hand the reminder to the notification engine (Module 10).
 *
 * This used to write a `webhook_events` trace row and stop — the My Plan screen
 * promised "we'll notify you 7 days and 1 day before expiry" and nothing ever
 * reached the user. Now it goes through `notify`, which writes the in-app row
 * (designs/P11 S7: "Your <b>₹2,999 plan</b> expires in 7 days" + Renew) and
 * fans out to push/email under the same prefs and quiet hours as everything
 * else. A TRIAL uses the trial copy and its own milestones (Doc2 §4.2).
 */
async function deliverExpiryReminder(
  plan: { id: string; profile_id: string; name: string; expires_at: string; is_trial: boolean; terms: any },
  milestone: number,
) {
  const price = plan.terms?.price_paise != null ? rupeeLabel(plan.terms.price_paise) : "";
  const days = `${milestone} day${milestone === 1 ? "" : "s"}`;
  await notify({
    profileId: plan.profile_id,
    type: plan.is_trial ? "trial_ending" : "plan_expiring",
    title: plan.is_trial
      ? `Your **free trial** ends in ${days}`
      : `Your **${[price, plan.name].filter(Boolean).join(" ")}** expires in ${days}`,
    body: plan.is_trial
      ? "Pick a plan to keep your listings live."
      : "Renew to keep your listings live — expired plans stop new posts.",
    entityKind: "user_plan", entityId: plan.id,
    data: { userPlanId: plan.id, milestone },
  });
}

/**
 * Expire boosts whose window has passed (Doc7 §21).
 *
 * Called on read (so the status screen is never stale) AND by the hourly cron,
 * which uses `expireBoostsAndNotify` in lib/billing/boost.ts instead — that one
 * also sends the Doc2 §14 "boost expiry" notice. This stays a silent sweep on
 * purpose: a page render must not fan out notifications.
 */
export async function expireBoosts() {
  await db().from("boosts").update({ status: "expired" }).eq("status", "active").lt("ends_at", new Date().toISOString());
}
