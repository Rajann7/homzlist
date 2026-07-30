"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { AutoFlagAppeal, RejectLockAppeal } from "@/lib/admin/appeals";
import { Initials, Thumb } from "./queueBits";
import { Badge, Btn, Modal, NoteBlock, SecHead, TextArea } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A8 — Appeals queue (Doc5 A8 / designs `appealsEl`).
 *
 * Two tabs because they are two different jobs. The auto-flag card shows the
 * flagged text with the match highlighted and the user's explanation quoted; the
 * reopen card shows the full rejection timeline before offering the one action
 * that can free a locked listing.
 */

interface Props {
  tab: "flag" | "reopen";
  counts: { flag: number; reopen: number };
  flagAppeals: AutoFlagAppeal[];
  reopenAppeals: RejectLockAppeal[];
  canDecide: boolean;
  decideTooltip: string;
}

export function AppealsQueue({ tab, counts, flagAppeals, reopenAppeals, canDecide, decideTooltip }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { id: string; action: string; title: string; note: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  const decide = async (id: string, action: string, msg: string, note?: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/appeals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(
          j?.error?.details?.notLocked
            ? "This item is not locked any more — someone already reopened it."
            : j?.error?.code === "LISTING_STATE_LOCKED"
              ? "This appeal was already decided."
              : j?.error?.code === "FORBIDDEN"
                ? "Your role cannot decide on queue items."
                : "That didn't go through. Try again.",
        );
        return;
      }
      setConfirm(null);
      show(msg);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { key: "flag" as const, label: "Auto-flag appeals", count: counts.flag },
    { key: "reopen" as const, label: "Reject-lock reopens", count: counts.reopen },
  ];

  const rows = tab === "flag" ? flagAppeals : reopenAppeals;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Appeals queue
        </h1>
      </div>

      <div className="mb-[14px] flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--divider)" }}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => router.push(`/queues/appeals?tab=${t.key}`)}
              className="flex shrink-0 items-center gap-[6px] px-3 py-[10px] text-[15px] font-semibold"
              style={{
                color: on ? "var(--ink-primary)" : "var(--ink-tertiary)",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
              }}
            >
              {t.label}
              <span className="text-[12px]" style={{ color: "var(--ink-tertiary)" }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mb-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="inbox" size={96} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            No appeals waiting
          </p>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            {tab === "flag"
              ? "Nobody is disputing an auto-flag right now."
              : "No locked listing is waiting to be reopened."}
          </p>
        </div>
      ) : tab === "flag" ? (
        flagAppeals.map((a) => (
          <FlagCard
            key={a.id}
            appeal={a}
            canDecide={canDecide}
            decideTooltip={decideTooltip}
            busy={busy}
            onDismiss={() => decide(a.id, "dismiss_flag", "Flag dismissed · content restored")}
            onUphold={() => setConfirm({ id: a.id, action: "uphold_flag", title: "Uphold this flag?", note: "" })}
          />
        ))
      ) : (
        reopenAppeals.map((a) => (
          <ReopenCard
            key={a.id}
            appeal={a}
            canDecide={canDecide}
            decideTooltip={decideTooltip}
            busy={busy}
            onUnlock={() => setConfirm({ id: a.id, action: "unlock", title: "Unlock this listing?", note: "" })}
            onKeep={() => setConfirm({ id: a.id, action: "keep_locked", title: "Keep it locked?", note: "" })}
          />
        ))
      )}

      {confirm && (
        <Modal
          title={confirm.title}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Btn>
              <Btn
                kind={confirm.action === "unlock" ? "primary" : "dangerFill"}
                disabled={busy}
                onClick={() =>
                  decide(
                    confirm.id,
                    confirm.action,
                    confirm.action === "unlock"
                      ? "Unlocked · poster notified"
                      : confirm.action === "keep_locked"
                        ? "Kept locked"
                        : "Flag upheld",
                    confirm.note || undefined,
                  )
                }
              >
                {busy
                  ? "Working…"
                  : confirm.action === "unlock"
                    ? "Unlock"
                    : confirm.action === "keep_locked"
                      ? "Keep locked"
                      : "Uphold flag"}
              </Btn>
            </>
          }
        >
          <NoteBlock tone={confirm.action === "unlock" ? "accent" : "warning"}>
            {confirm.action === "unlock"
              ? "The poster gets one more re-submission — the listing returns to Changes requested so they can edit it. A further rejection locks it again."
              : confirm.action === "keep_locked"
                ? "The listing stays locked and the poster is told the appeal was not accepted."
                : "The bio stays hidden from other people. The poster is told they can edit it to make it visible again."}
          </NoteBlock>
          <div className="mt-3">
            <TextArea
              value={confirm.note}
              onChange={(v) => setConfirm((c) => (c ? { ...c, note: v } : c))}
              placeholder="Note for the record (optional)…"
              height={60}
            />
          </div>
        </Modal>
      )}

      <AdminToast message={toast} />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-3 rounded-12 border p-4"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

