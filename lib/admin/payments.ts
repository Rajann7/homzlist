import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { PAYMENT_STATUS_CHIPS, PAYMENT_STATUS_LABEL } from "./paymentTypes";
import type { PaymentDetail, PaymentFilters, PaymentRow } from "./paymentTypes";

export type { PaymentDetail, PaymentFilters, PaymentRow };
export { PAYMENT_STATUS_CHIPS, PAYMENT_STATUS_LABEL };

/**
 * A17/A18's reader (Doc5 A17 "Payments list", A18 "Payment detail (refunds)").
 *
 * Money is the one place where a screen that rounds, guesses or re-derives a
 * number is dangerous, so every figure here is the stored paise value formatted
 * at the edge — never recomputed from a price list.
 */

export function readPaymentFilters(sp: Record<string, string | string[] | undefined>): PaymentFilters {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : null;
  };
  return { q: one("q"), status: one("status"), method: one("method") };
}

export const rupees = (paise: number | null | undefined) =>
  paise == null ? "—" : `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

export interface PaymentsPage {
  rows: PaymentRow[];
  total: number;
  counts: Record<string, number>;
  page: number;
  pageSize: number;
  /** The money A17's header states, over the CURRENT filter. */
  sumPaise: number;
  /** True when the filter is bigger than the sum cap, so the figure is a floor. */
  sumCapped: boolean;
}

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "??";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

export async function paymentsPage(filters: PaymentFilters, page = 1, pageSize = 50): Promise<PaymentsPage> {
  const db = createServiceClient();

  const chipKeys = PAYMENT_STATUS_CHIPS.filter((c) => c.key !== "all").map((c) => c.key);
  const countResults = await Promise.all([
    db.from("payments").select("id", { count: "exact", head: true }),
    ...chipKeys.map((k) => db.from("payments").select("id", { count: "exact", head: true }).eq("status", k)),
  ]);
  const counts: Record<string, number> = { all: countResults[0].count ?? 0 };
  chipKeys.forEach((k, i) => {
    counts[k] = countResults[i + 1].count ?? 0;
  });

  let q = db
    .from("payments")
    .select("id, razorpay_payment_id, profile_id, order_id, amount_paise, method, status, created_at, refunded_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.method) q = q.eq("method", filters.method);
  if (filters.q) {
    const raw = filters.q.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) q = q.eq("id", raw);
    else q = q.ilike("razorpay_payment_id", `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }

  const from = (page - 1) * pageSize;
  const { data, count } = await q.range(from, from + pageSize - 1);
  const base = (data ?? []) as Array<Record<string, unknown>>;
  if (!base.length) return { rows: [], total: count ?? 0, counts, page, pageSize, sumPaise: 0, sumCapped: false };

  const payerIds = [...new Set(base.map((r) => r.profile_id as string).filter(Boolean))];
  const orderIds = [...new Set(base.map((r) => r.order_id as string).filter(Boolean))];

  const [payers, orders] = await Promise.all([
    payerIds.length ? db.from("profiles").select("id, name").in("id", payerIds) : Promise.resolve({ data: [] }),
    orderIds.length ? db.from("orders").select("id, kind, catalog_code").in("id", orderIds) : Promise.resolve({ data: [] }),
  ]);

  const nameOf = new Map(((payers.data ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name || "Unnamed"]));
  const orderOf = new Map(((orders.data ?? []) as Array<{ id: string; kind: string; catalog_code: string | null }>).map((o) => [o.id, o]));

  const rows: PaymentRow[] = base.map((r) => {
    const payerName = nameOf.get(r.profile_id as string) ?? "Unknown";
    const order = orderOf.get(r.order_id as string);
    return {
      id: r.id as string,
      ref: (r.razorpay_payment_id as string) ?? (r.id as string).slice(0, 8),
      payer: { id: (r.profile_id as string) ?? "", name: payerName, initials: initialsOf(payerName) },
      amountLabel: rupees(r.amount_paise as number),
      method: ((r.method as string) ?? "—").toUpperCase(),
      status: (r.status as string) ?? "pending",
      statusLabel: PAYMENT_STATUS_LABEL[(r.status as string) ?? ""] ?? ((r.status as string) ?? "—"),
      atLabel: stamp(r.created_at as string),
      refundedAtLabel: r.refunded_at ? stamp(r.refunded_at as string) : null,
      forWhat: order ? `${order.kind}${order.catalog_code ? ` · ${order.catalog_code}` : ""}` : "—",
    };
  });

  // The header states the money the FILTER adds up to, not the money on this
  // page — a total that silently means "the 50 rows you happen to be looking
  // at" is how someone ends up quoting the wrong number. Summed over the same
  // predicate, in one read, capped so a huge filter cannot pull the table into
  // memory; past the cap the screen says so rather than under-reporting.
  const SUM_CAP = 5000;
  let sumQ = db.from("payments").select("amount_paise");
  if (filters.status) sumQ = sumQ.eq("status", filters.status);
  if (filters.method) sumQ = sumQ.eq("method", filters.method);
  if (filters.q) {
    const raw = filters.q.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) sumQ = sumQ.eq("id", raw);
    else sumQ = sumQ.ilike("razorpay_payment_id", `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }
  const { data: amounts } = await sumQ.range(0, SUM_CAP - 1);
  const all = (amounts ?? []) as Array<{ amount_paise: number | null }>;
  const sumPaise = all.reduce((a, r) => a + Number(r.amount_paise ?? 0), 0);

  return { rows, total: count ?? 0, counts, page, pageSize, sumPaise, sumCapped: all.length >= SUM_CAP };
}

// ------------------------------------------------------------------ A18

export async function paymentDetail(id: string): Promise<PaymentDetail | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("payments")
    .select(
      "id, razorpay_payment_id, profile_id, order_id, amount_paise, method, method_detail, status, failure_reason, refund_id, refund_reason, refunded_at, captured_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const p = data as Record<string, unknown>;

  const [payer, order, plans, boosts] = await Promise.all([
    db.from("profiles").select("id, name, phone").eq("id", p.profile_id as string).maybeSingle(),
    p.order_id
      ? db
          .from("orders")
          .select("id, kind, catalog_code, base_paise, discount_paise, cgst_paise, sgst_paise, igst_paise, total_paise, coupon_code, gstin, place_of_supply, status")
          .eq("id", p.order_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    p.order_id ? db.from("user_plans").select("name, status, expires_at").eq("order_id", p.order_id) : Promise.resolve({ data: [] }),
    p.order_id ? db.from("boosts").select("id, status, target_label, duration_days").eq("order_id", p.order_id) : Promise.resolve({ data: [] }),
  ]);

  const who = payer.data as { id: string; name: string | null; phone: string | null } | null;
  const o = order.data as Record<string, unknown> | null;
  const name = who?.name || "Unknown";
  const status = (p.status as string) ?? "pending";

  const grants: Array<{ label: string; detail: string }> = [
    ...((plans.data ?? []) as Array<Record<string, unknown>>).map((pl) => ({
      label: `Plan · ${(pl.name as string) ?? "—"}`,
      detail: `${(pl.status as string) ?? "—"}${pl.expires_at ? ` until ${new Date(pl.expires_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}`,
    })),
    ...((boosts.data ?? []) as Array<Record<string, unknown>>).map((b) => ({
      label: `Boost · ${(b.target_label as string) ?? "—"}`,
      detail: `${(b.status as string) ?? "—"} · ${(b.duration_days as number) ?? 0} days`,
    })),
  ];

  const refundBlockedReason =
    status === "refunded"
      ? "This payment has already been refunded."
      : status !== "success"
        ? `Only a successful payment can be refunded — this one is ${status}.`
        : !p.razorpay_payment_id
          ? "There is no gateway payment id on this row, so there is nothing for Razorpay to refund."
          : null;

  return {
    id: p.id as string,
    ref: (p.razorpay_payment_id as string) ?? (p.id as string).slice(0, 8),
    status,
    statusLabel: PAYMENT_STATUS_LABEL[status] ?? status,
    amountLabel: rupees(p.amount_paise as number),
    amountPaise: Number(p.amount_paise ?? 0),
    method: ((p.method as string) ?? "—").toUpperCase(),
    methodDetail: (p.method_detail as string) ?? null,
    atLabel: stamp(p.created_at as string),
    capturedAtLabel: p.captured_at ? stamp(p.captured_at as string) : null,
    refundedAtLabel: p.refunded_at ? stamp(p.refunded_at as string) : null,
    refundId: (p.refund_id as string) ?? null,
    refundReason: (p.refund_reason as string) ?? null,
    failureReason: (p.failure_reason as string) ?? null,
    payer: { id: who?.id ?? "", name, initials: initialsOf(name), phone: who?.phone ?? "—" },
    order: o
      ? {
          id: o.id as string,
          kind: (o.kind as string) ?? "—",
          catalogCode: (o.catalog_code as string) ?? null,
          baseLabel: rupees(o.base_paise as number),
          discountLabel: rupees(o.discount_paise as number),
          taxLabel: rupees(Number(o.cgst_paise ?? 0) + Number(o.sgst_paise ?? 0) + Number(o.igst_paise ?? 0)),
          totalLabel: rupees(o.total_paise as number),
          couponCode: (o.coupon_code as string) ?? null,
          gstin: (o.gstin as string) ?? null,
          placeOfSupply: (o.place_of_supply as string) ?? null,
          status: (o.status as string) ?? "—",
        }
      : null,
    grants,
    refundable: refundBlockedReason === null,
    refundBlockedReason,
  };
}
