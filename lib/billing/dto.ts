import "server-only";
import { formatPaise } from "./money";
import type { BoostRow, CatalogRow, OrderRow, Quote, UserPlanRow } from "./service";

/**
 * Billing DTOs (Doc9 §17 — explicit fields only, never `select *` to the wire).
 *
 * Nothing here is a hint the client may act on by itself: the client renders
 * these numbers, it never derives entitlement from them (Doc7 §11 — paid status
 * and balances are re-checked server-side on every request).
 */

const ist = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : null;

const istTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  });

const daysLeft = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null;

// ---------------------------------------------------------------------------
// Plans screen (P11 S1 / P5 plan wall)
// ---------------------------------------------------------------------------

export function planCardDTO(c: CatalogRow) {
  return {
    code: c.code,
    kind: c.kind,
    name: c.name,
    price: formatPaise(c.price_paise),
    pricePaise: c.price_paise,
    subLabel: c.sub_label,
    features: c.features,
    lifetime: c.period_days === null,
    /**
     * How many listing slots this plan grants. The plan WALL is reached only
     * from "post a listing", and it was offering — and badging "Recommended" —
     * the ₹2,999 Requirement Access plan to brokers, which grants zero listing
     * slots. Buying it took the money and returned the buyer to the same wall,
     * still unable to post. The wall needs the server's number to know which
     * cards can actually unblock the thing the buyer came to do.
     */
    listingQuota: c.listing_quota ?? 0,
    /** Same job for the requirement wall — p2999 grants proposals, not posts. */
    requirementQuota: c.requirement_quota ?? 0,
    /** …and for the project wall, which only p9999 can unblock (migration 0065). */
    projectQuota: c.project_quota ?? 0,
  };
}

// ---------------------------------------------------------------------------
// My plan (P11 S2) — usage bars, pooled totals, trace, grace/trial/expired
// ---------------------------------------------------------------------------

export interface UsageBarDTO {
  label: string;
  value: string;
  pct: number;
  helper: string | null;
  helperHref: string | null;
  topUp?: boolean;
}

function bar(label: string, used: number, quota: number, helper: string | null = null, extra: Partial<UsageBarDTO> = {}): UsageBarDTO | null {
  if (quota === 0) return null;
  if (quota < 0) return { label, value: "Unlimited", pct: 100, helper, helperHref: null, ...extra };
  return { label, value: `${used} / ${quota}`, pct: quota ? Math.round((used / quota) * 100) : 0, helper, helperHref: null, ...extra };
}

/**
 * "₹999 Listing Plan" — but only when a price was actually snapshotted.
 *
 * `terms.price_paise` is absent on a plan an admin GRANTED (there was no
 * payment) and on older rows whose snapshot predates the field. `formatPaise`
 * divides it by 100 regardless, so those cards read "₹NaN Builder Project" on
 * My Plan. A granted plan has no price to show, so it shows its name.
 */
function planTitle(p: UserPlanRow): string {
  const paise = p.terms?.price_paise;
  return typeof paise === "number" ? `${formatPaise(paise)} ${p.name}` : p.name;
}

