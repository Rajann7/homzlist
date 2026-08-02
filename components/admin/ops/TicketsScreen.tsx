"use client";

/**
 * A23 — Tickets. Template 2427-2483.
 *
 * The queue plus the thread. Two things the design draws that are easy to
 * render and hard to get right:
 *
 *  · The SLA column, and the RED ROW when it has passed. Both come from
 *    `sla_state`, derived in SQL from the due date — a stored flag is one
 *    nobody flips at the deadline.
 *  · The internal-note toggle on the composer. It changes the colour of the
 *    box AND the endpoint's behaviour: a note is not delivered, does not move
 *    the ticket to Replied, and does not stop the acknowledgement clock.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  DTable,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  Modal,
  ModTabs,
  NoteStrip,
  PageHead,
  Shimmer,
  StatusBadge,
  useToast,
  usePanels,
  type Col,
} from "@/components/admin/ds";
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup } from "@/components/admin/list";

type Row = {
  id: string;
  number: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  is_grievance: boolean;
  profile_id: string;
  user_name: string | null;
  user_photo: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  sla_state: string;
  sla_seconds_left: number | null;
  created_at: string;
};

const FILTER_KEYS = ["category", "priority", "assignee", "sla", "from", "to"] as const;

const TABS: [string, string][] = [
  ["open", "Open"],
  ["mine", "Assigned to me"],
  ["unassigned", "Unassigned"],
  ["replied", "Replied"],
  ["closed", "Closed"],
];

const CATEGORY_LABEL: Record<string, string> = {
  payment_refund: "Payment or refund",
  listing_not_approved: "Listing not approved",
  number_recovery: "Lost access to number",
  verification: "Verification",
  grievance: "Grievance",
  bug: "Bug",
  other: "Other",
};

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

/** "2h left" / "3h over" — the design's own shape. */
function slaLabel(r: Row): string {
  if (r.sla_state === "none") return "—";
  const secs = Number(r.sla_seconds_left ?? 0);
  const h = Math.round(Math.abs(secs) / 3600);
  if (secs < 0) return h < 1 ? "just over" : `${h}h over`;
  return h < 1 ? "<1h left" : `${h}h left`;
}

