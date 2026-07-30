"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { ReportFilter, ReportGroup } from "@/lib/admin/reports";
import type { ActionOption } from "@/lib/admin/reviewConfig";
import { Initials, Thumb } from "./queueBits";
import { Badge, Btn, Chip, Field, Modal, NoteBlock, RadioList, RightSheet, SecHead, Select, SheetMenu, TextArea } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A9 — Reports queue (Doc5 A9 / designs `reportsEl`).
 *
 * One card per reported THING, not per report: three complaints about the same
 * listing is one card and one decision. Every action closes the whole group and
 * notifies every reporter, which is the promise the card's footer makes.
 *
 * The action row is capability-gated for real. A Staff seat can dismiss; hiding
 * needs `listings.edit`, warning and suspending need `users.edit`, and Ban
 * device/IP is Super only — the design draws that last one conditionally and the
 * endpoint refuses it regardless of what the browser sends.
 */

interface Props {
  filter: ReportFilter;
  counts: Record<ReportFilter, number>;
  groups: ReportGroup[];
  can: { hide: boolean; users: boolean; ban: boolean };
  warnTemplates: ActionOption[];
  suspendDurations: ActionOption[];
}

const FILTERS: Array<{ key: ReportFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "listings", label: "Listings" },
  { key: "users", label: "Users" },
  { key: "messages", label: "Messages" },
  { key: "high", label: "High priority" },
];

export function ReportsQueue({ filter, counts, groups, can, warnTemplates, suspendDurations }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | { group: ReportGroup; kind: "warn" | "suspend" | "more" | "note" | "reporters" | "confirm"; action?: string }>(null);

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const act = async (group: ReportGroup, action: string, extra: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/reports/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          reportIds: group.reportIds,
          subjectType: group.subjectType,
          subjectId: group.subjectId,
          ownerId: group.owner?.id ?? null,
          ...extra,
        }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const d = j?.error?.details ?? j?.error ?? {};
        setError(
          d.detail === "no_device_on_record"
            ? "There is no device or address on record for this user, so there is nothing to ban."
            : d.detail === "no_super_admin"
              ? "There is no active Super Admin to escalate to."
              : d.notHidden
                ? "That item could not be hidden — it may already be hidden or deleted."
                : j?.error?.code === "FORBIDDEN"
                  ? "Your role cannot take that action."
                  : j?.error?.code === "LISTING_STATE_LOCKED"
                    ? "These reports were already decided."
                    : "That didn't go through. Try again.",
        );
        return;
      }
      setSheet(null);
      const n = j.data?.reportersNotified ?? 0;
      show(n > 0 ? `${msg} · ${n} reporter${n === 1 ? "" : "s"} notified` : msg);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Reports queue
        </h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={`${f.label} ${counts[f.key] ?? 0}`}
            active={filter === f.key}
            onClick={() => router.push(`/queues/reports?f=${f.key}`)}
          />
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-8 p-[10px] text-[12px]" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="flag" size={96} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            No open reports
          </p>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            Nothing is waiting on a moderation decision.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <div
            key={g.key}
            className="mb-3 rounded-12 border p-4"
            style={{ background: "var(--surface-1)", borderColor: g.high ? "var(--error)" : "var(--border)" }}
          >
            {/* Reason · count · age · priority dot */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge bg="var(--error-soft)" fg="var(--error)" plain>
                {g.reason}
              </Badge>
              <Badge bg="var(--surface-2)" fg="var(--ink-secondary)" plain>
                {g.count} report{g.count === 1 ? "" : "s"}
              </Badge>
              <span className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                {g.oldestLabel}
              </span>
              {g.reasons.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSheet({ group: g, kind: "reporters" })}
                  className="text-[11px] font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {g.reasons.length} different reasons
                </button>
              )}
              {g.high && (
                <span className="ml-auto h-2 w-2 rounded-full" style={{ background: "var(--error)" }} title="High priority" />
              )}
            </div>

            <Entity group={g} />

            {/* Actions */}
            <div className="mt-[14px] flex flex-wrap gap-2">
              <Btn kind="outline" style={{ height: 34, fontSize: 13 }} disabled={busy} onClick={() => act(g, "dismiss", {}, "Dismissed")}>
                Dismiss
              </Btn>
              {g.entity && g.entity.kind !== "user" && g.entity.kind !== "message" && (
                <Btn
                  kind="outline"
                  style={{ height: 34, fontSize: 13 }}
                  disabled={busy || !can.hide}
                  tooltip="Admin only"
                  onClick={() => setSheet({ group: g, kind: "confirm", action: "hide" })}
                >
                  Hide entity
                </Btn>
              )}
              <Btn
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                disabled={busy || !can.users || !g.owner}
                tooltip={g.owner ? "Admin only" : "No account behind this report"}
                onClick={() => setSheet({ group: g, kind: "warn" })}
              >
                Warn user
              </Btn>
              <Btn
                kind="danger"
                style={{ height: 34, fontSize: 13 }}
                disabled={busy || !can.users || !g.owner}
                tooltip={g.owner ? "Admin only" : "No account behind this report"}
                onClick={() => setSheet({ group: g, kind: "suspend" })}
              >
                Suspend user
              </Btn>
              {can.ban && (
                <Btn
                  kind="danger"
                  style={{ height: 34, fontSize: 13 }}
                  disabled={busy || !g.owner}
                  onClick={() => setSheet({ group: g, kind: "confirm", action: "ban" })}
                >
                  Ban device/IP
                </Btn>
              )}
              <button
                type="button"
                onClick={() => setSheet({ group: g, kind: "more" })}
                aria-label="More actions"
                className="grid h-[34px] w-[34px] place-items-center rounded-8 border"
                style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-secondary)" }}
              >
                <Icon name="more" size={18} />
              </button>
            </div>

            <p className="mt-3 rounded-8 px-[10px] py-2 text-[11px]" style={{ background: "var(--accent-soft)", color: "var(--ink-secondary)" }}>
              Reporters are notified automatically when you take an action.
            </p>
          </div>
        ))
      )}

      {/* ------------------------------------------------------------ overlays */}
      {sheet?.kind === "more" && (
        <SheetMenu
          onClose={() => setSheet(null)}
          items={[
            { label: "Escalate to Super Admin", onSelect: () => setSheet({ group: sheet.group, kind: "confirm", action: "escalate" }) },
            { label: "Add internal note", onSelect: () => setSheet({ group: sheet.group, kind: "note" }) },
            { label: "See all reporters", onSelect: () => setSheet({ group: sheet.group, kind: "reporters" }) },
          ]}
        />
      )}

      {sheet?.kind === "reporters" && (
        <RightSheet title={`${sheet.group.count} report${sheet.group.count === 1 ? "" : "s"}`} onClose={() => setSheet(null)}>
          {sheet.group.reporters.map((r, i) => (
            <div key={`${r.id}-${i}`} className="flex gap-[10px] border-b py-3" style={{ borderColor: "var(--divider)" }}>
              <Initials text={r.initials} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                  {r.name}
                </p>
                <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                  {r.reason} · {r.atLabel}
                </p>
                {r.note && (
                  <p className="mt-1 text-[12px] italic" style={{ color: "var(--ink-secondary)" }}>
                    “{r.note}”
                  </p>
                )}
              </div>
            </div>
          ))}
        </RightSheet>
      )}

      {sheet?.kind === "warn" && <WarnSheet group={sheet.group} templates={warnTemplates} busy={busy} onClose={() => setSheet(null)} onSend={(reason) => act(sheet.group, "warn", { reason }, "Warning sent")} />}

      {sheet?.kind === "suspend" && (
        <SuspendDialog
          group={sheet.group}
          durations={suspendDurations}
          busy={busy}
          onClose={() => setSheet(null)}
          onConfirm={(days, reason) => act(sheet.group, "suspend", { days, reason }, "User suspended")}
        />
      )}

      {sheet?.kind === "note" && <NoteDialog group={sheet.group} busy={busy} onClose={() => setSheet(null)} onSave={(reason) => act(sheet.group, "note", { reason }, "Internal note added")} />}

      {sheet?.kind === "confirm" && sheet.action && (
        <ConfirmDialog
          group={sheet.group}
          action={sheet.action}
          busy={busy}
          onClose={() => setSheet(null)}
          onConfirm={(reason) =>
            act(
              sheet.group,
              sheet.action!,
              { reason },
              sheet.action === "hide" ? "Entity hidden" : sheet.action === "ban" ? "Device banned" : "Escalated to Super Admin",
            )
          }
        />
      )}

      <AdminToast message={toast} />
    </div>
  );
}

