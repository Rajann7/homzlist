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
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup, ListError } from "@/components/admin/list";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { pushPanel, changed } = usePanels();

  // Acting inside the panel changes the SLA colour and the status the row
  // prints, so the list under it reloads when the panel reports a change.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

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

      {list.error ? (
        <ListError code={list.error} onRetry={list.reload} />
      ) : list.loading ? (
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
          <DTable cols={cols} rows={rows} onRow={(r) => pushPanel("ticket", { id: r.id, number: r.number })} />
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