function FlagCard({
  appeal,
  canDecide,
  decideTooltip,
  busy,
  onDismiss,
  onUphold,
}: {
  appeal: AutoFlagAppeal;
  canDecide: boolean;
  decideTooltip: string;
  busy: boolean;
  onDismiss: () => void;
  onUphold: () => void;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Initials text={appeal.poster.initials} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {appeal.poster.name}
          </p>
          <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            {appeal.poster.role ?? "—"} · appealed {appeal.appealedLabel}
          </p>
        </div>
        {appeal.withheld ? (
          <Badge bg="var(--warning-soft)" fg="var(--warning)" plain>
            Hidden from public
          </Badge>
        ) : (
          <Badge bg="var(--accent-soft)" fg="var(--accent)" plain>
            Visible
          </Badge>
        )}
      </div>

      {/* The flagged content, with what matched highlighted */}
      <div className="rounded-8 p-3 text-[13px] leading-[1.5]" style={{ background: "var(--surface-2)", color: "var(--ink-primary)" }}>
        {appeal.content ? (
          appeal.content.parts.map((p, i) =>
            p.flag ? (
              <span
                key={i}
                title={p.flag.label}
                className="rounded-[3px] px-[3px] font-semibold"
                style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
              >
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )
        ) : (
          <span style={{ color: "var(--ink-tertiary)" }}>The bio is empty — there is nothing left to review.</span>
        )}
      </div>

      <p className="mb-[6px] mt-[10px] text-[13px]" style={{ color: "var(--ink-secondary)" }}>
        Flag reason: {appeal.flagReason ?? "Not recorded"}
      </p>
      {appeal.reason && (
        <p className="border-l-[3px] pl-3 text-[13px] italic" style={{ borderColor: "var(--border)", color: "var(--ink-secondary)" }}>
          “{appeal.reason}”
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn kind="primary" disabled={!canDecide || busy} tooltip={decideTooltip} onClick={onDismiss}>
          Dismiss flag
        </Btn>
        <Btn kind="outline" disabled={!canDecide || busy} tooltip={decideTooltip} onClick={onUphold}>
          Uphold flag
        </Btn>
      </div>
    </Card>
  );
}

function ReopenCard({
  appeal,
  canDecide,
  decideTooltip,
  busy,
  onUnlock,
  onKeep,
}: {
  appeal: RejectLockAppeal;
  canDecide: boolean;
  decideTooltip: string;
  busy: boolean;
  onUnlock: () => void;
  onKeep: () => void;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-[10px]">
        <Thumb size={40} url={appeal.coverUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {appeal.subjectTitle}
          </p>
          <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            ID #{appeal.subjectShortId} · {appeal.isLocked ? "Locked" : "Not locked"} · {appeal.poster.name} · appealed{" "}
            {appeal.appealedLabel}
          </p>
        </div>
        <Badge
          bg={appeal.isLocked ? "var(--surface-3)" : "var(--accent-soft)"}
          fg={appeal.isLocked ? "var(--ink-tertiary)" : "var(--accent)"}
          plain
        >
          {appeal.rejectCount} of {appeal.maxRejects} rejections
        </Badge>
      </div>

      <SecHead>Rejection history</SecHead>
      {appeal.history.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--ink-tertiary)" }}>
          No rejection was ever logged against this item — the lock may predate the decision log.
        </p>
      ) : (
        appeal.history.map((h, i) => (
          <p key={i} className="py-1 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            <span style={{ color: "var(--ink-tertiary)" }}>{h.dateLabel} — </span>
            {h.reason} by {h.by}
          </p>
        ))
      )}

      {appeal.reason && (
        <p className="mt-[10px] border-l-[3px] pl-3 text-[13px] italic" style={{ borderColor: "var(--border)", color: "var(--ink-secondary)" }}>
          “{appeal.reason}”
        </p>
      )}

      {!appeal.isLocked && (
        <div className="mt-3">
          <NoteBlock tone="info">
            This item is not locked, so there is nothing to reopen. Keeping it locked will simply close the appeal.
          </NoteBlock>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn kind="primary" disabled={!canDecide || busy || !appeal.isLocked} tooltip={decideTooltip} onClick={onUnlock}>
          Unlock &amp; allow resubmit
        </Btn>
        <Btn kind="outline" disabled={!canDecide || busy} tooltip={decideTooltip} onClick={onKeep}>
          Keep locked
        </Btn>
      </div>
    </Card>
  );
}