function Entity({ group }: { group: ReportGroup }) {
  const e = group.entity;
  if (!e) {
    return (
      <div className="rounded-8 p-[10px] text-[12px]" style={{ background: "var(--surface-2)", color: "var(--ink-tertiary)" }}>
        The reported {group.subjectType} no longer exists. Dismissing closes the reports.
      </div>
    );
  }

  if (e.kind === "user") {
    return (
      <div className="flex items-center gap-[10px] rounded-8 p-[10px]" style={{ background: "var(--surface-2)" }}>
        <Initials text={e.initials} size={40} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {e.name}
          </p>
          <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            {e.meta}
          </p>
        </div>
      </div>
    );
  }

  if (e.kind === "message") {
    return (
      <div className="rounded-8 p-[10px]" style={{ background: "var(--surface-2)" }}>
        {e.messages.map((m) => (
          <div key={m.id} className="mb-[6px]">
            <p className="mb-[2px] text-[10px]" style={{ color: "var(--ink-tertiary)" }}>
              {m.senderName}
              {m.reported ? " · Reported message" : ""} · {m.atLabel}
            </p>
            <span
              className="inline-block rounded-8 border px-[10px] py-[6px] text-[12px]"
              style={{
                background: m.reported ? "var(--error-soft)" : "var(--surface-1)",
                borderColor: m.reported ? "var(--error)" : "var(--divider)",
                color: "var(--ink-primary)",
              }}
            >
              {m.body || "(no text)"}
            </span>
          </div>
        ))}
        <p className="mt-[6px] text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
          Admins can read chat context for reported messages only — sending is disabled everywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-[10px] rounded-8 p-[10px]" style={{ background: "var(--surface-2)" }}>
      <Thumb size={44} url={e.coverUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
          {e.title}
        </p>
        <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
          {e.meta}
        </p>
      </div>
      {e.reviewHref && (
        <a href={e.reviewHref} className="shrink-0 text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
          Open review →
        </a>
      )}
    </div>
  );
}

function WarnSheet({
  group,
  templates,
  busy,
  onClose,
  onSend,
}: {
  group: ReportGroup;
  templates: ActionOption[];
  busy: boolean;
  onClose: () => void;
  onSend: (reason: string) => void;
}) {
  const [value, setValue] = useState(templates[0]?.value ?? "");
  const [body, setBody] = useState(templates[0]?.body ?? "");

  const pick = (v: string) => {
    setValue(v);
    const t = templates.find((x) => x.value === v);
    if (t?.body) setBody(t.body);
  };

  return (
    <RightSheet
      title="Warn user"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" style={{ flex: 1 }} disabled={busy || body.trim().length < 5} onClick={() => onSend(body.trim())}>
            {busy ? "Sending…" : "Send warning"}
          </Btn>
        </>
      }
    >
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
        Warning {group.owner?.name ?? "this user"} about {group.reason.toLowerCase()}.
      </p>
      <Field label="Template">
        <Select value={value} onChange={pick} options={templates.map((t) => ({ value: t.value, label: t.label }))} />
      </Field>
      <Field label="Message to the user">
        <TextArea value={body} onChange={setBody} height={90} placeholder="They will read this exactly as written." />
      </Field>
      <NoteBlock tone="info">It appears in their notifications and on their Account status screen.</NoteBlock>
    </RightSheet>
  );
}

function SuspendDialog({
  group,
  durations,
  busy,
  onClose,
  onConfirm,
}: {
  group: ReportGroup;
  durations: ActionOption[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (days: string, reason: string) => void;
}) {
  const [days, setDays] = useState(durations[0]?.value ?? "");
  const [reason, setReason] = useState("");

  return (
    <Modal
      title="Suspend user?"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="dangerFill" disabled={busy || !days || reason.trim().length < 5} onClick={() => onConfirm(days, reason.trim())}>
            {busy ? "Suspending…" : "Suspend"}
          </Btn>
        </>
      }
    >
      <p className="mb-[6px] text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
        Duration
      </p>
      <RadioList name="suspend-days" value={days} onChange={setDays} options={durations.map((d) => ({ value: d.value, label: d.label }))} />
      <div className="mt-2">
        <TextArea value={reason} onChange={setReason} placeholder="Reason…" height={60} />
      </div>
      <div className="mt-3">
        <NoteBlock tone="warning">
          {group.owner?.name ?? "Their"} listings will be hidden and chats frozen. They are notified.
        </NoteBlock>
      </div>
    </Modal>
  );
}

function NoteDialog({
  group,
  busy,
  onClose,
  onSave,
}: {
  group: ReportGroup;
  busy: boolean;
  onClose: () => void;
  onSave: (reason: string) => void;
}) {
  const [body, setBody] = useState("");
  return (
    <Modal
      title="Add internal note"
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="primary" disabled={busy || body.trim().length < 2} onClick={() => onSave(body.trim())}>
            {busy ? "Saving…" : "Save note"}
          </Btn>
        </>
      }
    >
      <TextArea value={body} onChange={setBody} height={90} placeholder={`Only other admins see this. About ${group.subjectType} #${group.subjectId.slice(0, 8)}.`} />
      <div className="mt-2">
        <NoteBlock tone="info">A note is not a decision — these reports stay open.</NoteBlock>
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  group,
  action,
  busy,
  onClose,
  onConfirm,
}: {
  group: ReportGroup;
  action: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const needsReason = action !== "escalate";

  const copy =
    action === "hide"
      ? {
          title: `Hide this ${group.subjectType}?`,
          note: "It will be removed from feed and search, and the poster is notified.",
          cta: "Hide",
        }
      : action === "ban"
        ? {
            title: "Ban device / IP?",
            note: "The address behind this account cannot sign in again. HomzList never stores the raw address — the ban is keyed on its salted hash.",
            cta: "Ban",
          }
        : {
            title: "Escalate to Super Admin?",
            note: "The reports stay open and every active Super Admin gets a notification.",
            cta: "Escalate",
          };

  return (
    <Modal
      title={copy.title}
      onClose={onClose}
      actions={
        <>
          <Btn kind="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            kind={action === "escalate" ? "primary" : "dangerFill"}
            disabled={busy || (needsReason && reason.trim().length < 5)}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Working…" : copy.cta}
          </Btn>
        </>
      }
    >
      <NoteBlock tone={action === "escalate" ? "info" : "warning"}>{copy.note}</NoteBlock>
      <div className="mt-3">
        <TextArea value={reason} onChange={setReason} placeholder={needsReason ? "Reason…" : "Note (optional)…"} height={60} />
      </div>
    </Modal>
  );
}
