"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { BoostQueueRow } from "@/lib/billing/boost";
import type { ActionOption } from "@/lib/admin/reviewConfig";
import { StatusBadge, SlaText, Thumb } from "./queueBits";
import { Badge, Btn, Modal, NoteBlock, RadioList, RightSheet, SecHead } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A6 — Boost queue and its review sheet (Doc5 A6 / designs `boostsEl` +
 * `boostdetail`).
 *
 * This is the screen a paid boost has been waiting for: `boosts` rows sat in
 * `pending_approval` with money already taken, because nothing in the product
 * could approve one (gap A1). Approving starts the window; rejecting refunds.
 *
 * The four eligibility checks are computed server-side and shown pass/fail. They
 * are not a soft display: `approveBoost` re-reads eligibility and the city cap at
 * the moment of approval and refuses, so a subject that went sold while the boost
 * waited is auto-rejected and refunded instead of being sold placement.
 */

interface Props {
  rows: BoostQueueRow[];
  canDecide: boolean;
  decideTooltip: string;
  /** `moderation_action_options` kind=boost_refund — the reject reasons. */
  refundReasons: ActionOption[];
}

export function BoostQueue({ rows, canDecide, decideTooltip, refundReasons }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<BoostQueueRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Boost queue
        </h1>
        <span
          className="rounded-full px-[10px] py-[5px] text-[13px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          {rows.length} pending
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="rocket" size={96} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            No boosts waiting
          </p>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            Every paid boost has been decided.
          </p>
        </div>
      ) : (
        <>
          {/*
            ONE table at every viewport — the design's queueTable is viewport-blind
            (see RequirementsQueue for the full note). The mobile card list that was
            here was invented; the table shows the same rows with the same row-click
            target, and overflow-x-auto keeps every documented column at its
            documented width at 390px instead of reflowing any of them.
          */}
          <div className="overflow-x-auto overflow-y-hidden rounded-12 border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full border-collapse" style={{ background: "var(--surface-1)" }}>
              <thead>
                <tr>
                  {["Boost", "Duration", "Targeting", "Amount", "Requested", "Listing"].map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                  <Th width={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpen(r)}
                    style={{
                      borderTop: "1px solid var(--divider)",
                      cursor: "pointer",
                      borderLeft: `3px solid ${r.hours > 24 ? "var(--error)" : "transparent"}`,
                    }}
                  >
                    <Td>
                      <div className="flex items-center gap-[10px]">
                        <Thumb size={40} url={r.coverUrl} />
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate font-semibold" style={{ color: "var(--ink-primary)" }}>
                            {r.subjectTitle}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                            Boost #{r.id.slice(0, 8)}
                            {r.ownerName ? ` · ${r.ownerName}` : ""}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>{r.durationLabel}</Td>
                    <Td>
                      <span style={{ color: "var(--ink-secondary)" }}>{r.targetLabel}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-[6px]">
                        <span className="font-semibold">{r.price}</span>
                        {/*
                          DEVIATION, kept deliberately (30 Jul 2026): the design's
                          Amount cell only ever draws "Paid ✓" because its rows are
                          mock rows that are always paid. Not-paid is a REAL state
                          here — a boost whose order has no successful payment — and
                          it is the one state where approving costs us placement we
                          were never paid for. It stays, wearing the design's own
                          badge language (errorSoft/error, same shape as Paid ✓).
                        */}
                        {r.payment.verified ? (
                          <Badge bg="var(--accent-soft)" fg="var(--accent)" plain>
                            Paid ✓
                          </Badge>
                        ) : (
                          <Badge bg="var(--error-soft)" fg="var(--error)" plain>
                            Not paid
                          </Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <SlaText sla={sla(r.hours)} text={ageText(r.hours)} />
                    </Td>
                    <Td>{r.subjectStatus ? <StatusBadge label={r.subjectStatus} /> : "—"}</Td>
                    <Td>
                      <span style={{ color: "var(--ink-tertiary)" }}>
                        <Icon name="chevron-right" size={16} />
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <BoostSheet
          row={open}
          canDecide={canDecide}
          decideTooltip={decideTooltip}
          refundReasons={refundReasons}
          onClose={() => setOpen(null)}
          onDone={(msg) => {
            setOpen(null);
            show(msg);
            router.refresh();
          }}
        />
      )}

      <AdminToast message={toast} />
    </div>
  );
}

function sla(hours: number): "ok" | "warn" | "over" {
  if (hours > 24) return "over";
  if (hours >= 12) return "warn";
  return "ok";
}

