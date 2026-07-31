"use client";

/**
 * A9 — Reports queue. Template 919-949, plus warn (1688), suspend (1693) and
 * the escalate sheet (1700).
 *
 * One card per reported ENTITY, not per report — the count on the card is a
 * real GROUP BY (migration 0095), so "3 reports" and the six buttons act on the
 * same set. Whatever the moderator picks, every open report on that entity is
 * closed and every reporter is told, which is what the card's own footnote
 * promises.
 *
 * Two of the six are role-gated in the design: Suspend and Ban device/IP. They
 * are gated here too, and again on the server — the client's copy of the role
 * decides what is DRAWN, never what is allowed.
 */

import { useState } from "react";
import {
  AdminIcon,
  Badge,
  Btn,
  Chip,
  Modal,
  PageHead,
  RightSheet,
  Shimmer,
  SheetMenu,
  Thumb,
  useAdmin,
  useToast,
} from "@/components/admin/ds";
import { Pager, useAdminList } from "@/components/admin/list";
import { ageOf } from "./shared";
import { ROLE_RANK } from "@/components/admin/ds/screens";

type Row = {
  id: string;
  subject_type: string;
  subject_id: string;
  report_count: number;
  first_reported_at: string;
  created_at: string;
  reason: string | null;
  note: string | null;
  high_priority: boolean;
};

const FILTER_KEYS = ["kind", "reason", "from", "to"] as const;

const TABS: [string, string][] = [
  ["all", "All"],
  ["listings", "Listings"],
  ["users", "Users"],
  ["messages", "Messages"],
  ["high", "High priority"],
];

const SUSPEND_DURATIONS: [label: string, days: number | null][] = [
  ["7 days", 7],
  ["30 days", 30],
  ["Until review", null],
];

export function ReportsQueue() {
  const toast = useToast();
  const { me } = useAdmin();
  const list = useAdminList<Row>("reports", FILTER_KEYS, "all");
  const [sheet, setSheet] = useState<{ kind: "warn" | "suspend" | "more"; row: Row } | null>(null);
  const [busy, setBusy] = useState(false);

  const tab = list.tab ?? "all";
  const rows = list.data?.rows ?? [];
  const canSuspend = ROLE_RANK[me.role] >= ROLE_RANK.admin;
  const canBan = me.role === "super";

  async function act(row: Row, action: string, body: Record<string, unknown> = {}, label?: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/v1/admin/queues/reports/${row.subject_id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, subjectType: row.subject_type, ...body }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; error?: { code: string } }
      | null;
    setBusy(false);
    setSheet(null);
    if (!json?.ok) {
      toast(
        res?.status === 403
          ? "Your role can't take that action"
          : json?.error?.code === "VALIDATION_ERROR"
            ? "Nothing to act on — this account has no device or IP on record"
            : "That didn't go through — try again",
      );
      return;
    }
    toast(label ?? "Done · reporters notified");
    list.reload();
  }

  return (
    <div>
      <PageHead title="Reports queue" />

      {/* template 948 — the design uses CHIPS here, not the tab strip */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(([key, label]) => (
          <Chip
            key={key}
            label={`${label} ${list.data?.tabCounts?.[key] ?? 0}`}
            active={tab === key}
            onClick={() => list.setTab(key)}
          />
        ))}
      </div>

      {list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} h={200} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)" }}>
          No open reports
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            style={{
              background: "var(--s1)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Badge
                bg="var(--errorSoft)"
                fg="var(--error)"
                style={{ textTransform: "none", letterSpacing: 0 }}
              >
                {(r.reason ?? "reported").replace(/_/g, " ")}
              </Badge>
              <Badge
                bg="var(--s2)"
                fg="var(--ink2)"
                style={{ textTransform: "none", letterSpacing: 0 }}
              >
                {`${r.report_count} report${r.report_count === 1 ? "" : "s"}`}
              </Badge>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                {`${ageOf(r.created_at).text} ago`}
              </span>
              {r.high_priority ? (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "var(--error)",
                    marginLeft: "auto",
                  }}
                />
              ) : null}
            </div>

            <EntityPreview row={r} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              <Btn
                label="Dismiss"
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                onClick={() => act(r, "dismiss", {}, "Dismissed · reporters notified")}
              />
              {r.subject_type !== "user" && r.subject_type !== "message" ? (
                <Btn
                  label="Hide entity"
                  kind="outline"
                  style={{ height: 34, fontSize: 13 }}
                  onClick={() => act(r, "hide_entity", {}, "Entity hidden")}
                />
              ) : null}
              <Btn
                label="Warn user"
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                onClick={() => setSheet({ kind: "warn", row: r })}
              />
              {canSuspend ? (
                <Btn
                  label="Suspend user"
                  kind="danger"
                  style={{ height: 34, fontSize: 13 }}
                  onClick={() => setSheet({ kind: "suspend", row: r })}
                />
              ) : null}
              {canBan ? (
                <Btn
                  label="Ban device/IP"
                  kind="danger"
                  style={{ height: 34, fontSize: 13 }}
                  onClick={() => act(r, "ban_device", { reason: "Reported content" }, "Device banned")}
                />
              ) : null}
              <button
                type="button"
                onClick={() => setSheet({ kind: "more", row: r })}
                aria-label="More"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--s1)",
                  color: "var(--ink2)",
                  cursor: "pointer",
                }}
              >
                <AdminIcon name="dots" size={18} />
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: "8px 10px",
                background: "var(--accentSoft)",
                borderRadius: 8,
                fontSize: 11,
                color: "var(--ink2)",
              }}
            >
              Reporters are notified automatically when you take an action.
            </div>
          </div>
        ))
      )}

      <Pager
        page={list.data?.page ?? 1}
        pageSize={list.data?.pageSize ?? 50}
        total={list.data?.total ?? 0}
        onPage={list.setPage}
      />

      {sheet?.kind === "warn" ? (
        <WarnSheet
          onClose={() => setSheet(null)}
          onSend={(message) => act(sheet.row, "warn", { message }, "Warning sent")}
          busy={busy}
        />
      ) : null}

      {sheet?.kind === "suspend" ? (
        <SuspendModal
          onClose={() => setSheet(null)}
          onConfirm={(days, reason) =>
            act(sheet.row, "suspend", { days, reason }, "User suspended")
          }
          busy={busy}
        />
      ) : null}

      {sheet?.kind === "more" ? (
        <SheetMenu onClose={() => setSheet(null)}>
          {[
            [
              "Escalate to Super Admin",
              () => act(sheet.row, "escalate", { reason: "Needs a second opinion" }, "Escalated"),
            ],
          ].map(([label, run]) => (
            <div
              key={label as string}
              onClick={run as () => void}
              style={{
                padding: "12px 14px",
                fontSize: 14,
                color: "var(--ink1)",
                cursor: "pointer",
                borderRadius: 8,
              }}
            >
              {label as string}
            </div>
          ))}
        </SheetMenu>
      ) : null}
    </div>
  );
}