export function myPlanDTO(
  plans: UserPlanRow[],
  consumptions: { user_plan_id: string; kind: string; qty: number; ref_type: string | null; ref_id: string | null; note: string | null; created_at: string }[],
  opts: {
    graceHours: number;
    slotLabels: Record<string, string>;
    requirementDaysLeft: number | null;
    /** Real, persisted preference — the My Plan reminder toggle renders from this. */
    expiryReminders: boolean;
  },
) {
  const now = Date.now();
  const active = plans.filter((p) => p.status === "active" && (!p.expires_at || new Date(p.expires_at).getTime() > now));
  const expired = plans.filter((p) => p.status === "expired" || (p.expires_at && new Date(p.expires_at).getTime() <= now));

  // Grace: a period plan that ran out less than `graceHours` ago (Doc2 §4.3).
  const graceMs = opts.graceHours * 3_600_000;
  const graced = expired.find((p) => p.expires_at && now - new Date(p.expires_at).getTime() < graceMs);

  const trial = active.find((p) => p.is_trial) ?? null;

  const cards = active.map((p) => {
    const bars: UsageBarDTO[] = [];
    const listingBar = bar("Property listings", p.listing_used, p.listing_quota,
      opts.slotLabels[p.id] ? `Slot used by: ${opts.slotLabels[p.id]}` : null);
    if (listingBar) bars.push(listingBar);
    // The ₹9,999 plan sells a project, not a listing (migration 0065), so its
    // card has to show the counter the builder actually bought. `bar` returns
    // null at quota 0, so nothing appears on the plans that grant none.
    const projectBar = bar("Builder projects", p.project_used, p.project_quota);
    if (projectBar) bars.push(projectBar);
    const reqBar = bar("Requirement posts", p.requirement_used, p.requirement_quota,
      opts.requirementDaysLeft !== null ? `${opts.requirementDaysLeft} days left on your active requirement` : null);
    if (reqBar) bars.push(reqBar);
    const propBar = bar(
      p.proposal_quota < 0 ? "Matching requirements" : "Proposals",
      p.proposal_used,
      p.proposal_quota,
      p.terms.proposals_expire_with_plan && p.proposal_quota > 0 ? "Proposals from this plan expire with the plan" : null,
      p.proposal_quota > 0 ? { topUp: true } : {},
    );
    if (propBar) bars.push(propBar);

    return {
      id: p.id,
      name: planTitle(p),
      isTrial: p.is_trial,
      status: "active" as const,
      meta: p.expires_at
        ? `Renews on ${ist(p.expires_at)} · ${daysLeft(p.expires_at)} days left`
        : `Purchased ${ist(p.purchased_at)} · Lifetime`,
      canRenew: Boolean(p.expires_at),
      bars,
    };
  });

  // Pooled totals — the numbers the "oldest first" note refers to (Doc2 §4.2).
  const pooled = {
    activePlans: active.length,
    proposalsLeft: active.reduce((n, p) => (p.proposal_quota < 0 ? n : n + (p.proposal_quota - p.proposal_used)), 0),
    unlimitedProposals: active.some((p) => p.proposal_quota < 0),
    listingSlotsLeft: active.reduce((n, p) => (p.listing_quota < 0 ? n : n + (p.listing_quota - p.listing_used)), 0),
    /**
     * Requirement posts left, pooled the same way. The Create screen gates each
     * option on the quota that option actually spends, so it needs this
     * separately: a seller can hold a ₹999 plan whose listing slot is gone while
     * its requirement post is untouched, and "Post a requirement" must stay open
     * for them (and vice versa).
     *
     * Projects have their own counter too (migration 0065) — a ₹999 listing
     * slot is not a ₹9,999 project slot, so the Create screen must not offer
     * New Project on the strength of one.
     */
    requirementSlotsLeft: active.reduce(
      (n, p) => (p.requirement_quota < 0 ? n : n + Math.max(0, p.requirement_quota - p.requirement_used)),
      0,
    ),
    unlimitedRequirements: active.some((p) => p.requirement_quota < 0),
    projectSlotsLeft: active.reduce(
      (n, p) => (p.project_quota < 0 ? n : n + Math.max(0, p.project_quota - p.project_used)),
      0,
    ),
    unlimitedProjects: active.some((p) => p.project_quota < 0),
  };

  // Consumed trace: one group per plan, in purchase order. Each line names the
  // thing the slot went to when we know it; until the listings module can
  // supply a title, it still says what was spent rather than a dangling label.
  const byPlan = new Map<string, string[]>();
  for (const c of consumptions) {
    const lines = byPlan.get(c.user_plan_id) ?? [];
    if (c.kind === "listing") {
      const label = c.ref_id ? opts.slotLabels[c.ref_id] : null;
      lines.push(
        label
          ? `Listing #${c.ref_id!.slice(0, 4)} — ${label}`
          : `${c.qty} listing slot${c.qty === 1 ? "" : "s"} used`,
      );
    } else if (c.kind === "requirement") {
      lines.push(`${c.qty} requirement post${c.qty === 1 ? "" : "s"} used${c.note ? ` (${c.note})` : ""}`);
    }
    byPlan.set(c.user_plan_id, lines);
  }
  const trace = plans
    .filter((p) => p.status !== "revoked")
    .map((p) => {
      const lines = [...(byPlan.get(p.id) ?? [])];
      if (p.proposal_quota > 0) lines.push(`${p.proposal_used} of ${p.proposal_quota} proposals used`);
      else if (p.proposal_quota < 0) lines.push("Unlimited matching requirements");
      const priced = typeof p.terms?.price_paise === "number";
      return {
        title: priced
          ? `${formatPaise(p.terms.price_paise)} plan · ${ist(p.purchased_at)}`
          : `${p.name} · ${ist(p.purchased_at)}`,
        lines,
      };
    })
    .filter((g) => g.lines.length > 0);

  return {
    state: trial ? ("trial" as const)
      : graced ? ("grace" as const)
      : cards.length ? ("active" as const)
      : expired.length ? ("expired" as const)
      : ("none" as const),
    cards,
    pooled,
    trace,
    expiryReminders: opts.expiryReminders,
    trial: trial
      ? {
          name: "Trial from HomzList",
          summary: [
            trial.listing_quota ? `${trial.listing_quota} listing` : null,
            trial.requirement_quota ? `${trial.requirement_quota} requirement` : null,
          ].filter(Boolean).join(" + ") + ` · ${daysLeft(trial.expires_at)} days left`,
          note: `Granted by HomzList team on ${ist(trial.purchased_at)}. Buying a plan ends the trial.`,
        }
      : null,
    grace: graced
      ? {
          title: `Your ${planTitle(graced)} expired ${hoursAgo(graced.expires_at!)}`,
          hoursLeft: Math.max(0, Math.ceil((new Date(graced.expires_at!).getTime() + graceMs - now) / 3_600_000)),
        }
      : null,
    expiredCard: !cards.length && expired.length && !graced
      ? {
          name: planTitle(expired[0]),
          meta: `Expired on ${ist(expired[0].expires_at)}`,
        }
      : null,
  };
}