function ageText(hours: number): string {
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function BoostSheet({
  row,
  canDecide,
  decideTooltip,
  refundReasons,
  onClose,
  onDone,
}: {
  row: BoostQueueRow;
  canDecide: boolean;
  decideTooltip: string;
  refundReasons: ActionOption[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [dialog, setDialog] = useState<null | "approve" | "refund">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(refundReasons[0]?.value ?? "");

  const failing = row.checks.filter((c) => !c.pass);

  const post = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/boosts/${row.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const d = j?.error?.details ?? j?.error ?? {};
        setError(
          d.autoRejected
            ? "The boosted item is no longer live, so this boost was rejected and the refund queued automatically."
            : d.cityCapReached
              ? "This city has already reached its live-boost cap. Approve it once one of those ends."
              : j?.error?.code === "FORBIDDEN"
                ? "Your role cannot decide on queue items."
                : "This boost was already decided.",
        );
        return;
      }
      setDialog(null);
      // Consecutive queueing is Doc2 §13 and the admin needs to know it happened
      // — "approved" reads as "live now" otherwise.
      const queued = j.data?.queuedAfter;
      onDone(queued ? `${msg} · queued to start after the boost already running on this item` : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <RightSheet
        title={`Boost #${row.id.slice(0, 8)}`}
        onClose={onClose}
        actions={
          <>
            <Btn kind="danger" disabled={!canDecide || busy} tooltip={decideTooltip} onClick={() => setDialog("refund")}>
              Reject &amp; refund
            </Btn>
            <Btn
              kind="primary"
              style={{ flex: 1 }}
              disabled={!canDecide || busy}
              tooltip={decideTooltip}
              onClick={() => setDialog("approve")}
            >
              Approve boost
            </Btn>
          </>
        }
      >
        {/* Promoted-card preview — what a buyer will see in the feed */}
        <div className="relative overflow-hidden rounded-12 border" style={{ borderColor: "var(--border)" }}>
          <div
            className="h-[150px]"
            style={{
              background: row.coverUrl
                ? `center/cover no-repeat url(${JSON.stringify(row.coverUrl)})`
                : "repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2) 10px,var(--surface-3) 10px,var(--surface-3) 20px)",
            }}
          />
          <span
            className="absolute left-[10px] top-[10px] rounded-4 px-2 py-[3px] text-[11px] font-bold uppercase tracking-[0.3px] text-white"
            style={{ background: "rgba(0,0,0,.62)" }}
          >
            Promoted
          </span>
          <div className="p-3">
            <p className="text-[16px] font-bold" style={{ color: "var(--ink-primary)" }}>
              {row.subjectPrice ?? "—"}
            </p>
            <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              {row.subjectTitle}
            </p>
          </div>
        </div>

        <SecHead>Payment</SecHead>
        <div className="rounded-8 p-3 text-[13px]" style={{ background: "var(--surface-2)" }}>
          {row.payment.verified ? (
            <>
              <p style={{ color: "var(--ink-primary)" }}>
                {row.payment.ref ?? "payment on file"}
                {row.payment.method ? ` · ${row.payment.method.toUpperCase()}` : ""} · {row.price} · verified ✓
              </p>
              {row.payment.id && (
                <a href={`/payments/${row.payment.id}`} className="mt-1 inline-block text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
                  Open payment →
                </a>
              )}
            </>
          ) : (
            <p style={{ color: "var(--error)" }}>
              No successful payment is recorded against this boost&apos;s order. Do not approve it.
            </p>
          )}
        </div>

        {/* The design's Targeting block is Area + Duration, nothing else. The
            "Requested" and "Bought by" rows that used to follow are both already
            columns of the queue table this sheet opened from — age in the
            Requested column, the buyer under the boost title. */}
        <SecHead>Targeting</SecHead>
        <Row label="Area" value={row.targetLabel} />
        <Row label="Duration" value={`${row.durationLabel} (${row.durationDays} days)`} />

        <SecHead>Eligibility checks</SecHead>
        {row.checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 py-[5px] text-[13px]">
            <span style={{ color: c.pass ? "var(--accent)" : "var(--error)" }}>
              <Icon name={c.pass ? "check" : "close"} size={16} />
            </span>
            <span style={{ color: "var(--ink-primary)" }}>{c.label}</span>
          </div>
        ))}
        {/* No open-reports NoteBlock: the design's fourth check IS the report
            state, and `boostChecks` already renders it as
            "N open reports" with a failing tick when there are any. */}

        {error && (
          <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
            {error}
          </p>
        )}
      </RightSheet>

      {dialog === "approve" && (
        <Modal
          title="Approve boost?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setDialog(null)}>
                Cancel
              </Btn>
              <Btn kind="primary" disabled={busy} onClick={() => post({ action: "approve" }, "Boost approved")}>
                {busy ? "Approving…" : "Approve boost"}
              </Btn>
            </>
          }
        >
          <p className="text-[13px] leading-[1.5]" style={{ color: "var(--ink-secondary)" }}>
            It starts immediately and runs for {row.durationDays} days. If this item already has a boost running, this
            one starts when that one ends.
          </p>
          {failing.length > 0 && (
            <div className="mt-3">
              <NoteBlock tone="warning">
                {failing.length === 1 ? "One check has not passed" : `${failing.length} checks have not passed`}:{" "}
                {failing.map((c) => c.label).join("; ")}. Eligibility and the city cap are re-checked on approval and
                will refuse if they still fail.
              </NoteBlock>
            </div>
          )}
        </Modal>
      )}

      {dialog === "refund" && (
        <Modal
          title="Reject &amp; refund boost?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setDialog(null)}>
                Cancel
              </Btn>
              <Btn
                kind="dangerFill"
                disabled={busy || !reason}
                onClick={() => post({ action: "reject_refund", reasonCode: reason }, "Refund queued")}
              >
                {busy ? "Queueing…" : "Reject & refund"}
              </Btn>
            </>
          }
        >
          <RadioList
            name="refund-reason"
            value={reason}
            onChange={setReason}
            options={refundReasons.map((o) => ({ value: o.value, label: o.label }))}
          />
          <div className="mt-3">
            <NoteBlock tone="accent">
              {row.price} will be refunded automatically within 5–7 days and the poster notified.
            </NoteBlock>
          </div>
        </Modal>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-t py-[6px]" style={{ borderColor: "var(--divider)" }}>
      <div className="w-[120px] flex-none text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        {label}
      </div>
      <div className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--ink-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, width }: { children?: React.ReactNode; width?: number }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink-secondary)",
        background: "var(--surface-2)",
        whiteSpace: "nowrap",
        width,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return (
    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink-primary)", verticalAlign: "middle" }}>
      {children}
    </td>
  );
}
