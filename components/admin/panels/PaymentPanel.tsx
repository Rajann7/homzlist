"use client";

/**
 * The PAYMENT panel — template 1447-1470.
 *
 * It ships with P4 because A11's Payments tab pushes it (template 1345): a row
 * that opened nothing would fail §5's click-flow gate. P5 builds A18's payments
 * LIST on top of this same panel rather than a second copy of it.
 *
 * Every line is read, not assumed: the money breakdown is the ORDER's own tax
 * split from checkout, the webhook lines are `webhook_events` rows, the
 * reconciliation line is a `reconciliation_items` row. Where a fact does not
 * exist for this payment the panel says so — printing the design's fixture
 * would be a screen that lies.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Btn,
  GatedBtn,
  Modal,
  PRow,
  PSecH,
  Shimmer,
  StatusBadge,
  useToast,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";

type Detail = {
  payment: Record<string, string | number | null>;
  order: Record<string, string | number | null>;
  user: { id: string; name: string | null } | null;
  invoice: { number: string; issued_at: string; emailed_at: string | null } | null;
  chargeback: Record<string, string | null> | null;
  webhooks: { event_type: string | null; status: string; received_at: string }[];
  reconciliation: Record<string, string | number | null> | null;
  plan: Record<string, string | number> | null;
  planConsumed: number;
  consumptions: Record<string, string | number | null>[];
  gatewayConfigured: boolean;
};

const money = (paise: unknown) =>
  paise === null || paise === undefined
    ? "—"
    : `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}`;

const stamp = (iso: unknown) =>
  iso
    ? new Date(String(iso)).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const label = (s: unknown) => {
  const v = String(s ?? "");
  return v.charAt(0).toUpperCase() + v.slice(1);
};

export function PaymentPanelBody({ panel }: { panel: PanelEntry }) {
  const id = String(panel.data.id ?? "");
  const toast = useToast();
  const { pushPanel, notifyChanged } = usePanels();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [refunding, setRefunding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/payments/${id}`, { cache: "no-store" }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean; data?: Detail } | null;
    if (json?.ok && json.data) setDetail(json.data);
    setLoading(false);
    // The nonce is deliberately a dependency: it IS the reload trigger. An
    // action bumps it and this refetches — without it, a mutation would show a
    // success toast over stale rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !detail)
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <Shimmer key={i} h={44} />
        ))}
      </div>
    );

  const p = detail.payment;
  const o = detail.order;
  const status = label(p.status);

  /* template 1449 — the banner is per status, and only for the four that have one */
  const banner =
    status === "Pending"
      ? ["var(--infoSoft)", "Payment pending · gateway confirmation awaited"]
      : status === "Failed"
        ? [
            "var(--errorSoft)",
            `Declined${p.failure_reason ? ` (${p.failure_reason})` : ""} · No money was deducted`,
          ]
        : status === "Refunded"
          ? [
              "var(--s2)",
              `Refunded ${money(p.amount_paise)} on ${stamp(p.refunded_at)}${p.refund_reason ? ` · ${p.refund_reason}` : ""}`,
            ]
          : detail.chargeback
            ? [
                "var(--errorSoft)",
                `Chargeback raised ${stamp(detail.chargeback.raised_at)} · ${detail.chargeback.reason}`,
              ]
            : null;

  const summary: [string, React.ReactNode][] = [
    ["Order ID", String(o.razorpay_order_id ?? o.id ?? "—")],
    [
      "User",
      detail.user ? (
        <span
          onClick={() => pushPanel("user", { id: detail.user!.id, name: detail.user!.name })}
          style={{ color: "var(--accent)", cursor: "pointer" }}
        >
          {detail.user.name}
        </span>
      ) : (
        "—"
      ),
    ],
    ["Item", String(o.catalog_code ?? "—")],
    ["Method", [p.method, p.method_detail].filter(Boolean).join(" · ") || "—"],
    ["Payment ref", String(p.razorpay_payment_id ?? "not charged through the gateway")],
    ["Idempotency key", String(o.idempotency_key ?? "—")],
  ];

  const breakdown: [string, string, boolean?][] = [
    ["Subtotal", money(o.base_paise)],
    ...(Number(o.discount_paise) > 0
      ? ([[`Coupon ${o.coupon_code ?? ""}`.trim(), `−${money(o.discount_paise)}`, true]] as [
          string,
          string,
          boolean,
        ][])
      : []),
    ["Taxable", money(o.taxable_paise)],
    ...(Number(o.cgst_paise) > 0
      ? ([
          ["CGST", money(o.cgst_paise)],
          ["SGST", money(o.sgst_paise)],
        ] as [string, string][])
      : []),
    ...(Number(o.igst_paise) > 0 ? ([["IGST", money(o.igst_paise)]] as [string, string][]) : []),
    ["Total", money(o.total_paise)],
  ];

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        {banner ? (
          <div
            style={{
              background: banner[0],
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--ink1)",
              marginBottom: 8,
            }}
          >
            {banner[1]}
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{money(p.amount_paise)}</span>
          <StatusBadge status={status} />
        </div>
        <div style={{ fontSize: 12, color: "var(--ink3)" }}>{stamp(p.created_at)} IST</div>

        <PSecH>Summary</PSecH>
        {summary.map(([k, v]) => (
          <PRow key={k} label={k} value={v} />
        ))}

        <PSecH>Money breakdown</PSecH>
        <div style={{ background: "var(--s2)", borderRadius: 8, padding: 12 }}>
          {breakdown.map(([k, v, isCoupon], i) => (
            <div
              key={`${k}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                fontSize: k === "Total" ? 15 : 13,
                fontWeight: k === "Total" ? 700 : 400,
                color: isCoupon ? "var(--accent)" : "var(--ink1)",
              }}
            >
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>

        <PSecH>Plan consumption</PSecH>
        {detail.plan ? (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              {consumptionLines(detail.plan).map((line) => (
                <div key={line}>→ {line}</div>
              ))}
            </div>
            {detail.planConsumed > 0 && status !== "Refunded" ? (
              <div
                style={{
                  background: "var(--warningSoft)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 11,
                  color: "var(--ink2)",
                  marginTop: 8,
                }}
              >
                This plan is partly consumed. Refunding will revoke the plan and unpublish what it
                paid for.
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: 13, color: "var(--ink3)" }}>
            No plan was activated by this payment.
          </div>
        )}

        <PSecH>Webhook &amp; reconciliation</PSecH>
        <div style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.9 }}>
          {detail.webhooks.length ? (
            detail.webhooks.map((w, i) => (
              <div key={i}>
                {w.event_type ?? "event"} · {w.status} · {stamp(w.received_at)}
              </div>
            ))
          ) : (
            <div>No webhook recorded for this order.</div>
          )}
          <div>Our status: {String(p.status)}</div>
          {detail.reconciliation ? (
            <div>
              Reconciled: {String(detail.reconciliation.state)} ·{" "}
              {stamp(detail.reconciliation.rechecked_at)}
            </div>
          ) : (
            <div>Not reconciled yet.</div>
          )}
        </div>

        <PSecH>Invoice</PSecH>
        {detail.invoice ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--s2)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{detail.invoice.number}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                Issued {stamp(detail.invoice.issued_at)}
                {detail.invoice.emailed_at ? " · emailed" : " · not emailed"}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--ink3)" }}>No invoice for this payment.</div>
        )}
      </div>

      {/* template 1463 — the footer */}
      <div
        style={{
          flex: "none",
          borderTop: "1px solid var(--divider)",
          padding: 16,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <GatedBtn
          label="Refund"
          kind="dangerFill"
          need="admin"
          style={{ flex: 1 }}
          onClick={() => {
            if (status !== "Success") {
              toast(`A ${status.toLowerCase()} payment cannot be refunded`);
              return;
            }
            setRefunding(true);
          }}
        />
      </div>

      {refunding ? (
        <RefundDialog
          amount={money(p.amount_paise)}
          onClose={() => setRefunding(false)}
          onDone={(message) => {
            setRefunding(false);
            toast(message);
            setNonce((n) => n + 1);
            notifyChanged();
          }}
          paymentId={id}
        />
      ) : null}
    </>
  );
}

function consumptionLines(plan: Record<string, string | number>): string[] {
  const out: string[] = [];
  const pair = (label: string, used: unknown, quota: unknown) => {
    if (Number(quota) > 0) out.push(`${label} — ${used} used, ${Number(quota) - Number(used)} left`);
  };
  pair("Listing slots", plan.listing_used, plan.listing_quota);
  pair("Requirement slots", plan.requirement_used, plan.requirement_quota);
  pair("Proposals", plan.proposal_used, plan.proposal_quota);
  return out.length ? out : ["Nothing consumed yet"];
}

/** Full refunds only (Doc2 §4.3), and the word typed out before the money moves. */
function RefundDialog({
  amount,
  paymentId,
  onClose,
  onDone,
}: {
  amount: string;
  paymentId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={`Refund ${amount} in full?`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Refunding…" : "Refund"}
            kind="dangerFill"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await fetch(`/api/v1/admin/payments/${paymentId}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ action: "refund", reason, confirm }),
              }).catch(() => null);
              const json = (await res?.json().catch(() => null)) as
                | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
                | null;
              setBusy(false);
              if (!json?.ok) return setError(json?.error?.message ?? "The refund did not go through");
              onDone(json.data?.summary ?? "Refunded · logged");
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 10 }}>
        Refunds are full-only. The plan this paid for is revoked at the same time.
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)…"
        style={{
          width: "100%",
          height: 50,
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s2)",
          color: "var(--ink1)",
          fontSize: 13,
          fontFamily: "inherit",
          resize: "none",
          marginBottom: 8,
        }}
      />
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Type REFUND to confirm"
        style={{
          width: "100%",
          height: 40,
          padding: "0 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s2)",
          color: "var(--ink1)",
          fontSize: 14,
        }}
      />
      {error ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: "var(--errorSoft)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      ) : null}
    </Modal>
  );
}
