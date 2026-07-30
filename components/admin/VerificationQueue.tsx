"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { VerificationDetail, VerificationRow } from "@/lib/admin/verifications";
import { StatusBadge, Initials } from "./queueBits";
import {
  Badge,
  Btn,
  DocViewer,
  Modal,
  NoteBlock,
  RadioList,
  RightSheet,
  SecHead,
  Shimmer,
  TextInput,
} from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A7 — Verification queue (Doc5 A7 / designs `verificationsEl` + `verifydetail`).
 *
 * Four tabs, a side-by-side document viewer, the entered fields (ID masked, RERA
 * with a portal link), a per-level checklist and three decisions.
 *
 * Approving here IS granting the badge — `verifications.status='approved'` is what
 * every tick in the product reads — so the confirm dialog carries the design's
 * wording note: badges say identity verified, never property verified.
 */

interface Props {
  tabs: ReadonlyArray<{ key: string; label: string }>;
  tab: string;
  counts: Record<string, number>;
  rows: VerificationRow[];
  canDecide: boolean;
  decideTooltip: string;
}

export function VerificationQueue({ tabs, tab, counts, rows, canDecide, decideTooltip }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Verification queue
        </h1>
      </div>

      <div className="mb-[14px] flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--divider)" }}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => router.push(`/queues/verifications?tab=${t.key}`)}
              className="flex shrink-0 items-center gap-[6px] px-3 py-[10px] text-[15px] font-semibold"
              style={{
                color: on ? "var(--ink-primary)" : "var(--ink-tertiary)",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
              }}
            >
              {t.label}
              <span className="text-[12px]" style={{ color: "var(--ink-tertiary)" }}>
                {counts[t.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="py-[60px] text-center text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
          Nothing here.
        </p>
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
                  {["User", "Level", "Submitted", "Docs", "Status"].map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                  <Th width={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    style={{ borderTop: "1px solid var(--divider)", cursor: "pointer" }}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <Initials text={r.initials} size={28} />
                        <div>
                          <p className="font-semibold" style={{ color: "var(--ink-primary)" }}>
                            {r.userName}
                          </p>
                          {r.role && (
                            <div className="mt-[2px]">
                              <Badge bg="var(--surface-2)" fg="var(--ink-tertiary)" plain>
                                {r.role}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <LevelBadge level={r.level} label={r.levelLabel} />
                    </Td>
                    <Td>
                      <span style={{ color: "var(--ink-tertiary)" }}>{r.submittedLabel ?? "—"}</span>
                    </Td>
                    <Td>
                      <span style={{ color: "var(--ink-secondary)" }}>{r.docsLabel}</span>
                    </Td>
                    <Td>
                      <StatusBadge label={r.statusLabel} />
                    </Td>
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

      {openId && (
        <VerificationSheet
          id={openId}
          canDecide={canDecide}
          decideTooltip={decideTooltip}
          onClose={() => setOpenId(null)}
          onDone={(msg) => {
            setOpenId(null);
            show(msg);
            router.refresh();
          }}
        />
      )}

      <AdminToast message={toast} />
    </div>
  );
}

function LevelBadge({ level, label }: { level: "id" | "rera"; label: string }) {
  return level === "rera" ? (
    <Badge bg="var(--info-soft)" fg="var(--info)">
      {label}
    </Badge>
  ) : (
    <Badge bg="var(--surface-2)" fg="var(--ink-secondary)">
      {label}
    </Badge>
  );
}

function VerificationSheet({
  id,
  canDecide,
  decideTooltip,
  onClose,
  onDone,
}: {
  id: string;
  canDecide: boolean;
  decideTooltip: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<null | "grant" | "reject" | "revoke" | "doc">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [reason, setReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      const r = await fetch(`/api/v1/admin/verifications/${id}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (dead) return;
      if (j?.ok) {
        setDetail(j.data.detail);
        setReason(j.data.detail.rejectReasons[0] ?? "");
      } else setError("Could not load this verification.");
    })();
    return () => {
      dead = true;
    };
  }, [id]);

  const post = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/verifications/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(
          j?.error?.code === "LISTING_STATE_LOCKED"
            ? "Someone else already decided this verification."
            : j?.error?.code === "FORBIDDEN"
              ? "Your role cannot decide on queue items."
              : "That didn't go through. Try again.",
        );
        return;
      }
      setDialog(null);
      onDone(msg);
    } finally {
      setBusy(false);
    }
  };

  const isVerified = detail?.status === "approved";

  return (
    <>
      <RightSheet
        title="Verification"
        onClose={onClose}
        actions={
          detail ? (
            isVerified ? (
              <Btn kind="danger" style={{ flex: 1 }} disabled={!canDecide || busy} tooltip={decideTooltip} onClick={() => setDialog("revoke")}>
                Revoke
              </Btn>
            ) : (
              <>
                <Btn kind="danger" style={{ flex: 1 }} disabled={!canDecide || busy || detail.status !== "pending"} tooltip={decideTooltip} onClick={() => setDialog("reject")}>
                  Reject
                </Btn>
                <Btn kind="primary" style={{ flex: 1 }} disabled={!canDecide || busy} tooltip={decideTooltip} onClick={() => setDialog("grant")}>
                  Approve &amp; grant badge
                </Btn>
              </>
            )
          ) : undefined
        }
      >
        {!detail ? (
          <div className="flex flex-col gap-3">
            <Shimmer height={180} />
            <Shimmer height={140} />
            <Shimmer height={100} />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-[10px]">
              <Initials text={detail.initials} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                  {detail.userName}
                </p>
                <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  {detail.role ?? "—"} · submitted {detail.submittedLabel ?? "—"}
                </p>
              </div>
              <LevelBadge level={detail.level} label={detail.levelLabel} />
            </div>

            {/* Document — zoom / rotate / open full screen / download */}
            <div
              className="relative flex h-[180px] items-center justify-center overflow-hidden rounded-12 border"
              style={{
                borderColor: "var(--border)",
                background:
                  "repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2) 10px,var(--surface-3) 10px,var(--surface-3) 20px)",
              }}
            >
              {detail.docUrl ? (
                <button type="button" onClick={() => setDialog("doc")} className="h-full w-full" aria-label="Open the document full screen">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detail.docUrl}
                    alt="Submitted document"
                    className="h-full w-full object-contain"
                    style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transition: "transform .15s ease" }}
                  />
                </button>
              ) : (
                <span className="px-4 text-center text-[12px]" style={{ color: "var(--ink-tertiary)" }}>
                  No document is attached to this request.
                </span>
              )}
              {detail.docUrl && (
                <div className="absolute right-2 top-2 flex gap-1">
                  <DocBtn label="Zoom in" icon="maximize" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
                  <DocBtn label="Rotate" icon="refresh" onClick={() => setRotation((r) => (r + 90) % 360)} />
                </div>
              )}
            </div>

            <SecHead>Entered fields</SecHead>
            {detail.level === "rera" ? (
              <>
                <Row label="RERA number" value={detail.reraNumber ?? "Not provided"} copy={detail.reraNumber} />
                {detail.reraPortalUrl && (
                  <div className="py-[6px]">
                    <a
                      href={detail.reraPortalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] font-semibold"
                      style={{ color: "var(--accent)" }}
                    >
                      Open RERA portal ↗
                    </a>
                  </div>
                )}
                <Row label="Valid till" value={detail.validTill ? formatDate(detail.validTill) : "Not provided"} />
                <Row label="Certificate" value={detail.docType ?? detail.docsLabel} />
              </>
            ) : (
              <>
                <Row label="Doc type" value={detail.docType ?? "Not stated"} />
                <Row label="Name on doc" value={detail.userName} />
                <Row
                  label="Number"
                  value={detail.maskedNumber ?? "Not captured at upload — read it from the document"}
                />
              </>
            )}

            {detail.reason && (
              <div className="mt-3">
                <NoteBlock tone={detail.status === "revoked" ? "error" : "warning"}>
                  Recorded reason: {detail.reason}
                  {detail.reviewedLabel ? ` · ${detail.reviewedLabel}` : ""}
                </NoteBlock>
              </div>
            )}
            {!detail.reason && detail.reviewedLabel && (
              <div className="mt-3">
                <NoteBlock tone="info">Decided by {detail.reviewedLabel}.</NoteBlock>
              </div>
            )}

            <SecHead>Checklist</SecHead>
            {detail.checklist.map((c) => (
              <label key={c.id} className="flex cursor-pointer gap-2 py-1 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
                <input
                  type="checkbox"
                  checked={Boolean(checks[c.id])}
                  onChange={() => setChecks((s) => ({ ...s, [c.id]: !s[c.id] }))}
                  style={{ accentColor: "var(--accent)" }}
                />
                {c.label}
              </label>
            ))}

            {error && (
              <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
                {error}
              </p>
            )}
          </>
        )}
      </RightSheet>

      {dialog === "doc" && detail && (
        <DocViewer
          title={`${detail.docType ?? detail.levelLabel} document · ${detail.userName}`}
          url={detail.docUrl}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "grant" && detail && (
        <Modal
          title={`Grant ${detail.levelLabel} Verified badge to ${detail.userName}?`}
          onClose={() => setDialog(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setDialog(null)}>
                Cancel
              </Btn>
              <Btn kind="primary" disabled={busy} onClick={() => post({ action: "approve" }, "Badge granted")}>
                {busy ? "Granting…" : "Grant badge"}
              </Btn>
            </>
          }
        >
          <NoteBlock tone="info">Badges say identity verified — never property verified.</NoteBlock>
        </Modal>
      )}

      {dialog === "reject" && detail && (
        <Modal
          title={`Reject ${detail.levelLabel} verification?`}
          onClose={() => setDialog(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setDialog(null)}>
                Cancel
              </Btn>
              <Btn kind="dangerFill" disabled={busy || !reason} onClick={() => post({ action: "reject", reason }, "Verification rejected · user notified")}>
                {busy ? "Rejecting…" : "Reject"}
              </Btn>
            </>
          }
        >
          <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
            Reason
          </p>
          <RadioList name="verify-reject" value={reason} onChange={setReason} options={detail.rejectReasons.map((r) => ({ value: r, label: r }))} />
          <div className="mt-3">
            <NoteBlock tone="warning">The user is notified and can re-submit with corrected documents.</NoteBlock>
          </div>
        </Modal>
      )}

      {dialog === "revoke" && detail && (
        <Modal
          title={`Revoke ${detail.levelLabel} verification?`}
          onClose={() => setDialog(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setDialog(null)}>
                Cancel
              </Btn>
              <Btn
                kind="dangerFill"
                disabled={busy || revokeReason.trim().length < 3}
                onClick={() => post({ action: "revoke", reason: revokeReason }, "Verification revoked")}
              >
                {busy ? "Revoking…" : "Revoke"}
              </Btn>
            </>
          }
        >
          <TextInput value={revokeReason} onChange={setRevokeReason} placeholder="Reason…" />
          <div className="mt-3">
            <NoteBlock tone="warning">The badge is removed immediately and the user is notified.</NoteBlock>
          </div>
        </Modal>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function DocBtn({ label, icon, onClick }: { label: string; icon: "maximize" | "refresh"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-[30px] w-[30px] place-items-center rounded-8 border"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-secondary)" }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex border-t py-[6px]" style={{ borderColor: "var(--divider)" }}>
      <div className="w-[120px] flex-none text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        {label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[13px]" style={{ color: "var(--ink-primary)" }}>
        <span className="min-w-0 break-all">{value}</span>
        {copy && (
          <button
            type="button"
            aria-label="Copy"
            title={copied ? "Copied" : "Copy"}
            onClick={() => {
              void navigator.clipboard?.writeText(copy);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0"
            style={{ color: copied ? "var(--accent)" : "var(--ink-tertiary)" }}
          >
            <Icon name={copied ? "check" : "copy"} size={14} />
          </button>
        )}
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