function hoursAgo(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "less than an hour ago";
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Payments (P11 S3)
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  success: "Success", pending: "Pending", failed: "Failed", refunded: "Refunded", chargeback: "Chargeback",
};

export function paymentRowDTO(p: any) {
  const order = p.orders;
  const invoice = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
  return {
    id: p.id,
    title: `${formatPaise(order?.terms_snapshot?.price_paise ?? p.amount_paise)} ${order?.terms_snapshot?.name ?? "Payment"}`,
    amount: formatPaise(p.amount_paise),
    status: p.status as "success" | "pending" | "failed" | "refunded" | "chargeback",
    statusLabel: STATUS_LABEL[p.status] ?? p.status,
    when: istTime(p.created_at),
    method: p.method_detail ?? p.method ?? null,
    failureReason: p.failure_reason ?? null,
    refundReason: p.refund_reason ?? null,
    refundedOn: p.refunded_at ? ist(p.refunded_at) : null,
    invoiceId: invoice?.id ?? null,
    orderId: p.order_id,
    catalogCode: order?.catalog_code ?? null,
  };
}

export function paymentDetailDTO(p: any) {
  const o = p.orders;
  const invoice = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
  return {
    orderId: o?.razorpay_order_id ?? p.order_id,
    paymentId: p.razorpay_payment_id ?? "—",
    method: p.method_detail ?? p.method ?? "—",
    status: STATUS_LABEL[p.status] ?? p.status,
    planContents: (o?.terms_snapshot?.features ?? []).join(" · ") || "—",
    coupon: o?.coupon_code ? `${o.coupon_code} (−${formatPaise(o.discount_paise)})` : "—",
    refundStatus: p.status === "refunded" ? `Refunded${p.refunded_at ? ` on ${ist(p.refunded_at)}` : ""}` : "Not applicable",
    invoiceId: invoice?.id ?? null,
  };
}

export function invoiceDTO(inv: any, payment?: { razorpay_payment_id: string | null; method_detail: string | null; method: string | null } | null) {
  const t = inv.totals;
  return {
    id: inv.id,
    number: inv.number,
    date: ist(inv.issued_at),
    paymentRef: payment?.razorpay_payment_id ?? null,
    method: payment?.method_detail ?? payment?.method ?? null,
    billedTo: inv.billed_to,
    gstin: inv.gstin ?? null,
    lineItems: (inv.line_items as any[]).map((li) => ({
      title: li.title,
      contents: (li.contents ?? []).join(" · "),
      amount: formatPaise(li.amount_paise),
    })),
    totals: {
      subtotal: formatPaise(t.base),
      couponCode: t.couponCode ?? null,
      discount: t.discount ? `−${formatPaise(t.discount)}` : null,
      taxable: formatPaise(t.taxable),
      cgst: t.cgst ? formatPaise(t.cgst) : null,
      sgst: t.sgst ? formatPaise(t.sgst) : null,
      igst: t.igst ? formatPaise(t.igst) : null,
      total: formatPaise(t.total),
    },
  };
}