/* template 928-934 — a different preview per reported kind */
function EntityPreview({ row }: { row: Row }) {
  if (row.subject_type === "message") {
    return (
      <div style={{ background: "var(--s2)", borderRadius: 8, padding: 10 }}>
        <div style={{ fontSize: 12, color: "var(--ink1)" }}>
          {row.note ?? "A message in a chat was reported."}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 6 }}>
          Admins can read chat context for reported messages only — sending is disabled everywhere.
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--s2)",
        borderRadius: 8,
        padding: 10,
      }}
    >
      <Thumb size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {`${row.subject_type[0].toUpperCase()}${row.subject_type.slice(1)} #${row.subject_id.slice(0, 8)}`}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink3)" }}>
          {row.note ?? `Reported ${row.report_count} time${row.report_count === 1 ? "" : "s"}`}
        </div>
      </div>
      {row.subject_type === "listing" ? (
        <a
          href={`/queues/listings/${row.subject_id}?tab=pending`}
          style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
        >
          Open review →
        </a>
      ) : null}
    </div>
  );
}

/* template 1688-1691 */
function WarnSheet({
  onClose,
  onSend,
  busy,
}: {
  onClose: () => void;
  onSend: (message: string) => void;
  busy: boolean;
}) {
  const TEMPLATES = ["Photos don't match", "Contact details in content", "Misleading price"];
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [message, setMessage] = useState(
    "Please ensure your photos match the actual property.",
  );
  return (
    <RightSheet
      title="Warn user"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Sending…" : "Send warning"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={() => onSend(message)}
          />
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", marginBottom: 6 }}>
          Template
        </div>
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
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
        >
          {TEMPLATES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message to the user…"
        style={{
          width: "100%",
          height: 90,
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s2)",
          color: "var(--ink1)",
          fontSize: 13,
          fontFamily: "inherit",
          resize: "none",
        }}
      />
    </RightSheet>
  );
}

/* template 1693-1698 */
function SuspendModal({
  onClose,
  onConfirm,
  busy,
}: {
  onClose: () => void;
  onConfirm: (days: number | null, reason: string) => void;
  busy: boolean;
}) {
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState("");
  return (
    <Modal
      title="Suspend user?"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Suspending…" : "Suspend"}
            kind="dangerFill"
            onClick={() => onConfirm(days, reason)}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 6 }}>Duration</div>
      {SUSPEND_DURATIONS.map(([label, value]) => (
        <label
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            checked={days === value}
            onChange={() => setDays(value)}
            style={{ accentColor: "var(--accent)" }}
          />
          {label}
        </label>
      ))}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason…"
        style={{
          width: "100%",
          height: 60,
          marginTop: 8,
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s2)",
          color: "var(--ink1)",
          fontSize: 13,
          fontFamily: "inherit",
          resize: "none",
        }}
      />
      <div
        style={{
          marginTop: 10,
          padding: 10,
          background: "var(--warningSoft)",
          borderRadius: 8,
          fontSize: 11,
          color: "var(--ink2)",
        }}
      >
        Their listings will be hidden and chats frozen.
      </div>
    </Modal>
  );
}
