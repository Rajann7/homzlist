"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { ReviewDetail, ReviewField } from "@/lib/admin/review";
import type { FlaggedText } from "@/lib/admin/textFlags";
import { RiskBadge, Initials } from "./queueBits";
import {
  Badge,
  Btn,
  Chip,
  DocViewer,
  Field,
  Modal,
  NoteBlock,
  RadioList,
  RightSheet,
  SecHead,
  SheetMenu,
  Select,
  TextArea,
} from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A4 — Review detail (Doc5 A4 / designs P13 `reviewEl`).
 *
 * Two columns: the listing as a USER will see it on the left, everything a
 * reviewer needs to judge it on the right. The left column is the point of the
 * screen — "This is exactly what users will see" — so it renders from the same
 * server DTO fields the public detail screen uses, not from a summary.
 *
 * Keyboard is part of the design, not a nicety: A approve · R reject · → next.
 * They are ignored while a dialog is open or a field has focus, so typing a
 * reject reason cannot approve the listing.
 */

interface Props {
  detail: ReviewDetail;
  canDecide: boolean;
  /** "Admin only" when the seat cannot decide — the design's disabled tooltip. */
  decideTooltip: string;
  basePath: string;
  /** homzlist.com origin, for "Open in user view". */
  siteUrl: string;
  assignment: { assignedTo: string; assignedToName: string } | null;
  seats: Array<{ id: string; name: string; level: string }>;
}

type Overlay = null | "approve" | "reject" | "changes" | "more" | "doc" | "risk" | "assign" | "note";

