"use client";

/**
 * A30 — Exports. Template 2719-2760.
 *
 * The history of every file the panel has produced. P1b already built the
 * machinery (one `exports` table, one private bucket, one personal-data flag,
 * one audit rule); this is the screen that reads it back.
 *
 * The thing it must be honest about is EXPIRY. A "Ready" row whose file expired
 * two days ago is a download button that 404s, so `state_key` derives from the
 * expiry date and a stale row says Expired.
 */

import { useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  DTable,
  Mono,
  NoteStrip,
  PageHead,
  Shimmer,
  StatusBadge,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup } from "@/components/admin/list";

type Row = {
  id: string;
  name: string;
  entity: string;
  format: string;
  row_count: number | null;
  status: string;
  reason: string | null;
  contains_personal_data: boolean;
  requested_by_name: string | null;
  expires_at: string | null;
  created_at: string;
  state_key: string;
  expires_in_seconds: number | null;
};

const ago = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)} day${mins < 2880 ? "" : "s"} ago`;
};

const expiresIn = (secs: number | null) => {
  if (secs === null) return "—";
  if (secs <= 0) return "Expired";
  const h = Math.floor(secs / 3600);
  return h < 1 ? "in <1h" : `in ${h}h`;
};

export function ExportsScreen({ entities }: { entities: { value: string; label: string }[] }) {
  const toast = useToast();
  const list = useAdminList<Row>("exports", ["entity", "format", "personal"], "all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const groups: FilterGroup[] = [
    { key: "entity", label: "Type", options: entities },
    {
      key: "format",
      label: "Format",
      options: [
        { value: "csv", label: "CSV" },
        { value: "xlsx", label: "XLSX" },
      ],
    },
    {
      key: "personal",
      label: "Personal data",
      options: [
        { value: "true", label: "Contains personal data" },
        { value: "false", label: "No personal data" },
      ],
    },
  ];

  const download = (r: Row) => {
    if (r.state_key !== "ready") {
      toast(r.state_key === "expired" ? "That file has expired" : "That export is not ready");
      return;
    }
    // The download is audited server-side (P1b), which is why it is a real
    // navigation to the endpoint rather than a direct bucket URL.
    window.location.href = `/api/v1/admin/export/${r.id}`;
  };

  const cols: Col<Row>[] = [
    {
      label: "Export",
      cell: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          {r.contains_personal_data ? (
            <Badge bg="var(--warningSoft)" fg="var(--warning)" style={{ textTransform: "none", letterSpacing: 0 }}>
              personal data
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      label: "Type",
      cell: (r) => (
        <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          {r.entity}
        </Badge>
      ),
    },
    { label: "Rows", cell: (r) => (r.row_count ?? 0).toLocaleString("en-IN") },
    { label: "Format", cell: (r) => <Mono>{r.format.toUpperCase()}</Mono> },
    {
      label: "Requested by",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Avatar initials={(r.requested_by_name ?? "??").slice(0, 2).toUpperCase()} size={22} />
          {r.requested_by_name ?? "—"}
        </span>
      ),
    },
    { label: "Requested", cell: (r) => <span style={{ color: "var(--ink3)" }}>{ago(r.created_at)}</span> },
    {
      label: "Status",
      cell: (r) => (
        <StatusBadge
          status={
            r.state_key === "ready"
              ? "Approved"
              : r.state_key === "processing"
                ? "Pending"
                : r.state_key === "failed"
                  ? "Rejected"
                  : "Expired"
          }
        />
      ),
    },
    {
      label: "Expires",
      cell: (r) => (
        <span
          style={{
            fontSize: 12,
            color: (r.expires_in_seconds ?? 0) <= 0 ? "var(--ink3)" : "var(--ink2)",
          }}
        >
          {expiresIn(r.expires_in_seconds)}
        </span>
      ),
    },
    {
      label: "",
      cell: (r) =>
        r.state_key === "ready" ? (
          <Btn
            label="Download"
            kind="outline"
            style={{ height: 30, fontSize: 12 }}
            onClick={() => download(r)}
          />
        ) : r.state_key === "failed" ? (
          <span title={r.reason ?? ""} style={{ fontSize: 12, color: "var(--error)" }}>
            {r.reason ? r.reason.slice(0, 40) : "Failed"}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHead title="Exports" />
      <NoteStrip tone="neutral">
        Every export is written to a private bucket, expires on the retention schedule, and is
        logged — including who downloaded it.
      </NoteStrip>

      <FilterBar
        placeholder="Search exports"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setFiltersOpen(true)}
        onClear={list.clearFilters}
        countLabel={`${(list.data?.total ?? 0).toLocaleString("en-IN")} exports`}
      />

      {list.loading ? (
        <Shimmer h={280} />
      ) : (list.data?.rows ?? []).length === 0 ? (
        <div style={{ textAlign: "center", padding: 70, color: "var(--ink3)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <AdminIcon name="inbox" size={64} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink1)" }}>No exports yet</div>
          <div style={{ fontSize: 13 }}>Exports you generate from any list appear here.</div>
        </div>
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} />
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
