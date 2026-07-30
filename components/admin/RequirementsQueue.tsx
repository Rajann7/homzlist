"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { QueueRow, QueueTab } from "@/lib/admin/queues";
import type { ReviewDetail } from "@/lib/admin/review";
import { RiskBadge, StatusBadge, SlaText, Initials } from "./queueBits";
import {
  Btn,
  Modal,
  NoteBlock,
  RadioList,
  RightSheet,
  SecHead,
  Shimmer,
  TextArea,
} from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A5 — Requirements queue and its review panel (Doc5 A5 / designs `requirementsEl`
 * + the `reqdetail` right-sheet).
 *
 * A requirement is reviewed in a SHEET, not on its own page, which is the design's
 * call and the right one: there is no photo carousel to study, so the reviewer
 * never leaves the list. The two render tabs are the point of the panel — a
 * requirement is what a broker pays to unlock, so an admin has to see both the
 * unlocked view and the masked one a non-paying broker gets.
 *
 * Every count, row, field, reason and checklist item is server data; nothing on
 * this screen is enumerated in the browser.
 */

interface Props {
  tabs: QueueTab[];
  tab: string;
  counts: Record<string, number>;
  rows: QueueRow[];
  canDecide: boolean;
  decideTooltip: string;
}

export function RequirementsQueue({ tabs, tab, counts, rows, canDecide, decideTooltip }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const activeTab = tabs.find((t) => t.key === tab);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Requirements queue
        </h1>
        <span
          className="rounded-full px-[10px] py-[5px] text-[13px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          {counts[tab] ?? 0} {(activeTab?.label ?? "pending").toLowerCase()}
        </span>
      </div>

      {/*
        DEVIATION, kept on Rajan's call (30 Jul 2026): the design's `requirementsEl`
        has no tabs — heading and table only. Without them a rejected or
        changes-requested requirement is unreachable from the panel, so the feature
        stays and wears the design's OWN tab language instead (identical to A7's and
        A8's strip: gap 4, divider underline, mb 14, items 10px/12px at 15px/600,
        active ink1 with a 2px accent underline, count 12px ink3).
        A3's coloured status dots are dropped — those belong to A3's strip only.
      */}
      <div className="mb-[14px] flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--divider)" }}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => router.push(`/queues/requirements?tab=${t.key}`)}
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
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="inbox" size={96} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            Queue is clear
          </p>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            Every requirement is reviewed.
          </p>
        </div>
      ) : (
        <>
          {/*
            ONE table at every viewport. The design's `queueTable` declares a
            `tablet` flag and never uses it, and A5/A6/A7 all render through it —
            so unlike A3 (which has an explicit `if(mobile)` card branch) these
            screens have no mobile card layout at all. The card list that used to
            sit here was invented; it is gone, and nothing is lost because the
            table shows the same rows with the same row-click target.

            `overflow-x-auto` is the one addition: at 390px the design's own table
            would overflow its frame, and a horizontally scrolling wrapper keeps
            every documented column at its documented width instead of dropping or
            reflowing any of them.
          */}
          <div className="overflow-x-auto overflow-y-hidden rounded-12 border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full border-collapse" style={{ background: "var(--surface-1)" }}>
              <thead>
                <tr>
                  {["Requirement", "Areas", "Poster", "Risk", "In queue", "Status"].map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                  <Th width={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const locked = Boolean(r.lock && !r.lock.mine);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => !locked && setOpenId(r.id)}
                      style={{
                        borderTop: "1px solid var(--divider)",
                        cursor: locked ? "default" : "pointer",
                        opacity: locked ? 0.5 : 1,
                        borderLeft: `3px solid ${r.sla === "over" ? "var(--error)" : "transparent"}`,
                      }}
                    >
                      <Td>
                        <div className="flex items-center gap-[6px]">
                          <span className="font-semibold" style={{ color: "var(--ink-primary)" }}>
                            {r.title}
                          </span>
                          {r.typeLabel && (
                            <span
                              className="rounded-4 px-[6px] py-[2px] text-[11px]"
                              style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
                            >
                              {r.typeLabel}
                            </span>
                          )}
                        </div>
                        <p className="mt-[2px] text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                          ID #{r.id.slice(0, 8)}
                        </p>
                      </Td>
                      <Td>
                        <span style={{ color: "var(--ink-secondary)" }}>{r.location ?? "—"}</span>
                      </Td>
                      {/* Design's A5 Poster cell is `avatar(pi,24), poster` — the
                          24px avatar and the name, nothing else. The role chip and
                          "New account" badge belong to A3's Poster column, not this
                          one. */}
                      <Td>
                        <div className="flex items-center gap-[6px]">
                          <Initials text={r.poster.initials} size={24} />
                          {r.poster.name}
                        </div>
                      </Td>
                      <Td>
                        <RiskBadge risk={r.risk} />
                      </Td>
                      <Td>
                        <SlaText sla={r.sla} text={r.ageText} />
                      </Td>
                      <Td>{locked ? <StatusBadge label="Locked" /> : <StatusBadge label={r.statusLabel} />}</Td>
                      <Td>
                        <span
                          style={{ color: "var(--ink-tertiary)" }}
                          title={locked ? `${r.lock!.lockedByName} is reviewing` : undefined}
                        >
                          <Icon name={locked ? "lock" : "chevron-right"} size={16} />
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openId && (
        <RequirementSheet
          id={openId}
          canDecide={canDecide}
          decideTooltip={decideTooltip}
          onClose={() => setOpenId(null)}
          onDecided={(msg) => {
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

// ---------------------------------------------------------------- the panel

function RequirementSheet({
  id,
  canDecide,
  decideTooltip,
  onClose,
  onDecided,
}: {
  id: string;
  canDecide: boolean;
  decideTooltip: string;
  onClose: () => void;
  onDecided: (msg: string) => void;
}) {
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [view, setView] = useState<"unlocked" | "locked">("unlocked");
  const [sop, setSop] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<null | "reject" | "changes">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const r = await fetch(`/api/v1/admin/review/requirement/${id}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!dead) {
        if (j?.ok) setDetail(j.data.detail);
        else setError("Could not load this requirement.");
      }
    })();
    return () => {
      dead = true;
    };
  }, [id]);

  // The lock, held while the panel is open — same rule as A4.
  useEffect(() => {
    if (!canDecide) return;
    const post = (action: string) =>
      fetch(`/api/v1/admin/review/requirement/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
        cache: "no-store",
      }).catch(() => {});
    void post("lock");
    const beat = window.setInterval(() => void post("lock"), 4 * 60_000);
    return () => {
      window.clearInterval(beat);
      void post("unlock");
    };
  }, [id, canDecide]);

  const decide = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/review/requirement/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(
          j?.error?.code === "LISTING_STATE_LOCKED"
            ? "This requirement was already decided."
            : j?.error?.code === "FORBIDDEN"
              ? "Your role cannot decide on queue items."
              : "That didn't go through. Try again.",
        );
        return;
      }
      setDialog(null);
      onDecided(msg);
    } finally {
      setBusy(false);
    }
  };

  const readOnly = !canDecide || Boolean(detail?.lock && !detail.lock.mine);

  return (
    <>
      <RightSheet
        title={detail ? `Requirement #${detail.shortId}` : "Requirement"}
        onClose={onClose}
        actions={
          detail ? (
            <>
              <Btn kind="danger" disabled={readOnly || busy} tooltip={decideTooltip} onClick={() => setDialog("reject")}>
                Reject
              </Btn>
              <Btn kind="warn" disabled={readOnly || busy} tooltip={decideTooltip} onClick={() => setDialog("changes")}>
                Request changes
              </Btn>
              <Btn
                kind="primary"
                style={{ flex: 1 }}
                disabled={readOnly || busy}
                tooltip={decideTooltip}
                onClick={() => decide({ action: "approve" }, "Requirement approved")}
              >
                {busy ? "Working…" : "Approve"}
              </Btn>
            </>
          ) : undefined
        }
      >
        {!detail ? (
          <div className="flex flex-col gap-3">
            <Shimmer height={90} />
            <Shimmer height={200} />
            <Shimmer height={120} />
          </div>
        ) : (
          <>
            {/* Unlocked | Locked render tabs — the design's first element in this
                sheet. The locked view is the server's own strip for a non-paying
                broker, not a CSS blur.

                DEVIATION note: the "X is reviewing this" banner that used to sit
                above the pill is gone, the same way Part 2 dropped A4's is-locked
                banner. The design has no banner here, the table already refuses
                to open a row another admin holds, and the footer buttons carry
                the disabled + tooltip treatment for the race. */}
            <div className="mb-3 inline-flex rounded-full p-[3px]" style={{ background: "var(--surface-2)" }}>
              {(["unlocked", "locked"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className="rounded-full px-[14px] py-[5px] text-[12px] font-semibold capitalize"
                  style={{
                    background: view === v ? "var(--surface-1)" : "transparent",
                    color: view === v ? "var(--ink-primary)" : "var(--ink-tertiary)",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="rounded-12 border p-[14px]" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
              {view === "locked" ? (
                <div className="py-5 text-center">
                  <div className="flex justify-center" style={{ color: "var(--ink-tertiary)" }}>
                    <Icon name="lock" size={28} />
                  </div>
                  <p className="mt-2 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
                    Unlock with a plan to see full details
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[17px] font-bold" style={{ color: "var(--ink-primary)" }}>
                    {detail.preview.priceLabel}
                  </p>
                  <p className="mt-[2px] text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                    {detail.preview.typeLine}
                    {detail.preview.areaLabel ? ` · ${detail.preview.areaLabel}` : ""}
                  </p>
                </>
              )}
            </div>

            {/* The design's reqdetail has exactly two sections — Submitted fields
                and SOP checklist. The Risk block that used to sit here is gone;
                the risk band and score stay visible in the queue table's own Risk
                column, which is where the design puts them. */}
            <SecHead>Submitted fields</SecHead>
            {detail.fields.map((f) => (
              <div key={f.key} className="flex border-t py-[6px]" style={{ borderColor: "var(--divider)" }}>
                <div className="w-[120px] flex-none text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
                  {f.label}
                </div>
                <div
                  className="min-w-0 flex-1 text-[13px]"
                  style={{ color: "var(--ink-primary)", fontWeight: f.warn ? 600 : 400 }}
                >
                  {f.flagged ? (
                    <>
                      {f.flagged.parts.map((p, i) =>
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
                      )}
                    </>
                  ) : (
                    f.value
                  )}
                  {f.note && (
                    <span
                      className="mt-1 block rounded-6 px-2 py-1 text-[11px]"
                      style={{ background: "var(--warning-soft)", color: "var(--ink-secondary)" }}
                    >
                      Note to poster: {f.note}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* No Location section: the design's own row set already carries
                "Preferred areas", which is the same `area_label` the trail was
                rendering. No Prior history either — the design has no such block
                and the reject counter it carried is re-stated inside the reject
                dialog, where it changes the decision. */}
            <SecHead>SOP checklist</SecHead>
            {detail.sop.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer gap-2 py-1 text-[12px]"
                style={{ color: "var(--ink-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(sop[item.id])}
                  onChange={() => setSop((s) => ({ ...s, [item.id]: !s[item.id] }))}
                  style={{ accentColor: "var(--accent)" }}
                />
                {item.label}
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

      {dialog === "reject" && detail && (
        <RejectRequirement
          detail={detail}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(code, text) => decide({ action: "reject", reasonCode: code, reasonText: text }, "Rejected")}
        />
      )}
      {dialog === "changes" && detail && (
        <ChangesRequirement
          detail={detail}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(notes) => decide({ action: "request_changes", notes }, "Change request sent")}
        />
      )}
    </>
  );
}

function RejectRequirement({
  detail,
  busy,
  onClose,
  onConfirm,
}: {
  detail: ReviewDetail;
  busy: boolean;
  onClose: () => void;
  onConfirm: (code: string, text: string | null) => void;
}) {
  const [code, setCode] = useState(detail.rejectTemplates[0]?.code ?? "");
  const [text, setText] = useState("");
  const isOther = code === "other";
  const valid = Boolean(code) && (!isOther || text.trim().length >= 3);

  return (
    <Modal
      title="Reject this requirement?"
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
        name="req-reject"
        value={code}
        onChange={setCode}
        options={detail.rejectTemplates.map((t) => ({ value: t.code, label: t.label }))}
      />
      {isOther && (
        <div className="mt-2">
          <TextArea value={text} onChange={setText} placeholder="Describe the reason…" />
        </div>
      )}
      {detail.rejects.nextWouldLock && (
        <div className="mt-3">
          <NoteBlock tone="warning">
            This is rejection {detail.rejects.count + 1} of {detail.rejects.max} — the requirement will be locked and the
            poster must contact support.
          </NoteBlock>
        </div>
      )}
    </Modal>
  );
}

function ChangesRequirement({
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

  const payload = Object.fromEntries(
    active.map((k) => [k, (notes[k] ?? "").trim()]).filter(([, v]) => (v as string).length > 0),
  );

  return (
    <Modal
      title="Request changes"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={busy || Object.keys(payload).length === 0} onClick={() => onConfirm(payload)}>
            {busy ? "Sending…" : "Send change request"}
          </Btn>
        </>
      }
    >
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
        Attach notes to the fields that need fixing. The poster sees each note next to that field.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {detail.changeFields.map((c) => {
          const on = active.includes(c.fieldKey);
          return (
            <button
              key={c.fieldKey}
              type="button"
              onClick={() => {
                setActive((a) => (on ? a.filter((x) => x !== c.fieldKey) : [...a, c.fieldKey]));
                setNotes((n) => (n[c.fieldKey] ? n : { ...n, [c.fieldKey]: c.template }));
              }}
              className="inline-flex h-8 items-center rounded-full border px-3 text-[13px]"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                background: on ? "var(--accent-soft)" : "var(--surface-1)",
                color: on ? "var(--accent)" : "var(--ink-secondary)",
                fontWeight: on ? 600 : 400,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {active.map((key) => {
        const cfg = detail.changeFields.find((c) => c.fieldKey === key)!;
        return (
          <div key={key} className="mb-3">
            <p className="mb-[6px] text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              {cfg.label}
            </p>
            <TextArea value={notes[key] ?? ""} onChange={(v) => setNotes((n) => ({ ...n, [key]: v }))} height={64} />
          </div>
        );
      })}
      <NoteBlock tone="info">This keeps the requirement pending and does not count as a rejection.</NoteBlock>
    </Modal>
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