export function ReviewScreen({ detail, canDecide, decideTooltip, basePath, siteUrl, assignment, seats }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"card" | "full">("card");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sop, setSop] = useState<Record<string, boolean>>({});

  const lockedByOther = Boolean(detail.lock && !detail.lock.mine);
  const readOnly = lockedByOther || !canDecide;

  const nextHref = detail.position.nextId ? `${basePath}/${detail.position.nextId}` : null;
  const prevHref = detail.position.prevId ? `${basePath}/${detail.position.prevId}` : null;

  const show = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  /**
   * Auto-advance: the design approves and lands on the next item. When the queue
   * has nothing left it returns to the list rather than sitting on a decided row.
   */
  const advance = useCallback(() => {
    if (nextHref) router.push(nextHref);
    else router.push(basePath);
  }, [nextHref, router, basePath]);

  // ---- the lock, held while the panel is open ------------------------------
  // Doc3 §1.4: taking it on open is what stops two admins reviewing the same
  // item; refreshing it is what stops a closed tab freezing one for ten minutes.
  const decided = useRef(false);
  useEffect(() => {
    if (readOnly) return;
    const post = (action: string) =>
      fetch(`/api/v1/admin/review/${detail.subject}/${detail.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
        cache: "no-store",
        keepalive: action === "unlock",
      }).catch(() => {});

    void post("lock");
    const beat = window.setInterval(() => void post("lock"), 4 * 60_000);
    return () => {
      window.clearInterval(beat);
      // A decision already released it; releasing twice would be harmless but
      // this keeps the intent readable.
      if (!decided.current) void post("unlock");
    };
  }, [detail.subject, detail.id, readOnly]);

  // ---- decisions -----------------------------------------------------------
  const decide = useCallback(
    async (body: Record<string, unknown>, okMsg: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(`/api/v1/admin/review/${detail.subject}/${detail.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          const code = j?.error?.code ?? "SERVER_ERROR";
          setError(
            code === "LISTING_STATE_LOCKED"
              ? j?.error?.details?.heldBy
                ? `${j.error.details.heldBy} is reviewing this item.`
                : "This item was already decided by someone else."
              : code === "FORBIDDEN"
                ? "Your role cannot decide on queue items."
                : "That didn't go through. Try again.",
          );
          return false;
        }
        decided.current = true;
        setOverlay(null);
        show(okMsg);
        advance();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [detail.subject, detail.id, advance, show],
  );

  // ---- keyboard (A / R / →) ------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlay || readOnly || busy) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === "a") {
        e.preventDefault();
        setOverlay("approve");
      } else if (k === "r") {
        e.preventDefault();
        setOverlay("reject");
      } else if (e.key === "ArrowRight" && nextHref) {
        e.preventDefault();
        router.push(nextHref);
      } else if (e.key === "ArrowLeft" && prevHref) {
        e.preventDefault();
        router.push(prevHref);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay, readOnly, busy, nextHref, prevHref, router]);

  const subjectWord = detail.subject === "listing" ? "listing" : "requirement";

  return (
    <div>
      {/* ---------------------------------------------------------- top bar */}
      <div className="mb-4 flex flex-wrap items-center gap-[10px]">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Review #{detail.shortId}
        </h1>
        <span className="text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
          {detail.position.index + 1} of {detail.position.total}
        </span>
        <IconBtn icon="chevron-left" label="Previous" onClick={() => prevHref && router.push(prevHref)} disabled={!prevHref} />
        <IconBtn icon="chevron-right" label="Next" onClick={() => nextHref && router.push(nextHref)} disabled={!nextHref} />
        {/* Design: 11px ink3 on surface-2, radius 6, padding 5px 8px, monospace. */}
        <span
          className="rounded-6 px-2 py-[5px] font-mono text-[11px]"
          style={{ background: "var(--surface-2)", color: "var(--ink-tertiary)" }}
        >
          A approve · R reject · → next
        </span>
        <div className="flex-1" />
        <IconBtn icon="close" label="Back to queue" onClick={() => router.push(basePath)} />
      </div>

      {/* ------------------------------------------------------ lock banner */}
      {lockedByOther && (
        <div
          className="mb-4 flex flex-wrap items-center gap-[10px] rounded-8 px-[14px] py-[10px]"
          style={{ background: "var(--surface-3)" }}
        >
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="lock" size={18} />
          </span>
          <span className="flex-1 text-[13px]" style={{ color: "var(--ink-primary)" }}>
            {detail.lock!.lockedByName} is reviewing this {subjectWord} ({lockAge(detail.lock!.lockedAt)})
          </span>
          <button
            type="button"
            onClick={advance}
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Skip to next
          </button>
        </div>
      )}

      {/*
        The role-gate banner and the "locked after 3 rejections" banner that used to
        sit here are gone — neither is in the design. The role gate is still enforced:
        the action bar's buttons are disabled and carry the design's own
        "Admin only" tooltip, which is how the design expresses it everywhere else.
      */}

      {/* Design: `gridTemplateColumns: twoCol ? '3fr 2fr' : '1fr'` where
          `twoCol = !mobile && !tablet` — two columns at DESKTOP ONLY. */}
      <div className="grid items-start gap-6 desktop:grid-cols-[3fr_2fr]">
        {/* ---------- LEFT: the user's view ---------- */}
        <div>
          <div
            className="mb-3 inline-flex rounded-full p-[3px]"
            style={{ background: "var(--surface-2)" }}
          >
            {(["card", "full"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="rounded-full px-4 py-[6px] text-[13px] font-semibold"
                style={{
                  background: tab === t ? "var(--surface-1)" : "transparent",
                  color: tab === t ? "var(--ink-primary)" : "var(--ink-tertiary)",
                  boxShadow: tab === t ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                }}
              >
                {t === "card" ? "Feed card" : detail.subject === "listing" ? "Full listing" : "Full requirement"}
              </button>
            ))}
          </div>
          <p className="mb-2 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            This is exactly what users will see.
          </p>
          {tab === "card" ? (
            <FeedCardPreview detail={detail} />
          ) : (
            <FullPreview detail={detail} />
          )}
        </div>

        {/* ---------- RIGHT: the review panel ---------- */}
        <div style={{ opacity: lockedByOther ? 0.6 : 1, pointerEvents: lockedByOther ? "none" : "auto" }}>
          <SecHead>Risk</SecHead>
          <div className="rounded-8 p-[14px]" style={{ background: "var(--error-soft)" }}>
            <div className="mb-[10px]">
              <RiskBadge risk={detail.risk} />
            </div>
            {/* Design: one reason row per finding — badge, then rows, then the link.
                A zero-score item simply has no rows; the design has no empty-state
                sentence here, so there isn't one. */}
            {detail.risk.reasons.map((r) => (
              <div key={r.code} className="mb-[5px] flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                <span style={{ color: "var(--error)" }}>
                  <Icon name="alert" size={14} />
                </span>
                <span className="flex-1">{r.label}</span>
                <span className="font-bold" style={{ color: "var(--error)" }}>
                  +{r.points}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOverlay("risk")}
              className="text-[11px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              How scoring works
            </button>
          </div>

          <SecHead>Submitted fields</SecHead>
          <div>
            {detail.fields.map((f) => (
              <FieldRow key={f.key} field={f} onNote={() => !readOnly && setOverlay("changes")} />
            ))}
          </div>

          {/* Report context — only when there really are open reports */}
          {detail.reports && (
            <div className="mt-4 rounded-8 p-3" style={{ background: "var(--error-soft)" }}>
              <div className="mb-2 flex items-center gap-2">
                <span style={{ color: "var(--error)" }}>
                  <Icon name="flag" size={18} />
                </span>
                <span className="text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                  This {subjectWord} was reported {detail.reports.count} {detail.reports.count === 1 ? "time" : "times"}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-[6px]">
                {detail.reports.reasons.map((r) => (
                  <Badge key={r.reason} bg="var(--error-soft)" fg="var(--error)" plain style={{ border: "1px solid var(--error)" }}>
                    {r.reason}
                    {r.count > 1 ? ` ×${r.count}` : ""}
                  </Badge>
                ))}
              </div>
              <button
                type="button"
                onClick={() => router.push("/queues/reports")}
                className="text-[12px] font-semibold"
                style={{ color: "var(--accent)" }}
              >
                Open reports →
              </button>
            </div>
          )}

          <SecHead>Location</SecHead>
          <div className="flex items-start gap-[6px] text-[13px]" style={{ color: "var(--ink-primary)" }}>
            <span className="mt-[2px] shrink-0" style={{ color: "var(--ink-tertiary)" }}>
              <Icon name="pin" size={16} />
            </span>
            <span>{detail.locationTrail.length ? detail.locationTrail.join(" › ") : "No location saved"}</span>
          </div>

          {detail.doc && (
            <>
              <SecHead>Ownership document</SecHead>
              <div className="rounded-8 p-3" style={{ background: "var(--surface-2)" }}>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOverlay("doc")}
                    className="grid h-20 w-16 shrink-0 place-items-center rounded-6"
                    style={{
                      background:
                        "repeating-linear-gradient(135deg,var(--surface-3),var(--surface-3) 6px,var(--border) 6px,var(--border) 12px)",
                      color: "var(--ink-tertiary)",
                    }}
                    aria-label="Open the document"
                  >
                    <Icon name="file" size={24} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="mb-[6px] text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                      Check the name and address against the submitted fields.
                    </p>
                    <DocRow label="Doc type" value={detail.doc.typeLabel ?? "—"} />
                    <DocRow
                      label="Name on doc"
                      value={detail.doc.nameOnDoc ?? "Not captured at upload — read it from the scan"}
                    />
                    <DocRow label="Name on account" value={detail.doc.nameOnAccount} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-[6px]">
                  {detail.doc.mismatch === true && (
                    <Badge bg="var(--warning-soft)" fg="var(--warning)" plain>
                      ⚠ Name mismatch
                    </Badge>
                  )}
                  <span className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    Co-ownership and POA are normal — see SOP
                  </span>
                </div>
              </div>
            </>
          )}

          <SecHead>Poster</SecHead>
          <PosterPanel detail={detail} />

          <SecHead>Prior history</SecHead>
          <div className="text-[11px] leading-[1.8]" style={{ color: "var(--ink-tertiary)" }}>
            {detail.history.length === 0 ? (
              <p>No prior decisions — this is a first submission.</p>
            ) : (
              detail.history.map((h, i) => (
                <div key={`${h.at}-${i}`}>
                  {h.dateLabel} — {h.text}
                </div>
              ))
            )}
            {detail.rejects.count > 0 && (
              <div className="mt-[6px]">
                <Badge bg="var(--warning-soft)" fg="var(--warning)" plain>
                  {detail.rejects.count} of {detail.rejects.max} rejections used
                </Badge>
              </div>
            )}
          </div>

          <SecHead>SOP checklist</SecHead>
          <div className="rounded-8 p-3" style={{ background: "var(--surface-2)" }}>
            <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              Review checklist
            </p>
            {detail.sop.map((item) => (
              <label
                key={item.id}
                className="mb-[7px] flex cursor-pointer items-start gap-2 text-[11px]"
                style={{ color: "var(--ink-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(sop[item.id])}
                  onChange={() => setSop((s) => ({ ...s, [item.id]: !s[item.id] }))}
                  className="mt-[1px]"
                  style={{ accentColor: "var(--accent)" }}
                />
                {item.label}
              </label>
            ))}
          </div>

          {error && (
            <p className="mt-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
              {error}
            </p>
          )}

          {/* ------------------------------------------------- action bar */}
          <div
            className="sticky bottom-0 mt-5 flex gap-2 border-t pb-1 pt-3"
            style={{ background: "var(--bg-page)", borderColor: "var(--divider)" }}
          >
            <Btn kind="primary" style={{ flex: 1 }} disabled={readOnly || busy} tooltip={decideTooltip} onClick={() => setOverlay("approve")}>
              Approve
            </Btn>
            <Btn kind="warn" style={{ flex: 1 }} disabled={readOnly || busy} tooltip={decideTooltip} onClick={() => setOverlay("changes")}>
              Request changes
            </Btn>
            <Btn kind="danger" style={{ flex: 1 }} disabled={readOnly || busy} tooltip={decideTooltip} onClick={() => setOverlay("reject")}>
              Reject
            </Btn>
            <button
              type="button"
              onClick={() => setOverlay("more")}
              aria-label="More actions"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-8 border"
              style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-secondary)" }}
            >
              <Icon name="more" size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- overlays */}
      {overlay === "approve" && (
        <ApproveDialog detail={detail} busy={busy} onClose={() => setOverlay(null)} onConfirm={() => decide({ action: "approve" }, "Approved · next in queue")} />
      )}
      {overlay === "reject" && (
        <RejectDialog
          detail={detail}
          busy={busy}
          onClose={() => setOverlay(null)}
          onConfirm={(reasonCode, reasonText) => decide({ action: "reject", reasonCode, reasonText }, "Rejected")}
        />
      )}
      {overlay === "changes" && (
        <ChangesSheet
          detail={detail}
          busy={busy}
          onClose={() => setOverlay(null)}
          onConfirm={(notes) => decide({ action: "request_changes", notes }, "Change request sent")}
        />
      )}
      {overlay === "risk" && (
        <Modal title={`Risk score · ${detail.risk.bandLabel} · ${detail.risk.score}`} onClose={() => setOverlay(null)}>
          <div className="text-[12px] leading-[1.9]" style={{ color: "var(--ink-secondary)" }}>
            {detail.risk.reasons.length === 0 ? (
              <p>Nothing flagged — this item scored zero.</p>
            ) : (
              detail.risk.reasons.map((r) => (
                <div key={r.code}>
                  {r.label} +{r.points}
                </div>
              ))
            )}
          </div>
          <p className="mt-3 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            Scoring is rule-based, never a model: new account +2, prior rejection +2, number pattern in text +3,
            reported +3. 0–2 is Low, 3–5 Medium, 6+ High.
          </p>
        </Modal>
      )}
      {overlay === "doc" && detail.doc && (
        <DocViewer
          title={`${detail.doc.typeLabel ?? "Document"}${detail.doc.uploadedLabel ? ` · uploaded ${detail.doc.uploadedLabel}` : ""}`}
          url={detail.doc.url}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "more" && (
        <SheetMenu
          onClose={() => setOverlay(null)}
          items={[
            {
              label: "Open in user view ↗",
              onSelect: () => {
                const path = detail.subject === "listing" ? `/property/${detail.id}` : `/requirements/${detail.id}`;
                window.open(`${siteUrl}${path}`, "_blank", "noopener");
              },
            },
            {
              label: assignment ? `Reassign (now ${assignment.assignedToName})` : "Assign to another admin",
              onSelect: () => setOverlay("assign"),
              disabled: !canDecide || seats.length === 0,
              tooltip: seats.length === 0 ? "No other active admin" : decideTooltip,
            },
            { label: "Add internal note", onSelect: () => setOverlay("note") },
            {
              label: "Skip for now",
              onSelect: () => {
                void fetch(`/api/v1/admin/review/${detail.subject}/${detail.id}`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ action: "unlock" }),
                  cache: "no-store",
                });
                decided.current = true;
                advance();
              },
            },
          ]}
        />
      )}
      {overlay === "assign" && (
        <AssignDialog
          detail={detail}
          seats={seats}
          onClose={() => setOverlay(null)}
          onDone={(name) => {
            setOverlay(null);
            show(`Assigned to ${name}`);
            router.refresh();
          }}
        />
      )}
      {overlay === "note" && (
        <NoteDialog
          detail={detail}
          onClose={() => setOverlay(null)}
          onDone={() => {
            setOverlay(null);
            show("Internal note added");
          }}
        />
      )}

      <AdminToast message={toast} />
    </div>
  );
}