export function TicketsScreen({
  categories,
  assignees,
}: {
  categories: { value: string; label: string }[];
  assignees: { value: string; label: string }[];
}) {
  const toast = useToast();
  const list = useAdminList<Row>("tickets", FILTER_KEYS, "open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const groups: FilterGroup[] = [
    { key: "category", label: "Category", options: categories },
    {
      key: "priority",
      label: "Priority",
      options: [
        { value: "urgent", label: "Urgent" },
        { value: "high", label: "High" },
        { value: "normal", label: "Normal" },
        { value: "low", label: "Low" },
      ],
    },
    { key: "assignee", label: "Assignee", options: assignees },
    {
      key: "sla",
      label: "SLA",
      options: [
        { value: "over", label: "Overdue" },
        { value: "warn", label: "Due soon" },
        { value: "ok", label: "On time" },
      ],
    },
  ];

  const counts = list.data?.tabCounts ?? {};

  const cols: Col<Row>[] = [
    {
      label: "Ticket",
      cell: (r) => (
        <div>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {r.number}
            {r.is_grievance ? (
              <Badge bg="var(--errorSoft)" fg="var(--error)">
                Grievance
              </Badge>
            ) : null}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink2)",
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {r.subject}
          </div>
        </div>
      ),
    },
    {
      label: "Category",
      cell: (r) => (
        <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          {CATEGORY_LABEL[r.category] ?? r.category}
        </Badge>
      ),
    },
    {
      label: "User",
      cell: (r) => <UserCell row={r} />,
    },
    {
      label: "Priority",
      cell: (r) => (
        <Badge
          bg={r.priority === "urgent" ? "var(--errorSoft)" : r.priority === "high" ? "var(--warningSoft)" : "var(--s2)"}
          fg={r.priority === "urgent" ? "var(--error)" : r.priority === "high" ? "var(--warning)" : "var(--ink2)"}
        >
          {r.priority}
        </Badge>
      ),
    },
    {
      label: "Assignee",
      cell: (r) =>
        r.assignee_name ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Avatar initials={r.assignee_name.slice(0, 2).toUpperCase()} size={22} />
            {r.assignee_name}
          </span>
        ) : (
          <span style={{ color: "var(--ink3)" }}>Unassigned</span>
        ),
    },
    {
      label: "SLA",
      cell: (r) => (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color:
              r.sla_state === "over"
                ? "var(--error)"
                : r.sla_state === "warn"
                  ? "var(--warning)"
                  : "var(--ink3)",
          }}
        >
          {slaLabel(r)}
        </span>
      ),
    },
    {
      label: "Status",
      cell: (r) => (
        <StatusBadge
          status={r.status === "open" ? "Open" : r.status === "replied" ? "Pending" : "Approved"}
        />
      ),
    },
    {
      label: "",
      w: 40,
      cell: () => (
        <span style={{ color: "var(--ink3)" }}>
          <AdminIcon name="chevR" size={16} />
        </span>
      ),
    },
  ];

  const rows = (list.data?.rows ?? []).map((r) => ({
    ...r,
    _hl: r.sla_state === "over" ? "var(--error)" : undefined,
  }));

  return (
    <div>
      <PageHead title="Tickets" />
      <ModTabs
        tabs={TABS.map(([k, l]) => [k, l, counts[k]] as [string, string, number | undefined])}
        active={list.tab ?? "open"}
        onSelect={list.setTab}
      />

      <FilterBar
        placeholder="Ticket ID, phone, subject"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setFiltersOpen(true)}
        onClear={list.clearFilters}
        countLabel={`${(list.data?.total ?? 0).toLocaleString("en-IN")} tickets`}
      />

      {list.loading ? (
        <Shimmer h={280} />
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 70, color: "var(--ink3)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <AdminIcon name="inbox" size={64} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink1)" }}>
            {list.tab === "closed" ? "No closed tickets match" : "Nothing in this queue"}
          </div>
          <div style={{ fontSize: 13 }}>
            {list.tab === "closed"
              ? "Use search to find a specific closed ticket."
              : "New tickets appear here as users raise them."}
          </div>
        </div>
      ) : (
        <>
          <DTable cols={cols} rows={rows} onRow={(r) => setOpenId(r.id)} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {filtersOpen ? (
        <FilterSheet
          groups={groups}
          value={list.filters}
          onApply={(next) => {
            list.applyFilters(next);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      ) : null}

      {openId ? (
        <TicketPanel
          id={openId}
          assignees={assignees}
          onClose={() => setOpenId(null)}
          onChanged={(msg) => {
            toast(msg);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** The user cell opens the USER PANEL — §5: a user is a panel, everywhere. */
function UserCell({ row }: { row: Row }) {
  const { pushPanel } = usePanels();
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        pushPanel("user", { id: row.profile_id, name: row.user_name });
      }}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
    >
      <Avatar initials={(row.user_name ?? "U").slice(0, 2).toUpperCase()} size={24} />
      {row.user_name ?? "—"}
    </span>
  );
}

type Message = {
  id: string;
  author_kind: string;
  author_name: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
};

function TicketPanel({
  id,
  assignees,
  onClose,
  onChanged,
}: {
  id: string;
  assignees: { value: string; label: string }[];
  onClose: () => void;
  onChanged: (msg: string) => void;
}) {
  const toast = useToast();
  const { pushPanel } = usePanels();
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
      onChanged(String(json.data?.summary ?? ""));
    }
    return Boolean(json?.ok);
  };

  const messages = (data?.messages ?? []) as Message[];
  const canned = (data?.canned ?? []) as { id: string; title: string; body: string }[];
  const closed = data?.status === "closed";

  return (
    <Modal
      title={String(data?.number ?? "Ticket")}
      onClose={onClose}
      footer={<Btn label="Close panel" kind="outline" onClick={onClose} style={{ flex: 1 }} />}
    >
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
    </Modal>
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
