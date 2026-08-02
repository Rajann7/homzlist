"use client";

/**
 * A24's dispute detail — template 2500, `pushPanel('dispute',r)`.
 *
 * A STACKED PANEL: it drills onward to both parties and to the related
 * payments, which is exactly what the stack is for.
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

const rupees = (paise: unknown) =>
  paise ? `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}` : "—";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function DisputePanelBody({ panel }: { panel: PanelEntry }) {
  const id = String(panel.data.id ?? "");
  const toast = useToast();
  const role = useAdminRole();
  const { pushPanel, notifyChanged } = usePanels();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/support?what=dispute&id=${id}`, { cache: "no-store" }).catch(
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

  const messages = (data?.messages ?? []) as { id: string; body: string; created_at: string }[];
  const payments = (data?.payments ?? []) as {
    id: string;
    razorpay_payment_id: string | null;
    amount_paise: number;
    status_key: string;
  }[];
  const resolved = data?.status === "resolved" || data?.status === "closed";

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
      {!data ? (
        <Shimmer h={320} />
      ) : (
        <>
          <div style={{ fontSize: 14, marginBottom: 10 }}>{String(data.summary ?? "")}</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {!resolved ? (
              <>
                <Btn
                  label="Mark under review"
                  kind="outline"
                  style={{ height: 32, fontSize: 13 }}
                  onClick={() => void act({ action: "dispute_status", status: "investigating" })}
                />
                <Btn
                  label="Resolve"
                  kind="primary"
                  style={{ height: 32, fontSize: 13 }}
                  onClick={() => setResolving(true)}
                />
              </>
            ) : null}
            {/* Super-only, and one-way. Once held, nothing in the panel can
                un-hold it — that is the point. */}
            {role === "super" && !data.evidence_preserved ? (
              <Btn
                label={busy ? "Preserving…" : "Preserve evidence"}
                kind="outline"
                style={{ height: 32, fontSize: 13 }}
                onClick={() => void act({ action: "dispute_preserve" })}
              />
            ) : null}
          </div>

          {data.evidence_preserved ? (
            <NoteStrip tone="warn">
              Evidence is preserved for this dispute. The related items are held from the purge job
              and cannot be deleted from Trash.
            </NoteStrip>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              [data.party_a, data.party_a_name],
              [data.party_b, data.party_b_name],
            ]
              .filter(([pid]) => pid)
              .map(([pid, name]) => (
                <span
                  key={String(pid)}
                  onClick={() => pushPanel("user", { id: pid, name })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  <Avatar initials={String(name ?? "??").slice(0, 2).toUpperCase()} size={24} />
                  {String(name ?? "—")} →
                </span>
              ))}
          </div>

          {payments.length ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Related payments</div>
              {payments.map((p) => (
                <div
                  key={p.id}
                  onClick={() => pushPanel("payment", { id: p.id, label: p.razorpay_payment_id })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 0",
                    borderTop: "1px solid var(--divider)",
                    cursor: "pointer",
                  }}
                >
                  <Mono style={{ flex: 1 }}>{p.razorpay_payment_id ?? p.id.slice(0, 12)}</Mono>
                  <span style={{ fontSize: 13 }}>{rupees(p.amount_paise)}</span>
                  <StatusBadge status={p.status_key === "success" ? "Approved" : "Pending"} />
                </div>
              ))}
            </>
          ) : null}

          {messages.length ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, margin: "12px 0 6px" }}>
                Chat between the parties · {messages.length} message(s)
              </div>
              <div
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                  background: "var(--s2)",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                {messages.map((m) => (
                  <div key={m.id} style={{ fontSize: 12, padding: "4px 0", color: "var(--ink2)" }}>
                    <span style={{ color: "var(--ink3)" }}>{shortDate(m.created_at)} · </span>
                    {m.body}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 6 }}>
                Read-only. Admins never send in a user chat, here or anywhere.
              </div>
            </>
          ) : null}

          {resolved ? (
            <NoteStrip tone="ok">
              {`Resolved — ${String(data.outcome ?? "")}. ${String(data.resolution ?? "")}`}
            </NoteStrip>
          ) : null}

          {resolving ? (
            <ResolveDispute
              onClose={() => setResolving(false)}
              onSubmit={async (outcome, resolution) => {
                const ok = await act({ action: "dispute_resolve", outcome, resolution });
                if (ok) setResolving(false);
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

function ResolveDispute({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (outcome: string, resolution: string) => Promise<boolean>;
}) {
  const [outcome, setOutcome] = useState("no_liability");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Resolve dispute"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Resolving…" : "Resolve"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              await onSubmit(outcome, resolution);
              setBusy(false);
            }}
          />
        </>
      }
    >
      <NoteStrip tone="neutral">Both parties are notified with what you write below.</NoteStrip>
      <FField label="Outcome">
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={F_INPUT_STYLE}>
          {/* The values the table holds — not an invented set. */}
          <option value="no_liability">No liability — the platform is an intermediary</option>
          <option value="user_at_fault">User at fault</option>
          <option value="mediated">Mediated between the parties</option>
          <option value="escalated">Escalated outside the platform</option>
        </select>
      </FField>
      <FField label="Written outcome" helper="This is the record. Both parties receive it.">
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 110 }}
        />
      </FField>
    </Modal>
  );
}
