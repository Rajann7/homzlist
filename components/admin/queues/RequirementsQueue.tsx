"use client";

/**
 * A5 — Requirements queue. Template 829-847, and its detail right-sheet (1643).
 *
 * Doc5: "Same pattern as A3/A4; render = RequirementCard + full fields; actions
 * identical." The difference from A3 is that a requirement has no page of its
 * own to review — the design opens it in a right sheet, decides, and returns.
 *
 * The sheet's Unlocked/Locked toggle is the design showing the moderator BOTH
 * states a buyer can see: a requirement is a paid unlock, so what a seller sees
 * before paying is part of what is being approved.
 */

import { useState } from "react";
import {
  Badge,
  Btn,
  PageHead,
  QueueTable,
  RightSheet,
  RiskBadge,
  StatusBadge,
  Shimmer,
  Avatar,
  AdminIcon,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup, ListError } from "@/components/admin/list";
import type { QueueFilterOptions } from "@/lib/admin/filter-options";
import { QueueTabs, initialsOf, ageOf, budgetLabel } from "./shared";

type Row = {
  id: string;
  status: string;
  created_at: string;
  type_code: string | null;
  kind: string | null;
  bhk: number | null;
  budget_min_paise: number | null;
  budget_max_paise: number | null;
  area_label: string | null;
  urgency: string | null;
  notes: string | null;
  poster_id: string;
  poster_name: string | null;
  poster_role: string | null;
  city_name: string | null;
  risk_score: number;
  locked_by: string | null;
  locked_by_name: string | null;
};

const FILTER_KEYS = ["type", "city", "status", "role", "from", "to"] as const;

const TABS: [string, string][] = [
  ["pending", "Pending"],
  ["changes", "Changes requested"],
  ["rejected", "Rejected"],
];

const SOP = [
  "Budget range is realistic",
  "Areas exist in master data",
  "No contact details in notes",
  "Not a disguised advertisement",
];

