import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import { fetchOrderPayments, isConfigured } from "@/lib/billing/razorpay";
import type { AdminIdentity } from "./guard";

/**
 * A16 — Finance. Template 1148-1163.
 *
 * Four tabs, and every number on all four is a query. Two things this file
 * refuses to do, because both are how a finance screen starts lying:
 *
 *  · NO NUMBER IS COMPUTED IN THE BROWSER. The revenue split, the renewal rate
 *    and the reconciliation counts are SQL. A KPI the client derived from a
 *    page of rows is a KPI that changes when you paginate.
 *  · REVENUE IS PAID ORDERS, MINUS REFUNDS, ALWAYS THE SAME WAY. Every tab
 *    that says "revenue" uses `paidRevenue` below, so the trend, the product
 *    split and the KPI card cannot disagree with each other.
 */

const db = () => createServiceClient();

export type Range = "7d" | "30d" | "6m" | "12m";

const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "6m": 182, "12m": 365 };

export function rangeStart(range: Range): string {
  return new Date(Date.now() - RANGE_DAYS[range] * 86_400_000).toISOString();
}

/* ═══════════════════════════════════════════════════════ tab 1 · revenue ═══ */

export async function revenueTab(range: Range, granularity: "day" | "week" | "month") {
  const since = rangeStart(range);
  // The design's KPI carries "▲ 18% vs last month" (template 1155). That is a
  // comparison, so it needs the PREVIOUS window of the same length — a delta
  // computed from the window already on screen would be comparing it to itself.
  const prevSince = new Date(
    Date.now() - RANGE_DAYS[range] * 2 * 86_400_000,
  ).toISOString();

  const [{ data: orders }, { data: refunds }] = await Promise.all([
    db()
      .from("orders")
      .select("id, catalog_code, kind, total_paise, created_at, profile_id")
      .eq("status", "paid")
      .gte("created_at", since),
    db()
      .from("payments")
      .select("amount_paise, refunded_at")
      .eq("status", "refunded")
      .gte("refunded_at", since),
  ]);

  const rows = (orders ?? []) as {
    id: string;
    catalog_code: string;
    kind: string;
    total_paise: number;
    created_at: string;
    profile_id: string;
  }[];
  const refundRows = (refunds ?? []) as { amount_paise: number }[];

  const gross = rows.reduce((s, r) => s + Number(r.total_paise), 0);
  const refunded = refundRows.reduce((s, r) => s + Number(r.amount_paise), 0);

  // ---- the trend, bucketed in the SAME way the dashboard buckets ----------
  const bucketOf = (iso: string) => {
    const d = new Date(iso);
    if (granularity === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (granularity === "week") {
      const day = new Date(d);
      day.setDate(day.getDate() - day.getDay());
      return day.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10);
  };

  // The design's stacked bar is Plans / Boosts / Top-ups (template 1151), so
  // the bucket carries all three rather than one total the legend then invents.
  const buckets = new Map<string, { plan: number; boost: number; topup: number }>();
  for (const r of rows) {
    const key = bucketOf(r.created_at);
    const b = buckets.get(key) ?? { plan: 0, boost: 0, topup: 0 };
    const slot = r.kind === "boost" ? "boost" : r.kind === "topup" ? "topup" : "plan";
    b[slot] += Number(r.total_paise);
    buckets.set(key, b);
  }
  const trend = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, ...v, total: v.plan + v.boost + v.topup }));

  // ---- by product ---------------------------------------------------------
  const byCode = new Map<string, { sales: number; revenue: number }>();
  for (const r of rows) {
    const b = byCode.get(r.catalog_code) ?? { sales: 0, revenue: 0 };
    b.sales += 1;
    b.revenue += Number(r.total_paise);
    byCode.set(r.catalog_code, b);
  }
  const { data: catalog } = await db().from("plan_catalog").select("code, name");
  const nameOf = new Map(((catalog ?? []) as { code: string; name: string }[]).map((c) => [c.code, c.name]));
  const byProduct = [...byCode.entries()]
    .map(([code, v]) => ({
      code,
      name: nameOf.get(code) ?? code,
      sales: v.sales,
      revenue_paise: v.revenue,
      share: gross ? Math.round((v.revenue / gross) * 100) : 0,
    }))
    .sort((a, b) => b.revenue_paise - a.revenue_paise);

  // ---- by city ------------------------------------------------------------
  // The buyer's city, resolved through their profile — an order has no city of
  // its own, and inventing one from the listing would attribute a broker's
  // Ahmedabad sale to whichever property they happened to post.
  const buyerIds = [...new Set(rows.map((r) => r.profile_id))];
  const { data: buyers } = buyerIds.length
    ? await db().from("profiles").select("id, city_id").in("id", buyerIds)
    : { data: [] };
  const cityIds = [
    ...new Set(((buyers ?? []) as { city_id: string | null }[]).map((b) => b.city_id).filter(Boolean)),
  ] as string[];
  const { data: cities } = cityIds.length
    ? await db().from("locations").select("id, name").in("id", cityIds)
    : { data: [] };
  const cityName = new Map(((cities ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const cityOfBuyer = new Map(
    ((buyers ?? []) as { id: string; city_id: string | null }[]).map((b) => [
      b.id,
      b.city_id ? (cityName.get(b.city_id) ?? "Unknown") : "Unknown",
    ]),
  );
  const byCityMap = new Map<string, number>();
  for (const r of rows) {
    const c = cityOfBuyer.get(r.profile_id) ?? "Unknown";
    byCityMap.set(c, (byCityMap.get(c) ?? 0) + Number(r.total_paise));
  }
  const byCity = [...byCityMap.entries()]
    .map(([name, revenue_paise]) => ({
      name,
      revenue_paise,
      share: gross ? Math.round((revenue_paise / gross) * 100) : 0,
    }))
    .sort((a, b) => b.revenue_paise - a.revenue_paise)
    .slice(0, 8);

  // ---- the previous window, for the design's one delta badge --------------
  const { data: prevOrders } = await db()
    .from("orders")
    .select("total_paise")
    .eq("status", "paid")
    .gte("created_at", prevSince)
    .lt("created_at", since);
  const prevGross = ((prevOrders ?? []) as { total_paise: number }[]).reduce(
    (s, r) => s + Number(r.total_paise),
    0,
  );
  // A percentage against a window that sold nothing is not 100% growth, it is
  // undefined — so it is null and the badge does not render.
  const deltaPct = prevGross > 0 ? Math.round(((gross - prevGross) / prevGross) * 100) : null;

  return {
    kpis: {
      revenue_paise: gross - refunded,
      gross_paise: gross,
      transactions: rows.length,
      avg_order_paise: rows.length ? Math.round(gross / rows.length) : 0,
      refunds_paise: refunded,
      refund_count: refundRows.length,
      delta_pct: deltaPct,
      prev_revenue_paise: prevGross,
    },
    trend,
    byProduct,
    byCity,
    granularity,
    range,
    // The design's range button prints an actual window ("1–31 Jan 2025"), not
    // the name of a preset. The server resolves it so the label and the numbers
    // can never describe two different windows.
    range_from: since,
    range_to: new Date().toISOString(),
  };
}

/* ═════════════════════════════════════════════════════════ tab 2 · churn ═══ */

export async function churnTab() {
  const [{ data: soon }, { count: expiringWeek }, { count: churnedLastMonth }] = await Promise.all([
    db()
      .from("admin_churn_list")
      .select("*")
      .lt("expires_at", new Date(Date.now() + 30 * 86_400_000).toISOString())
      .order("expires_at", { ascending: true })
      .limit(100),
    db()
      .from("admin_churn_list")
      .select("id", { count: "exact", head: true })
      .lt("expires_at", new Date(Date.now() + 7 * 86_400_000).toISOString()),
    db()
      .from("user_plans")
      .select("id", { count: "exact", head: true })
      .eq("status", "expired")
      .gte("expires_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .lt("expires_at", new Date().toISOString()),
  ]);

  // The renewal rate is over plans that have ALREADY ended — a rate that
  // counted plans still running would improve every time one was sold.
  const { data: ended } = await db()
    .from("user_plans")
    .select("profile_id, catalog_code, purchased_at")
    .in("status", ["expired", "revoked"])
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .gte("expires_at", new Date(Date.now() - 180 * 86_400_000).toISOString())
    .limit(1000);

  const endedRows = (ended ?? []) as { profile_id: string; catalog_code: string; purchased_at: string }[];
  let renewedCount = 0;
  if (endedRows.length) {
    const { data: repeats } = await db()
      .from("orders")
      .select("profile_id, catalog_code, created_at")
      .eq("status", "paid")
      .in("profile_id", [...new Set(endedRows.map((r) => r.profile_id))]);
    const byUser = new Map<string, { catalog_code: string; created_at: string }[]>();
    for (const o of (repeats ?? []) as { profile_id: string; catalog_code: string; created_at: string }[]) {
      const arr = byUser.get(o.profile_id) ?? [];
      arr.push(o);
      byUser.set(o.profile_id, arr);
    }
    for (const r of endedRows) {
      const theirs = byUser.get(r.profile_id) ?? [];
      if (theirs.some((o) => o.catalog_code === r.catalog_code && o.created_at > r.purchased_at)) {
        renewedCount++;
      }
    }
  }

  return {
    kpis: {
      expiring_7d: expiringWeek ?? 0,
      renewal_rate: endedRows.length ? Math.round((renewedCount / endedRows.length) * 100) : 0,
      renewal_basis: endedRows.length,
      churned_last_month: churnedLastMonth ?? 0,
    },
    rows: (soon ?? []) as Record<string, unknown>[],
  };
}

/**
 * template 1153's row menu — a renewal reminder.
 *
 * `plan_reminders` already exists and the billing cron already sends the
 * automatic ones, so this records a MANUAL send against the same table: two
 * senders writing to one ledger, rather than an admin nudge the cron cannot see
 * and will duplicate an hour later.
 */
export async function sendRenewalReminder(
  userPlanId: string,
  me: AdminIdentity,
): Promise<{ ok: boolean; label: string; summary: string; message?: string }> {
  const { data } = await db()
    .from("user_plans")
    .select("id, profile_id, name, expires_at, status")
    .eq("id", userPlanId)
    .maybeSingle();
  const plan = data as
    | { id: string; profile_id: string; name: string; expires_at: string | null; status: string }
    | null;
  if (!plan) return { ok: false, label: "", summary: "", message: "Not found" };
  if (plan.status !== "active")
    return { ok: false, label: plan.name, summary: "", message: "That plan is no longer active" };

  const { data: already } = await db()
    .from("plan_reminders")
    .select("id")
    .eq("user_plan_id", userPlanId)
    .eq("milestone", 0)
    .gte("sent_at", new Date(Date.now() - 86_400_000).toISOString())
    .maybeSingle();
  if (already)
    return { ok: false, label: plan.name, summary: "", message: "Already reminded in the last 24 hours" };

  const days = plan.expires_at
    ? Math.max(0, Math.ceil((new Date(plan.expires_at).getTime() - Date.now()) / 86_400_000))
    : null;

  await notify({
    profileId: plan.profile_id,
    type: "plan_expiring",
    title: days ? `Your ${plan.name} expires in ${days} days` : `Your ${plan.name} is expiring`,
    body: "Renew to keep your listings live.",
    actorId: me.id,
  });
  await db().from("plan_reminders").insert({
    user_plan_id: userPlanId,
    profile_id: plan.profile_id,
    // 0 = sent by hand (migration 0105). It shares the cron's ledger on
    // purpose: two ledgers would let the cron duplicate a nudge an admin has
    // already sent.
    milestone: 0,
    expires_at: plan.expires_at ?? new Date().toISOString(),
  });

  return { ok: true, label: plan.name, summary: `Renewal reminder sent${days ? ` · ${days} days left` : ""}` };
}

/* ════════════════════════════════════════════════ tab 3 · reconciliation ═══ */

export async function reconTab() {
  const { data: run } = await db()
    .from("reconciliation_runs")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latest = run as Record<string, unknown> | null;

  const [{ count: matched }, { count: mismatched }, { count: pending }, { data: rows }] =
    await Promise.all([
      db().from("reconciliation_items").select("id", { count: "exact", head: true }).eq("state", "matched"),
      db().from("reconciliation_items").select("id", { count: "exact", head: true }).eq("state", "mismatched"),
      db().from("reconciliation_items").select("id", { count: "exact", head: true }).eq("state", "pending"),
      db()
        .from("reconciliation_items")
        .select("id, payment_id, gateway_ref, platform_paise, gateway_paise, state, note, rechecked_at")
        .eq("state", "mismatched")
        .order("id")
        .limit(50),
    ]);

  const items = (rows ?? []) as Record<string, unknown>[];
  const paymentIds = items.map((i) => i.payment_id).filter(Boolean) as string[];
  const { data: pays } = paymentIds.length
    ? await db()
        .from("admin_payment_list")
        .select("id, razorpay_payment_id, status_key, amount_paise, user_name")
        .in("id", paymentIds)
    : { data: [] };
  const payOf = new Map(
    ((pays ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p]),
  );

  return {
    lastRun: latest,
    counts: { matched: matched ?? 0, mismatched: mismatched ?? 0, pending: pending ?? 0 },
    mismatches: items.map((i) => ({ ...i, payment: payOf.get(i.payment_id as string) ?? null })),
    gatewayConfigured: isConfigured(),
  };
}

/**
 * "Re-check" on a mismatch row (template 1157).
 *
 * It asks RAZORPAY, which is the only thing that can settle a disagreement
 * between us and Razorpay. A "re-check" that re-read our own row would agree
 * with itself every time and resolve nothing — which is exactly the shape of
 * button that looks like it works.
 */
export async function recheckMismatch(
  itemId: string,
  me: AdminIdentity,
): Promise<{ ok: boolean; label: string; summary: string; message?: string; diff?: Record<string, unknown> }> {
  const { data } = await db()
    .from("reconciliation_items")
    .select("id, payment_id, gateway_ref, platform_paise, gateway_paise, state")
    .eq("id", itemId)
    .maybeSingle();
  const item = data as
    | {
        id: string;
        payment_id: string | null;
        gateway_ref: string | null;
        platform_paise: number | null;
        gateway_paise: number | null;
        state: string;
      }
    | null;
  if (!item) return { ok: false, label: "", summary: "", message: "Not found" };

  if (!isConfigured()) {
    return {
      ok: false,
      label: item.gateway_ref ?? itemId,
      summary: "",
      message: "Razorpay is not configured on this environment — nothing to re-check against",
    };
  }

  const { data: pay } = item.payment_id
    ? await db().from("payments").select("order_id, amount_paise, status").eq("id", item.payment_id).maybeSingle()
    : { data: null };
  const p = pay as { order_id: string; amount_paise: number; status: string } | null;
  if (!p) return { ok: false, label: itemId, summary: "", message: "No payment on this row" };

  const { data: order } = await db()
    .from("orders")
    .select("razorpay_order_id")
    .eq("id", p.order_id)
    .maybeSingle();
  const rzpOrder = (order as { razorpay_order_id: string | null } | null)?.razorpay_order_id;
  if (!rzpOrder)
    return { ok: false, label: itemId, summary: "", message: "This order never reached the gateway" };

  let gatewayPaise: number | null = null;
  let gatewayStatus = "unknown";
  try {
    const remote = await fetchOrderPayments(rzpOrder);
    const captured = remote.items.find((r) => r.status === "captured") ?? remote.items[0];
    if (captured) {
      gatewayPaise = captured.amount;
      gatewayStatus = captured.status;
    }
  } catch (e) {
    return {
      ok: false,
      label: itemId,
      summary: "",
      message: e instanceof Error ? e.message : "The gateway did not answer",
    };
  }

  const agrees = gatewayPaise !== null && gatewayPaise === Number(p.amount_paise);
  await db()
    .from("reconciliation_items")
    .update({
      gateway_paise: gatewayPaise,
      state: agrees ? "matched" : "mismatched",
      rechecked_at: new Date().toISOString(),
      note: `re-checked by ${me.name}: gateway ${gatewayStatus} ${gatewayPaise ?? "—"} vs ours ${p.amount_paise}`,
    })
    .eq("id", itemId);

  return {
    ok: true,
    label: item.gateway_ref ?? itemId,
    summary: agrees
      ? "Re-checked — the gateway agrees, marked matched"
      : `Still mismatched — gateway says ${gatewayStatus} ${gatewayPaise ?? "nothing"}`,
    diff: { gatewayPaise, gatewayStatus, ourPaise: p.amount_paise, resolved: agrees },
  };
}

/** template 1157 — "Mark resolved" on a mismatch nobody can reconcile further. */
export async function resolveMismatch(
  itemId: string,
  me: AdminIdentity,
  note: string,
): Promise<{ ok: boolean; label: string; summary: string; message?: string }> {
  if (!note.trim())
    return { ok: false, label: "", summary: "", message: "Say why it is resolved" };
  const { data } = await db()
    .from("reconciliation_items")
    .update({
      state: "resolved",
      rechecked_at: new Date().toISOString(),
      note: `resolved by ${me.name}: ${note.trim().slice(0, 300)}`,
    })
    .eq("id", itemId)
    .eq("state", "mismatched")
    .select("id, gateway_ref")
    .maybeSingle();
  if (!data) return { ok: false, label: "", summary: "", message: "Not a mismatched row" };
  return {
    ok: true,
    label: (data as { gateway_ref: string | null }).gateway_ref ?? itemId,
    summary: `Marked resolved · ${note.trim()}`,
  };
}

/* ═══════════════════════════════════════════════════════ tab 4 · exports ═══ */

/**
 * The finance exports the design lists (template 1160) — GST invoices, a
 * revenue summary and a refunds report.
 *
 * They go through the SAME export machinery every other screen uses
 * (lib/admin/export.ts): one exports table, one private bucket, one audit rule.
 * A second downloader here would be a second place for a personal-data flag to
 * be forgotten.
 */
export const FINANCE_EXPORTS = [
  {
    key: "invoices",
    name: "GST invoice list",
    resource: "finance-invoices",
    personal: true,
  },
  { key: "revenue", name: "Revenue summary", resource: "finance-revenue", personal: false },
  { key: "refunds", name: "Refunds report", resource: "finance-refunds", personal: false },
] as const;

export async function financeExportHistory() {
  const { data } = await db()
    .from("exports")
    .select("id, name, entity, row_count, format, status, requested_by_name, created_at, expires_at, file_key")
    .in(
      "entity",
      FINANCE_EXPORTS.map((e) => e.resource),
    )
    .order("created_at", { ascending: false })
    .limit(30);
  return { rows: (data ?? []) as Record<string, unknown>[] };
}
