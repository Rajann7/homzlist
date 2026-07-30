"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { PaymentDetail } from "@/lib/admin/paymentTypes";
import { Initials, StatusBadge } from "./queueBits";
import { Btn, Modal, NoteBlock, SecHead, TextArea } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A18 — Payment detail with the refund (Doc5 A18, Doc9 §12).
 *
 * The screen exists to answer one question honestly before anyone presses
 * Refund: what did this money buy, and what will refunding take back? So the
 * grants this order created are listed right above the button, and the button
 * says so again in its dialog.
 */

export function PaymentDetailScreen({ detail, canRefund }: { detail: PaymentDetail; canRefund: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refund = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/payments/${detail.id}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        // `fail()` spreads its extras onto `error` itself, so the details are
        // one level up from where a nested `details` object would be. Read both,
        // or every specific message below is dead code.
        const d = j?.error?.details ?? j?.error ?? {};
        setError(
          d.alreadyRefunded
            ? "This payment has already been refunded."
            : d.notSuccessful
              ? `Only a successful payment can be refunded — this one is ${d.status}.`
              : d.detail === "gateway_refused"
                ? "Razorpay refused the refund. Nothing has changed on our side — check the dashboard and try again."
                : d.detail === "no_gateway_id"
                  ? "There is no gateway payment id on this row, so there is nothing to refund."
                  : j?.error?.code === "FORBIDDEN"
                    ? "Your role cannot issue refunds."
                    : "That didn't go through. Try again.",
        );
        return;
      }
      setDialog(false);
      setToast(
        j.data.unpublished > 0
          ? `Refunded · ${j.data.unpublished} listing${j.data.unpublished === 1 ? "" : "s"} unpublished`
          : "Refunded · the plan it bought was revoked",
      );
      window.setTimeout(() => setToast(null), 3200);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Link href="/payments" className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-left" size={16} />
          Payments
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          {detail.ref}
        </h1>
        <StatusBadge label={detail.statusLabel} />
        <span className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          {detail.amountLabel}
        </span>
      </div>

      {detail.status === "refunded" && (
        <div className="mb-4">
          <NoteBlock tone="warning">
            Refunded {detail.refundedAtLabel} · {detail.refundReason ?? "no reason recorded"}
            {detail.refundId ? ` · ${detail.refundId}` : ""}
          </NoteBlock>
        </div>
      )}
      {detail.status === "failed" && detail.failureReason && (
        <div className="mb-4">
          <NoteBlock tone="error">Failed: {detail.failureReason}</NoteBlock>
        </div>
      )}

      <SecHead>Payment</SecHead>
      <Row label="Method" value={detail.methodDetail ? `${detail.method} · ${detail.methodDetail}` : detail.method} />
      <Row label="Created" value={detail.atLabel} />
      <Row label="Captured" value={detail.capturedAtLabel ?? "Not captured"} />

      <SecHead>Payer</SecHead>
      <div className="flex items-center gap-[10px] rounded-12 border p-3" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
        <Initials text={detail.payer.initials} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {detail.payer.name}
          </p>
          <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            {detail.payer.phone}
          </p>
        </div>
        {detail.payer.id && (
          <Link href={`/users/${detail.payer.id}`} className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
            Open user →
          </Link>
        )}
      </div>

      {detail.order && (
        <>
          <SecHead>Order</SecHead>
          <Row label="Kind" value={detail.order.catalogCode ? `${detail.order.kind} · ${detail.order.catalogCode}` : detail.order.kind} />
          <Row label="Base" value={detail.order.baseLabel} />
          <Row label="Discount" value={detail.order.discountLabel} />
          <Row label="GST" value={detail.order.taxLabel} />
          <Row label="Total" value={detail.order.totalLabel} />
          {detail.order.couponCode && <Row label="Coupon" value={detail.order.couponCode} />}
          {detail.order.gstin && <Row label="GSTIN" value={detail.order.gstin} />}
          {detail.order.placeOfSupply && <Row label="Place of supply" value={detail.order.placeOfSupply} />}
          <Row label="Order status" value={detail.order.status} />
        </>
      )}

      <SecHead>What this money bought</SecHead>
      {detail.grants.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
          Nothing is recorded against this order — check it before refunding.
        </p>
      ) : (
        detail.grants.map((g, i) => (
          <div key={i} className="flex border-t py-[6px]" style={{ borderColor: "var(--divider)" }}>
            <div className="w-[220px] flex-none text-[13px]" style={{ color: "var(--ink-primary)" }}>
              {g.label}
            </div>
            <div className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
              {g.detail}
            </div>
          </div>
        ))
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Btn
          kind="dangerFill"
          disabled={!canRefund || !detail.refundable}
          tooltip={!canRefund ? "Admin only" : (detail.refundBlockedReason ?? undefined)}
          onClick={() => setDialog(true)}
        >
          Refund {detail.amountLabel}
        </Btn>
        {detail.refundBlockedReason && (
          <span className="text-[12px]" style={{ color: "var(--ink-tertiary)" }}>
            {detail.refundBlockedReason}
          </span>
        )}
      </div>

      {dialog && (
        <Modal
          title={`Refund ${detail.amountLabel}?`}
          onClose={() => {
            setDialog(false);
            setError(null);
          }}
          actions={
            <>
              <Btn
                kind="outline"
                onClick={() => {
                  setDialog(false);
                  setError(null);
                }}
              >
                Cancel
              </Btn>
              <Btn kind="dangerFill" disabled={busy || reason.trim().length < 5} onClick={refund}>
                {busy ? "Refunding…" : "Refund"}
              </Btn>
            </>
          }
        >
          <NoteBlock tone="warning">
            The full amount goes back and everything it bought is revoked in the same path — the plan
            ends and anything published under it is unpublished. Razorpay is called first, so if the
            gateway refuses, nothing here changes.
          </NoteBlock>
          {detail.grants.length > 0 && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              Being revoked: {detail.grants.map((g) => g.label).join(" · ")}
            </p>
          )}
          <div className="mt-3">
            <TextArea value={reason} onChange={setReason} height={60} placeholder="Reason — the user sees it and it is logged…" />
          </div>
          {error && (
            <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
              {error}
            </p>
          )}
        </Modal>
      )}

      <AdminToast message={toast} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-t py-[6px]" style={{ borderColor: "var(--divider)" }}>
      <div className="w-[140px] flex-none text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        {label}
      </div>
      <div className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--ink-primary)" }}>
        {value}
      </div>
    </div>
  );
}