export function RequirementsQueue({ options }: { options: QueueFilterOptions }) {
  const toast = useToast();
  const list = useAdminList<Row>("requirements", FILTER_KEYS, "pending");
  const [open, setOpen] = useState<Row | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const tab = list.tab ?? "pending";
  const rows = list.data?.rows ?? [];

  const groups: FilterGroup[] = [
    { key: "type", label: "Type", options: options.types },
    { key: "city", label: "City", options: options.cities },
    { key: "role", label: "Poster role", options: options.roles },
  ];

  const cols: Col<Row>[] = [
    {
      label: "Requirement",
      cell: (r) => (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>
              {budgetLabel(r.budget_min_paise, r.budget_max_paise)}
            </span>
            <Badge
              bg="var(--s2)"
              fg="var(--ink2)"
              style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
            >
              {`${r.kind === "rent" ? "Rent" : "Buy"} · ${r.type_code ?? ""}`}
            </Badge>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
            {`ID #${r.id.slice(0, 8)}`}
          </div>
        </div>
      ),
    },
    {
      label: "Areas",
      cell: (r) => <span style={{ color: "var(--ink2)" }}>{r.area_label ?? r.city_name ?? "—"}</span>,
    },
    {
      label: "Poster",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Avatar initials={initialsOf(r.poster_name)} size={24} />
          {r.poster_name}
        </div>
      ),
    },
    { label: "Risk", cell: (r) => <RiskBadge score={r.risk_score} /> },
    {
      label: "In queue",
      cell: (r) => {
        const a = ageOf(r.created_at);
        return (
          <span style={{ fontSize: 13, fontWeight: 600, color: a.color }}>{a.text}</span>
        );
      },
    },
    { label: "Status", cell: (r) => <StatusBadge status={statusLabel(r.status)} /> },
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

  return (
    <div>
      <PageHead
        title="Requirements queue"
        sub={
          <Badge
            bg="var(--s2)"
            fg="var(--ink2)"
            style={{
              textTransform: "none",
              letterSpacing: 0,
              fontWeight: 600,
              fontSize: 13,
              padding: "5px 10px",
              borderRadius: 999,
            }}
          >
            {`${list.data?.tabCounts?.[tab] ?? 0} ${
              TABS.find((t) => t[0] === tab)?.[1].toLowerCase() ?? "pending"
            }`}
          </Badge>
        }
      />

      <QueueTabs tabs={TABS} active={tab} counts={list.data?.tabCounts ?? {}} onPick={list.setTab} />

      <FilterBar
        placeholder="Search area, poster or notes…"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setFiltersOpen(true)}
        onClear={list.clearFilters}
        countLabel={`${list.data?.total ?? 0} requirements`}
      />

      {list.error ? (
        <ListError code={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} h={56} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyQueue />
      ) : (
        <>
          <QueueTable<Row> cols={cols} rows={rows} onRow={(r) => setOpen(r)} />
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

      {open ? (
        <RequirementSheet
          row={open}
          onClose={() => setOpen(null)}
          onDone={(msg) => {
            setOpen(null);
            toast(msg);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "pending_review") return "Pending";
  if (status === "changes_requested") return "Changes Requested";
  return "Rejected";
}

/* template 1643-1650 */
function RequirementSheet({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<"Unlocked" | "Locked">("Unlocked");
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  async function decide(action: "approve" | "reject" | "request_changes", label: string) {
    if (busy) return;
    setBusy(true);
    const body: Record<string, unknown> = { action };
    if (action === "reject") body.reason = "Did not meet the requirement rules";
    if (action === "request_changes") {
      body.notes = { Notes: "Please add more detail to this requirement." };
    }
    const res = await fetch(`/api/v1/admin/queues/requirements/${row.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean } | null;
    setBusy(false);
    if (!json?.ok) {
      toast("That didn't go through — it may already be decided");
      return;
    }
    onDone(label);
  }

  return (
    <RightSheet
      title={`Requirement #${row.id.slice(0, 8)}`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Reject" kind="danger" onClick={() => decide("reject", "Rejected")} />
          <Btn
            label="Request changes"
            kind="warn"
            onClick={() => decide("request_changes", "Change request sent")}
          />
          <Btn
            label={busy ? "Working…" : "Approve"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={() => decide("approve", "Requirement approved")}
          />
        </>
      }
    >
      <div
        style={{
          display: "inline-flex",
          background: "var(--s2)",
          borderRadius: 999,
          padding: 3,
          marginBottom: 12,
        }}
      >
        {(["Unlocked", "Locked"] as const).map((t) => (
          <div
            key={t}
            onClick={() => setView(t)}
            style={{
              padding: "5px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: view === t ? "var(--s1)" : "transparent",
              color: view === t ? "var(--ink1)" : "var(--ink3)",
            }}
          >
            {t}
          </div>
        ))}
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 14,
          background: "var(--s1)",
        }}
      >
        {view === "Locked" ? (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ color: "var(--ink3)", display: "flex", justifyContent: "center" }}>
              <AdminIcon name="lock" size={28} />
            </div>
            <div style={{ fontSize: 13, color: "var(--ink3)", marginTop: 8 }}>
              Unlock with a plan to see full details
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>
              {budgetLabel(row.budget_min_paise, row.budget_max_paise)}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 2 }}>
              {`${row.kind === "rent" ? "Rent" : "Buy"} · ${row.type_code ?? ""} · ${row.area_label ?? ""}`}
            </div>
          </div>
        )}
      </div>

      <SheetSection>Submitted fields</SheetSection>
      <SheetRow label="Type" value={`${row.kind === "rent" ? "Rent" : "Buy"} · ${row.type_code ?? "—"}`} />
      <SheetRow label="Budget" value={budgetLabel(row.budget_min_paise, row.budget_max_paise)} />
      <SheetRow label="Preferred areas" value={row.area_label ?? "—"} />
      <SheetRow label="BHK" value={row.bhk ? String(row.bhk) : "—"} />
      <SheetRow label="Urgency" value={row.urgency ?? "—"} />
      <SheetRow label="Notes" value={row.notes ?? "—"} />

      <SheetSection>SOP checklist</SheetSection>
      {SOP.map((t, i) => (
        <label
          key={i}
          style={{
            display: "flex",
            gap: 8,
            fontSize: 12,
            color: "var(--ink2)",
            padding: "4px 0",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(checks[i])}
            onChange={() => setChecks((c) => ({ ...c, [i]: !c[i] }))}
            style={{ accentColor: "var(--accent)" }}
          />
          {t}
        </label>
      ))}
    </RightSheet>
  );
}

/* template 1638-1639 — the sheets' own section head and label/value row */
export function SheetSection({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink3)",
        textTransform: "uppercase",
        letterSpacing: ".3px",
        margin: "18px 0 8px",
      }}
    >
      {children}
    </div>
  );
}

export function SheetRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", padding: "6px 0", borderTop: "1px solid var(--divider)" }}>
      <div style={{ fontSize: 13, color: "var(--ink3)", width: 120, flex: "none" }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--ink1)", flex: 1 }}>{value}</div>
    </div>
  );
}

export function EmptyQueue({ note }: { note?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "70px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ color: "var(--ink3)" }}>
        <AdminIcon name="inbox" size={96} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink1)" }}>Queue is clear</div>
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>
        {note ?? "Everything here is reviewed. Nice work."}
      </div>
    </div>
  );
}