// ---------------------------------------------------------------------------
// Checkout (P6 S2) + Boost (P11 S4/S5)
// ---------------------------------------------------------------------------

export function quoteDTO(q: Quote) {
  const rows: { k: string; v: string; kind: "line" | "discount" | "total" }[] = [
    { k: "Subtotal", v: formatPaise(q.basePaise), kind: "line" },
  ];
  if (q.discountPaise) rows.push({ k: `Coupon (${q.couponCode})`, v: `− ${formatPaise(q.discountPaise)}`, kind: "discount" });
  if (q.igstPaise) rows.push({ k: `IGST (${q.gstRateBps / 100}%)`, v: formatPaise(q.igstPaise), kind: "line" });
  else {
    rows.push({ k: `CGST (${q.gstRateBps / 200}%)`, v: formatPaise(q.cgstPaise), kind: "line" });
    rows.push({ k: `SGST (${q.gstRateBps / 200}%)`, v: formatPaise(q.sgstPaise), kind: "line" });
  }
  rows.push({ k: "Total payable", v: formatPaise(q.totalPaise), kind: "total" });

  return {
    planName: `${formatPaise(q.item.price_paise)} ${q.item.name}`,
    planSub: q.item.sub_label,
    features: q.item.features,
    rows,
    totalLabel: formatPaise(q.totalPaise),
    totalPaise: q.totalPaise,
    couponCode: q.couponCode,
    couponError: q.couponError,
  };
}

export function orderDTO(o: OrderRow) {
  return { id: o.id, status: o.status, totalPaise: o.total_paise, total: formatPaise(o.total_paise), catalogCode: o.catalog_code };
}

const BOOST_BADGE: Record<BoostRow["status"], { kind: string; label: string }> = {
  pending_payment: { kind: "pending", label: "Awaiting payment" },
  pending_approval: { kind: "pending", label: "Pending approval" },
  active: { kind: "active", label: "Active" },
  // Admin-hide → pause (Doc2 §13). The buyer sees an honest "Paused" rather than
  // an "Active" card for a boost that is currently placed nowhere.
  paused: { kind: "pending", label: "Paused" },
  expired: { kind: "expired", label: "Expired" },
  rejected: { kind: "failed", label: "Rejected" },
  stopped: { kind: "expired", label: "Stopped" },
  cancelled: { kind: "expired", label: "Cancelled" },
};

const SUBJECT_NOUN: Record<string, string> = { listing: "Listing", project: "Project", requirement: "Requirement" };

/**
 * Boost status for the user. Deliberately carries NO analytics — Doc2 §13 says
 * users see "active till [date]" and nothing else. Views/clicks are stripped
 * here, server-side, not hidden with CSS.
 */
export function boostDTO(b: BoostRow, listingLabel: { title: string; price: string } | null) {
  const total = b.starts_at && b.ends_at ? new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime() : 0;
  const gone = b.starts_at ? Date.now() - new Date(b.starts_at).getTime() : 0;
  const kind = b.subject_kind ?? "listing";
  return {
    id: b.id,
    listingId: b.listing_id,
    subjectKind: kind,
    subjectNoun: SUBJECT_NOUN[kind] ?? "Listing",
    listingTitle: listingLabel?.title ?? SUBJECT_NOUN[kind] ?? "Listing",
    listingPrice: listingLabel?.price ?? "",
    status: b.status,
    badge: BOOST_BADGE[b.status],
    durationLabel: b.duration_days >= 30 ? "1 Month" : `${b.duration_days} Days`,
    targetLabel: b.target_label,
    price: formatPaise(b.price_paise),
    startedOn: ist(b.starts_at),
    endsOn: ist(b.ends_at),
    daysLeft: daysLeft(b.ends_at),
    progressPct: total > 0 ? Math.min(100, Math.max(0, Math.round((gone / total) * 100))) : 0,
    rejectReason: b.reject_reason,
    stoppedReason: b.stopped_reason,
    refundedOn: ist(b.refunded_at),
    // The pending card reads "Paid ₹1,499 · 2h ago" — a relative age, not a
    // timestamp. It used to render the full IST datetime here.
    paidAgo: relativeAge(b.created_at),
    paidAt: istTime(b.created_at),
  };
}

/** "2h ago" / "Yesterday" / "12 Jan" — the Doc2 §15 age format. */
function relativeAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return "Yesterday";
  return ist(iso) ?? "";
}
