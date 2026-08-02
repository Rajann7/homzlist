"use client";

/**
 * A23's ticket thread — template 2444, `pushPanel('ticket',r)`.
 *
 * A STACKED PANEL, not a modal. §5: the surface type is part of the design. It
 * matters more here than anywhere: the panel pushes the USER panel on top of
 * itself ("Open user →"), which a modal cannot do.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  Modal,
  Mono,
  NoteStrip,
  RoleChip,
  Shimmer,
  StatusBadge,
  useAdminRole,
  useToast,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";


async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

type Message = {
  id: string;
  author_kind: string;
  author_name: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
};

export function TicketPanelBody({ panel }: { panel: PanelEntry }) {
  const id = String(panel.data.id ?? "");
  const toast = useToast();
  const { pushPanel, notifyChanged } = usePanels();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/support?what=ticket&id=${id}`, { cache: "no-store" }).catch(
      () => null,
    );
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: Record<string, unknown> }
      | null;
    setData(json?.ok ? (json.data ?? null) : null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    const json = await post({ ...body, id });
    setBusy(false);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) {
      void load();
      notifyChanged();
    }
    return Boolean(json?.ok);
  };

  const messages = (data?.messages ?? []) as Message[];
  const canned = (data?.canned ?? []) as { id: string; title: string; body: string }[];
  const closed = data?.status === "closed";

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
      {!data ? (
        <Shimmer h={320} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            {data.is_grievance ? (
              <Badge bg="var(--errorSoft)" fg="var(--error)">
                Grievance
              </Badge>
            ) : null}
            <StatusBadge
              status={data.status === "open" ? "Open" : data.status === "replied" ? "Pending" : "Approved"}
            />
            <Badge
              bg={data.priority === "urgent" ? "var(--errorSoft)" : "var(--warningSoft)"}
              fg={data.priority === "urgent" ? "var(--error)" : "var(--warning)"}
            >
              {String(data.priority)}
            </Badge>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, margin: "6px 0 10px" }}>{String(data.subject)}</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Btn
              label="Assign to me"
              kind="outline"
              style={{ height: 32, fontSize: 13 }}
              onClick={() => void act({ action: "ticket_assign", assignee: "me" })}
            />
            <Btn
              label="Escalate"
              kind="outline"
              style={{ height: 32, fontSize: 13 }}
              onClick={() => setEscalating(true)}
            />
            {closed ? (
              <Btn
                label="Reopen"
                kind="outline"
                style={{ height: 32, fontSize: 13 }}
                onClick={() => void act({ action: "ticket_reopen" })}
              />
            ) : (
              <Btn
                label="Close"
                kind="danger"
                style={{ height: 32, fontSize: 13 }}
                onClick={() => setClosing(true)}
              />
            )}
          </div>

          {data.is_grievance ? (
            <NoteStrip tone="warn">
              {`Grievance SLA — acknowledged ${
                data.acked_at
                  ? new Date(String(data.acked_at)).toLocaleString("en-IN")
                  : "NOT YET (due within 24h)"
              } · resolution due ${
                data.sla_due_at ? new Date(String(data.sla_due_at)).toLocaleDateString("en-IN") : "—"
              }`}
            </NoteStrip>
          ) : null}

          {/* The user card — three real counts, so an agent knows who they are
              talking to before they reply. */}
          <div
            style={{
              background: "var(--s2)",
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Avatar initials={String(data.user_name ?? "U").slice(0, 2).toUpperCase()} size={36} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{String(data.user_name ?? "—")}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                {`Plans: ${
                  ((data.user_plans ?? []) as { name: string }[]).map((p) => p.name).join(", ") || "none"
                } · Listings: ${data.user_listings} · Prior tickets: ${data.user_prior_tickets}`}
              </div>
            </div>
            <span
              onClick={() => pushPanel("user", { id: data.profile_id, name: data.user_name })}
              style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
            >
              Open user →
            </span>
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 12 }}>
            {messages.map((m) =>
              m.is_internal ? (
                // template 2452 — internal notes are yellow and labelled
                <div
                  key={m.id}
                  style={{ background: "var(--warningSoft)", borderRadius: 8, padding: 10, marginBottom: 10 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ color: "var(--warning)", display: "flex" }}>
                      <AdminIcon name="lock" size={13} />
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                      Internal — not visible to user · {m.author_name}
                    </span>
                  </div>
                  <div style={{ fontSize: 13 }}>{m.body}</div>
                </div>
              ) : m.author_kind === "system" ? (
                <div key={m.id} style={{ textAlign: "center", margin: "8px 0" }}>
                  <span style={{ fontSize: 11, color: "var(--ink3)" }}>{m.body}</span>
                </div>
              ) : (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: m.author_kind === "staff" ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ maxWidth: "80%" }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--ink3)",
                        marginBottom: 2,
                        textAlign: m.author_kind === "staff" ? "right" : "left",
                      }}
                    >
                      {m.author_name ?? (m.author_kind === "staff" ? "Support" : String(data.user_name))}
                    </div>
                    <div
                      style={{
                        background: m.author_kind === "staff" ? "var(--accentSoft)" : "var(--s2)",
                        borderRadius: 12,
                        padding: "8px 12px",
                        fontSize: 13,
                      }}
                    >
                      {m.body}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {closed ? (
            <NoteStrip tone="neutral">
              {`Closed — ${String(data.resolution ?? "no resolution recorded")}`}
            </NoteStrip>
          ) : (
            <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <select
                  onChange={(e) => {
                    const c = canned.find((x) => x.id === e.target.value);
                    if (c) setReply(c.body);
                  }}
                  style={{ ...F_INPUT_STYLE, flex: 1, height: 34 }}
                  defaultValue=""
                >
                  <option value="">Canned responses…</option>
                  {canned.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={() => setInternal((v) => !v)}
                    style={{ accentColor: "var(--warning)" }}
                  />
                  Internal note
                </label>
              </div>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={internal ? "Internal note (not visible to user)…" : "Type your reply…"}
                style={{
                  ...F_TEXTAREA_STYLE,
                  height: 70,
                  border: `1px solid ${internal ? "var(--warning)" : "var(--border)"}`,
                  background: internal ? "var(--warningSoft)" : "var(--s2)",
                }}
              />
              <Btn
                label={busy ? "Sending…" : internal ? "Add internal note" : "Send reply"}
                kind={internal ? "warn" : "primary"}
                style={{ width: "100%" }}
                onClick={async () => {
                  const ok = await act({ action: "ticket_reply", body: reply, internal });
                  if (ok) setReply("");
                }}
              />
            </div>
          )}

          {closing ? (
            <CloseTicket
              onClose={() => setClosing(false)}
              onSubmit={async (resolution) => {
                const ok = await act({ action: "ticket_close", resolution });
                if (ok) setClosing(false);
                return ok;
              }}
            />
          ) : null}

          {escalating ? (
            <EscalateTicket
              onClose={() => setEscalating(false)}
              onSubmit={async (reason) => {
                const ok = await act({ action: "ticket_escalate", reason });
                if (ok) setEscalating(false);
                return ok;
              }}
            />
          ) : null}
        </>
      )}
      </div>
    </>
  );
}

function CloseTicket({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (resolution: string) => Promise<boolean>;
}) {
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Close ticket"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Closing…" : "Close ticket"}
            kind="danger"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              await onSubmit(resolution);
              setBusy(false);
            }}
          />
        </>
      }
    >
      <FField label="Resolution" helper="The user is told this, so write it for them">
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 90 }}
        />
      </FField>
    </Modal>
  );
}

function EscalateTicket({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Escalate to grievance"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Escalating…" : "Escalate"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              await onSubmit(reason);
              setBusy(false);
            }}
          />
        </>
      }
    >
      <NoteStrip tone="warn">
        This starts the statutory grievance clock: acknowledged within 24 hours of when the user
        raised it, resolved within 15 days. The dates are computed, not typed.
      </NoteStrip>
      <FField label="Why (internal)">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 70 }}
        />
      </FField>
    </Modal>
  );
}