// ------------------------------------------------------------------ sub-parts

function lockAge(lockedAt: string): string {
  const mins = Math.max(1, Math.floor((Date.now() - new Date(lockedAt).getTime()) / 60_000));
  return mins < 60 ? `started ${mins} min ago` : `started ${Math.floor(mins / 60)}h ago`;
}

function IconBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: "chevron-left" | "chevron-right" | "close";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-8 border disabled:cursor-default"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface-1)",
        color: disabled ? "var(--ink-disabled)" : "var(--ink-secondary)",
      }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** Text with the number-detection spans highlighted, exactly as the design draws. */
function Flagged({ text }: { text: FlaggedText }) {
  return (
    <>
      {text.parts.map((p, i) =>
        p.flag ? (
          <span
            key={i}
            title={`${p.flag.label} — ${p.flag.action === "block" ? "blocked pattern" : "flagged pattern"}`}
            className="rounded-[3px] px-[3px] font-semibold"
            style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The design's submitted-field row: a 110px ink3 label, the value, and a single
 * note icon at 16px in ink3 at 60% opacity whose tooltip reads "Add a note to
 * this field".
 *
 * A field that ALREADY carries a note from a previous "request changes" has no
 * separate treatment in the design, and inventing a chip for it moved the layout.
 * So the existing note travels through the icon the design already draws — its
 * tooltip quotes the note and the icon tints to warning. No extra element, no
 * shift, and the reviewer can still see what was asked for.
 */
function FieldRow({ field, onNote }: { field: ReviewField; onNote: () => void }) {
  const isLong = field.key === "description" || field.key === "notes";

  const noteIcon = (
    <button
      type="button"
      onClick={onNote}
      title={field.note ? `Note the poster is seeing: “${field.note}”` : "Add a note to this field"}
      aria-label={field.note ? `Edit the note on ${field.label}` : `Add a note to ${field.label}`}
      className="flex-none"
      style={{ color: field.note ? "var(--warning)" : "var(--ink-tertiary)", opacity: field.note ? 1 : 0.6 }}
    >
      <Icon name="edit" size={16} />
    </button>
  );

  if (isLong) {
    return (
      <div className="border-t py-[7px]" style={{ borderColor: "var(--divider)" }}>
        <div className="mb-1 flex items-start gap-2">
          <p className="flex-1 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            {field.label}
          </p>
          {noteIcon}
        </div>
        <p className="text-[13px] leading-[1.5]" style={{ color: "var(--ink-primary)" }}>
          {field.flagged ? <Flagged text={field.flagged} /> : field.value}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 border-t py-[7px]" style={{ borderColor: "var(--divider)" }}>
      <div className="w-[110px] flex-none text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        {field.label}
      </div>
      <div className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--ink-primary)", fontWeight: field.warn ? 600 : 400 }}>
        {field.flagged ? <Flagged text={field.flagged} /> : field.value}
      </div>
      {noteIcon}
    </div>
  );
}

function DocRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="mb-[3px] text-[12px]">
      <span style={{ color: "var(--ink-tertiary)" }}>{label}: </span>
      <span style={{ color: "var(--ink-primary)" }}>{value}</span>
    </p>
  );
}

function PosterPanel({ detail }: { detail: ReviewDetail }) {
  const p = detail.poster;
  return (
    <div className="rounded-8 p-3" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-[10px]">
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <Initials text={p.initials} size={40} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-[5px] truncate text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {p.name}
            {(p.idVerified || p.reraVerified) && (
              <span style={{ color: "var(--accent)" }}>
                <Icon name="verified" size={15} />
              </span>
            )}
          </p>
          {p.role && (
            <div className="mt-[3px]">
              <Badge bg="var(--surface-3)" fg="var(--ink-tertiary)" plain>
                {p.role}
              </Badge>
            </div>
          )}
        </div>
        {p.isNew && (
          <Badge bg="var(--warning-soft)" fg="var(--warning)">
            New account
          </Badge>
        )}
      </div>
      <div className="mt-[10px] text-[11px] leading-[1.7]" style={{ color: "var(--ink-tertiary)" }}>
        <div>Registered {p.registeredLabel ?? "—"}</div>
        <div>
          Listings: {p.listings} · Rejections: {p.rejections} · Reports: {p.reports}
        </div>
        {/* Design's third line is exactly "Phone verified ✓ · ID pending" — two
            levels, no RERA line. */}
        <div>
          Phone {p.phoneVerified ? "verified ✓" : "not verified"} · ID{" "}
          {p.idVerified ? "verified ✓" : "pending"}
        </div>
      </div>
      {p.isFirstListing && (
        // Design's wording, verbatim, in an infoSoft block at radius 6.
        <div className="mt-2 rounded-6 p-[10px] text-[11px]" style={{ background: "var(--info-soft)", color: "var(--ink-secondary)" }}>
          First listing from this account — profile photo and bio are shown below for review.
        </div>
      )}
      <a
        href={`/users/${p.id}`}
        className="mt-2 inline-block text-[11px] font-semibold"
        style={{ color: "var(--accent)" }}
      >
        Open user →
      </a>
    </div>
  );
}

// ------------------------------------------------------------------ previews

/**
 * `mobileHeight` exists because the design sizes the carousel per device: the feed
 * card is 260 on mobile and 300 above it, the full listing 240 and 300. Tailwind
 * cannot express a height that changes at one breakpoint from a prop, so the two
 * heights become a CSS custom property the class picks up.
 */
function Carousel({ photos, height, mobileHeight }: { photos: string[]; height: number; mobileHeight: number }) {
  const [idx, setIdx] = useState(0);
  const count = photos.length;
  return (
    <div
      className="relative flex h-[var(--carousel-h-mobile)] items-center justify-center overflow-hidden md:h-[var(--carousel-h)]"
      style={{
        ["--carousel-h" as string]: `${height}px`,
        ["--carousel-h-mobile" as string]: `${mobileHeight}px`,
        background:
          "repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2) 10px,var(--surface-3) 10px,var(--surface-3) 20px)",
      }}
    >
      {count ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photos[idx]} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-mono text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
          no photos uploaded
        </span>
      )}
      {count > 0 && (
        <span
          className="absolute right-[10px] top-[10px] rounded-full px-2 py-[2px] text-[11px] font-semibold text-white"
          style={{ background: "rgba(0,0,0,.6)" }}
        >
          {idx + 1} / {count}
        </span>
      )}
      {count > 1 && (
        <div className="absolute inset-x-0 bottom-[10px] flex justify-center gap-[5px]">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Photo ${i + 1}`}
              className="h-[6px] rounded-full"
              style={{
                width: i === idx ? 16 : 6,
                background: i === idx ? "#fff" : "rgba(255,255,255,.5)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedCardPreview({ detail }: { detail: ReviewDetail }) {
  const p = detail.preview;
  return (
    <div
      className="mx-auto overflow-hidden rounded-12 border"
      style={{ maxWidth: 380, background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}
    >
      <div className="relative">
        <Carousel photos={p.photos} height={300} mobileHeight={260} />
        <span
          className="absolute left-[10px] top-[10px] rounded-4 px-2 py-[3px] text-[11px] font-bold uppercase tracking-[0.3px] text-white"
          style={{ background: "var(--accent)" }}
        >
          {p.kindLabel}
        </span>
      </div>
      <div className="p-[14px]">
        <p className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          {p.priceLabel}
        </p>
        {p.metaLine && (
          <p className="mt-[2px] text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            {p.metaLine}
          </p>
        )}
        <div className="mt-[6px] flex items-center gap-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="pin" size={15} />
          </span>
          {p.areaLabel ?? "No area set"}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
          <Initials text={detail.poster.initials} size={28} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              {detail.poster.name}
              {(detail.poster.idVerified || detail.poster.reraVerified) && (
                <span style={{ color: "var(--accent)" }}>
                  <Icon name="verified" size={14} />
                </span>
              )}
            </p>
            <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
              {detail.poster.role ?? "—"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {["Save", "View Property", "Inquiry"].map((b, i) => (
            <span
              key={b}
              className="grid h-9 place-items-center rounded-8 text-[13px] font-semibold"
              style={{
                flex: i === 1 ? 2 : 1,
                border: i === 1 ? "none" : "1px solid var(--border)",
                background: i === 1 ? "var(--accent)" : "var(--surface-1)",
                color: i === 1 ? "#fff" : "var(--ink-primary)",
              }}
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FullPreview({ detail }: { detail: ReviewDetail }) {
  const p = detail.preview;
  return (
    <div
      className="mx-auto overflow-hidden rounded-12 border"
      style={{ maxWidth: 520, background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}
    >
      <Carousel photos={p.photos} height={300} mobileHeight={240} />
      <div className="p-4">
        <p className="text-[24px] font-bold" style={{ color: "var(--ink-primary)" }}>
          {p.priceLabel}
        </p>
        <p className="mt-[2px] text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          {p.typeLine}
        </p>
        <div className="mt-[6px] flex items-start gap-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          <span className="mt-[2px] shrink-0" style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="pin" size={15} />
          </span>
          {p.fullLocation ?? "No location saved"}
        </div>

        {p.specs.length > 0 && (
          <div
            className="mt-3 grid overflow-hidden rounded-8 border"
            style={{
              gridTemplateColumns: `repeat(${p.specs.length},1fr)`,
              gap: 1,
              background: "var(--divider)",
              borderColor: "var(--divider)",
            }}
          >
            {p.specs.map((s) => (
              <div key={s.label} className="p-[10px] text-center" style={{ background: "var(--surface-1)" }}>
                <p className="text-[15px] font-bold" style={{ color: "var(--ink-primary)" }}>
                  {s.value}
                </p>
                <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {p.amenities.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              Amenities
            </p>
            <div className="flex flex-wrap gap-[6px]">
              {p.amenities.map((a) => (
                <span
                  key={a}
                  className="rounded-full px-[10px] py-1 text-[11px]"
                  style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
                >
                  {a}
                </span>
              ))}
            </div>
          </>
        )}

        <p className="mb-[6px] mt-4 text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
          Description
        </p>
        <p className="text-[13px] leading-[1.5]" style={{ color: "var(--ink-secondary)" }}>
          {p.description.text ? <Flagged text={p.description} /> : "No description written."}
        </p>

        <div
          className="mt-[14px] flex items-start gap-2 rounded-8 p-3 text-[11px]"
          style={{ background: "var(--surface-2)", color: "var(--ink-tertiary)" }}
        >
          <span className="shrink-0">
            <Icon name="shield" size={16} />
          </span>
          Never pay a deposit before visiting. HomzList does not verify property ownership.
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- dialogs

function ApproveDialog({
  detail,
  busy,
  onClose,
  onConfirm,
}: {
  detail: ReviewDetail;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={`Approve this ${detail.subject}?`}
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Approving…" : "Approve"}
          </Btn>
        </>
      }
    >
      <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
        {detail.preview.metaLine || detail.preview.typeLine} · {detail.preview.priceLabel} · {detail.poster.name}
      </p>
      <NoteBlock tone="info">
        {detail.subject === "listing"
          ? "It will go live immediately, generate a 24-hour story and notify the poster."
          : "It will go live immediately, start matching, and notify the poster."}
      </NoteBlock>
    </Modal>
  );
}

function RejectDialog({
  detail,
  busy,
  onClose,
  onConfirm,
}: {
  detail: ReviewDetail;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reasonCode: string, reasonText: string | null) => void;
}) {
  const [code, setCode] = useState(detail.rejectTemplates[0]?.code ?? "");
  const [text, setText] = useState("");
  const isOther = code === "other";
  const valid = Boolean(code) && (!isOther || text.trim().length >= 3);

  return (
    <Modal
      title={`Reject this ${detail.subject}?`}
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="dangerFill" disabled={busy || !valid} onClick={() => onConfirm(code, isOther ? text : null)}>
            {busy ? "Rejecting…" : "Reject"}
          </Btn>
        </>
      }
    >
      <p className="mb-[10px] text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        Choose a reason. The poster is notified.
      </p>
      <RadioList
        name="reject-reason"
        value={code}
        onChange={setCode}
        options={detail.rejectTemplates.map((t) => ({ value: t.code, label: t.label }))}
      />
      {isOther && (
        <div className="mt-2">
          <TextArea value={text} onChange={setText} placeholder="Describe the reason…" height={70} />
        </div>
      )}
      {detail.rejects.nextWouldLock && (
        <div className="mt-3">
          <NoteBlock tone="warning">
            This is rejection {detail.rejects.count + 1} of {detail.rejects.max} — the {detail.subject} will be locked and
            the poster must contact support.
          </NoteBlock>
        </div>
      )}
    </Modal>
  );
}

function ChangesSheet({
  detail,
  busy,
  onClose,
  onConfirm,
}: {
  detail: ReviewDetail;
  busy: boolean;
  onClose: () => void;
  onConfirm: (notes: Record<string, string>) => void;
}) {
  const [active, setActive] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const toggle = (key: string, template: string) => {
    setActive((a) => (a.includes(key) ? a.filter((x) => x !== key) : [...a, key]));
    setNotes((n) => (n[key] ? n : { ...n, [key]: template }));
  };

  const payload = useMemo(
    () => Object.fromEntries(active.map((k) => [k, (notes[k] ?? "").trim()]).filter(([, v]) => v.length > 0)),
    [active, notes],
  );

  return (
    <RightSheet
      title="Request changes"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            kind="primary"
            style={{ flex: 1 }}
            disabled={busy || Object.keys(payload).length === 0}
            onClick={() => onConfirm(payload)}
          >
            {busy ? "Sending…" : "Send change request"}
          </Btn>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-[1.5]" style={{ color: "var(--ink-secondary)" }}>
        Attach notes to the fields that need fixing. The poster sees each note next to that field.
      </p>
      <div className="mb-[14px] flex flex-wrap gap-2">
        {detail.changeFields.map((c) => (
          <Chip key={c.fieldKey} label={c.label} active={active.includes(c.fieldKey)} onClick={() => toggle(c.fieldKey, c.template)} />
        ))}
      </div>
      {active.map((key) => {
        const cfg = detail.changeFields.find((c) => c.fieldKey === key)!;
        return (
          <div key={key} className="mb-3">
            <p className="mb-[6px] text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              {cfg.label}
            </p>
            <TextArea
              value={notes[key] ?? ""}
              onChange={(v) => setNotes((n) => ({ ...n, [key]: v }))}
              height={64}
              placeholder={cfg.template}
            />
          </div>
        );
      })}
      <NoteBlock tone="info">
        This keeps the {detail.subject} pending and does not count as a rejection.
      </NoteBlock>
    </RightSheet>
  );
}

function AssignDialog({
  detail,
  seats,
  onClose,
  onDone,
}: {
  detail: ReviewDetail;
  seats: Array<{ id: string; name: string; level: string }>;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [to, setTo] = useState(seats[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/v1/admin/review/${detail.subject}/${detail.id}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign", to, body: note }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErr("Could not assign it. Try again.");
        return;
      }
      onDone(j.data.assignedToName);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Assign to another admin"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={busy || !to} onClick={submit}>
            {busy ? "Assigning…" : "Assign"}
          </Btn>
        </>
      }
    >
      <Field label="Admin">
        <Select value={to} onChange={setTo} options={seats.map((s) => ({ value: s.id, label: `${s.name} · ${s.level}` }))} />
      </Field>
      <Field label="Note" helper="optional">
        <TextArea value={note} onChange={setNote} placeholder="Why them?" height={60} />
      </Field>
      <NoteBlock tone="info">They get a notification in their bell drawer with a link straight to this item.</NoteBlock>
      {err && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--error)" }}>
          {err}
        </p>
      )}
    </Modal>
  );
}

function NoteDialog({
  detail,
  onClose,
  onDone,
}: {
  detail: ReviewDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/v1/admin/review/${detail.subject}/${detail.id}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "note", body }),
        cache: "no-store",
      });
      if (!r.ok) {
        setErr("Could not save the note.");
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add internal note"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={busy || body.trim().length < 2} onClick={submit}>
            {busy ? "Saving…" : "Save note"}
          </Btn>
        </>
      }
    >
      <TextArea value={body} onChange={setBody} placeholder="Only other admins can see this." height={90} />
      <div className="mt-2">
        <NoteBlock tone="info">Internal notes are never shown to the poster. Your name and the time are recorded.</NoteBlock>
      </div>
    </Modal>
  );
}
