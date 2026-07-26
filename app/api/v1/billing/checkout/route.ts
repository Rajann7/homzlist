import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { GSTIN_RE } from "@/lib/billing/money";
import {
  getCatalogItem, quote, createOrderRow, findIdempotentOrder, attachRazorpayOrder,
  recentPaidOrder, getSettings, createBoost,
  claimCouponSlot, abandonOrder,
} from "@/lib/billing/service";
import {
  getBoostSubject, resolveTarget, SUBJECT_KINDS, TARGETINGS,
  type BoostSubject, type BoostSubjectKind, type BoostTargeting, type ResolvedTarget,
} from "@/lib/billing/boost";
import { quoteDTO } from "@/lib/billing/dto";
import { createOrder, isConfigured, publicKeyId } from "@/lib/billing/razorpay";

/**
 * POST /api/v1/billing/checkout (Doc7 §29) — create a Razorpay order.
 *
 * The client sends WHAT it wants (plan code, coupon, GSTIN), never HOW MUCH.
 * The amount + GST are computed here from the catalog and are the only figures
 * the order is ever created with (Doc9 §12 — tampering the amount is a no-op).
 */
export const dynamic = "force-dynamic";


export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");

  // Anti-abuse: order creation is cheap for us but noisy — cap it per user.
  const limited = await rateLimit(`checkout:${claims.sub}`, 20, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const code = typeof body.planId === "string" ? body.planId : null;
  if (!code) return fail("VALIDATION_ERROR", { field: "planId" });

  const item = await getCatalogItem(code);
  if (!item) return fail("NOT_FOUND");

  // Role gate — the ₹9,999 Builder plan is unbuyable by an Owner/Broker even if
  // they post the code directly (Doc9 §11 business-logic bypass).
  if (profile.role && !item.roles.includes(profile.role)) return fail("FORBIDDEN");

  // GSTIN is optional; when present it must be well-formed (goes on the invoice).
  let gstin: string | null = null;
  if (typeof body.gstin === "string" && body.gstin.trim()) {
    gstin = body.gstin.trim().toUpperCase();
    if (!GSTIN_RE.test(gstin)) return fail("VALIDATION_ERROR", { field: "gstin" });
  }

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 80) : null;
  if (idempotencyKey) {
    // Replay of the same client attempt → hand back the same order, don't charge twice.
    const existing = await findIdempotentOrder(claims.sub, idempotencyKey);
    if (existing?.razorpay_order_id) {
      return ok({
        orderId: existing.id,
        razorpayOrderId: existing.razorpay_order_id,
        amount: existing.total_paise,
        currency: existing.currency,
        keyId: isConfigured() ? publicKeyId() : null,
        simulated: !isConfigured(),
        replayed: true,
      });
    }
  }

  // Boost checkout carries its intent; eligibility is re-checked here AND again
  // in the webhook (Doc2 §13 "race sealed").
  //
  // Since Module 9 the subject can be a listing, a PROJECT or a REQUIREMENT
  // (Doc2 §13), and the targeting label + geography are resolved from that
  // subject's own location. The client's `targetLabel` is ignored entirely —
  // it used to be stored verbatim, so a crafted request could make the boost
  // status screen claim any reach it liked.
  let boostRequest: {
    listingId: string; catalogCode: string; targeting: string; targetLabel: string; subjectKind: BoostSubjectKind;
  } | null = null;
  let boostSubject: BoostSubject | null = null;
  let boostTarget: ResolvedTarget | null = null;

  if (item.kind === "boost") {
    const subjectId = typeof body.listingId === "string" ? body.listingId : null;
    const subjectKind = (typeof body.subjectKind === "string" ? body.subjectKind : "listing") as BoostSubjectKind;
    const targeting = (typeof body.targeting === "string" ? body.targeting : "area") as BoostTargeting;
    if (!subjectId) return fail("VALIDATION_ERROR", { field: "listingId" });
    if (!SUBJECT_KINDS.includes(subjectKind)) return fail("VALIDATION_ERROR", { field: "subjectKind" });
    if (!TARGETINGS.includes(targeting)) return fail("VALIDATION_ERROR", { field: "targeting" });

    // Ownership + eligibility in one read: a subject belonging to someone else
    // resolves to null, so this is also the IDOR gate (Doc9 §API1).
    boostSubject = await getBoostSubject(claims.sub, subjectKind, subjectId);
    if (!boostSubject || !boostSubject.eligible) return fail("LISTING_STATE_LOCKED");

    boostTarget = await resolveTarget(boostSubject, targeting);
    boostRequest = {
      listingId: subjectId,
      catalogCode: item.code,
      targeting,
      targetLabel: boostTarget.label,
      subjectKind,
    };
  }

  // Double-payment guard (Doc2 §4.3) — warn instead of silently charging again.
  const settings = await getSettings();
  const dupeWindow = Number(settings.double_pay_window_minutes ?? 10);
  const recent = await recentPaidOrder(claims.sub, code, dupeWindow);

  const q = await quote({
    profileId: claims.sub,
    item,
    couponCode: typeof body.couponCode === "string" ? body.couponCode : null,
    stateCode: null,
  });

  // An invalid coupon is surfaced, not silently dropped — the user must see why.
  if (q.couponError) return fail("VALIDATION_ERROR", { field: "coupon", couponError: q.couponError });

  const order = await createOrderRow({ profileId: claims.sub, quote: q, idempotencyKey, boostRequest });

  // The coupon check inside `quote` is advisory — it reads counts and returns, so
  // two concurrent checkouts can both clear it. THIS is the binding one: the DB
  // hands out a numbered per-user slot under a row lock (migration 0009). Losing
  // the race kills the order before Razorpay is ever contacted, so nobody is
  // charged at a discount they weren't entitled to (Doc9 §11 coupon abuse).
  if (q.couponId && !(await claimCouponSlot(q.couponId, claims.sub, order.id))) {
    await abandonOrder(order.id, claims.sub);
    return fail("VALIDATION_ERROR", { field: "coupon", couponError: "USED" });
  }

  if (boostRequest && boostTarget) {
    await createBoost({
      profileId: claims.sub,
      listingId: boostRequest.listingId,
      subjectKind: boostRequest.subjectKind,
      item,
      targeting: boostRequest.targeting as "area" | "city" | "state" | "india",
      targetLabel: boostTarget.label,
      targetAreaId: boostTarget.areaId,
      targetCityId: boostTarget.cityId,
      targetStateId: boostTarget.stateId,
      orderId: order.id,
    });
  }

  let razorpayOrderId: string;
  if (isConfigured()) {
    const rzp = await createOrder({
      amountPaise: q.totalPaise,
      currency: q.currency,
      receipt: order.id,
      notes: { orderId: order.id, profileId: claims.sub, code: item.code },
    });
    razorpayOrderId = rzp.id;
  } else {
    // Dev fallback (no keys) — keeps the flow clickable end-to-end. Production
    // never reaches here: assertProdSecrets() fails the deploy without keys.
    if (process.env.NODE_ENV === "production") return fail("SERVER_ERROR");
    razorpayOrderId = `order_dev_${order.id.replace(/-/g, "").slice(0, 14)}`;
  }

  await attachRazorpayOrder(order.id, razorpayOrderId, gstin);

  return ok({
    orderId: order.id,
    razorpayOrderId,
    amount: q.totalPaise,
    currency: q.currency,
    keyId: isConfigured() ? publicKeyId() : null,
    simulated: !isConfigured(),
    quote: quoteDTO(q),
    duplicateWarning: recent ? { minutes: dupeWindow } : null,
  });
}
