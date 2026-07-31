"use client";

/**
 * A3 — Listings queue. Template 597-673.
 *
 * Five sub-tabs, five filter pills, the saved-views/columns/export toolbar, a
 * bulk bar capped at 20, a desktop table and a mobile card list. All of it is
 * the P1 engine plus the P1b controls: this file draws the design's columns and
 * nothing else narrows anything locally.
 *
 * The lock column is the design's own (template 668-669): a row someone else is
 * reviewing is dimmed, not clickable, and carries their name in the tooltip.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminIcon,
  Badge,
  PageHead,
  RiskBadge,
  StatusBadge,
  Shimmer,
  Thumb,
  Avatar,
  useToast,
  SCREEN_ROUTES,
} from "@/components/admin/ds";
import {
  BulkBar,
  ColumnsSheet,
  ExportModal,
  FilterBar,
  FilterSheet,
  ListToolbar,
  Pager,
  SavedViewsMenu,
  useAdminList,
  type FilterGroup,
} from "@/components/admin/list";
import type { QueueFilterOptions } from "@/lib/admin/filter-options";

type Row = {
  id: string;
  title: string | null;
  type_code: string | null;
  status: string;
  created_at: string;
  area_label: string | null;
  city_name: string | null;
  poster_id: string;
  poster_name: string | null;
  poster_role: string | null;
  poster_is_new: boolean;
  risk_score: number;
  cover_url: string | null;
  locked_by: string | null;
  locked_by_name: string | null;
};

const FILTER_KEYS = ["type", "city", "status", "role", "from", "to"] as const;

/** template 601 — the five sub-tabs, with the design's dot colours. */
const TABS: [key: string, label: string, dot: string | null][] = [
  ["pending", "Pending", null],
  ["updated", "Updated after edit", "var(--warning)"],
  ["changes", "Changes requested", null],
  ["payment", "Payment pending", "var(--info)"],
  ["rejected", "Rejected", null],
];

const COLUMNS = [
  { key: "listing", label: "Listing" },
  { key: "type", label: "Type" },
  { key: "location", label: "Location" },
  { key: "poster", label: "Poster" },
  { key: "risk", label: "Risk" },
  { key: "queue", label: "In queue" },
  { key: "status", label: "Status" },
];

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending",
  changes_requested: "Changes Requested",
  payment_pending: "Payment pending",
  rejected: "Rejected",
};

/** "26h" / "2d" — the design's own age format, and its SLA colours. */
function age(iso: string): { text: string; sla: "ok" | "warn" | "over" } {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  const text = hours < 1 ? "<1h" : hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  return { text, sla: hours >= 24 ? "over" : hours >= 12 ? "warn" : "ok" };
}

const slaColor = (sla: "ok" | "warn" | "over") =>
  sla === "over" ? "var(--error)" : sla === "warn" ? "var(--warning)" : "var(--ink3)";

export function ListingsQueue({ options }: { options: QueueFilterOptions }) {
  const router = useRouter();
  const toast = useToast();
  const list = useAdminList<Row>("listings", FILTER_KEYS, "pending");
  const [sheet, setSheet] = useState<"filters" | "columns" | "export" | "views" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(COLUMNS.map((c) => c.key));
  const [busy, setBusy] = useState(false);

  const tab = list.tab ?? "pending";
  const tabLabel = TABS.find((t) => t[0] === tab)?.[1] ?? "Pending";
  const rows = list.data?.rows ?? [];
  const shows = (key: string) => visibleColumns.includes(key);

  const groups: FilterGroup[] = [
    { key: "type", label: "Type", options: options.types },
    { key: "city", label: "City", options: options.cities },
    { key: "role", label: "Poster role", options: options.roles },
  ];

  const open = (row: Row) => {
    if (row.locked_by) return;
    router.push(`${SCREEN_ROUTES.listings}/${row.id}`);
  };

  /** Bulk approve/reject — one request per subject, so each gets its own audit row. */
  async function bulk(action: "approve" | "reject") {
    if (busy || !selected.length) return;
    setBusy(true);
    const reason = action === "reject" ? "Bulk rejected from the queue" : undefined;
    const results = await Promise.all(
      selected.map((id) =>
        fetch(`/api/v1/admin/queues/listings/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ action, reason }),
        })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    const done = results.filter(Boolean).length;
    setBusy(false);
    setSelected([]);
    list.reload();
    toast(
      done === selected.length
        ? `${done} listing${done === 1 ? "" : "s"} ${action === "approve" ? "approved" : "rejected"}`
        : `${done} of ${results.length} ${action === "approve" ? "approved" : "rejected"} — the rest had already moved`,
    );
  }

  // template 602 — "12 pending", "3 changes requested": the count of THIS tab.
  const countLabel = `${list.data?.tabCounts?.[tab] ?? 0} ${tabLabel.toLowerCase()}`;

  return (
    <div>
      <PageHead
        title="Listings queue"
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
            {countLabel}
          </Badge>
        }
        right={
          <ListToolbar
            viewLabel="All pending"
            onOpenViews={() => setSheet("views")}
            onOpenColumns={() => setSheet("columns")}
            onOpenExport={() => setSheet("export")}
          />
        }
      />

      {/* template 612 — sub-tabs with real counts */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--divider)",
          marginBottom: 14,
          overflowX: "auto",
        }}
      >
        {TABS.map(([key, label, dot]) => (
          <div
            key={key}
            onClick={() => {
              setSelected([]);
              list.setTab(key);
            }}
            style={{
              padding: "10px 12px",
              fontSize: 15,
              fontWeight: 600,
              color: tab === key ? "var(--ink1)" : "var(--ink3)",
              borderBottom: `2px solid ${tab === key ? "var(--accent)" : "transparent"}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            {dot ? (
              <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} />
            ) : null}
            {label}
            <span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 600 }}>
              {list.data?.tabCounts?.[key] ?? 0}
            </span>
          </div>
        ))}
      </div>

      <FilterBar
        placeholder="Search title, area or poster…"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setSheet("filters")}
        onClear={list.clearFilters}
        countLabel={`${list.data?.total ?? 0} listings`}
      />

      <BulkBar
        selected={selected}
        cap={20}
        onClear={() => setSelected([])}
        actions={[
          { key: "approve", label: "Approve selected", onRun: () => bulk("approve") },
          { key: "reject", label: "Reject selected", kind: "danger", onRun: () => bulk("reject") },
        ]}
      />

      {list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Shimmer key={i} h={56} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        /* template 627-630 */
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
            All listings are reviewed. Nice work.
          </div>
        </div>
      ) : (
        <>
          {/* MOBILE CARDS — template 635-646 */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {rows.map((r) => {
              const a = age(r.created_at);
              const locked = Boolean(r.locked_by);
              return (
                <div
                  key={r.id}
                  onClick={() => open(r)}
                  style={{
                    background: "var(--s1)",
                    border: `1px solid ${a.sla === "over" ? "var(--error)" : "var(--border)"}`,
                    borderLeft: a.sla === "over" ? "3px solid var(--error)" : "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                    opacity: locked ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: "flex", gap: 10 }}>
                    <Thumb size={48} src={r.cover_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)" }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                        {`ID #${r.id.slice(0, 8)} · ${r.area_label ?? r.city_name ?? ""}`}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          marginTop: 8,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <RiskBadge score={r.risk_score} />
                        <StatusBadge status={STATUS_LABEL[r.status] ?? r.status} />
                        <span
                          style={{ fontSize: 13, fontWeight: 600, color: slaColor(a.sla) }}
                        >
                          {a.text}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP TABLE — template 649-670 */}
          <div
            className="hidden md:block"
            style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}
              >
                <thead>
                  <tr>
                    <Th width={40} />
                    {shows("listing") ? <Th>Listing</Th> : null}
                    {shows("type") ? <Th className="hidden desktop:table-cell">Type</Th> : null}
                    {shows("location") ? <Th>Location</Th> : null}
                    {shows("poster") ? <Th>Poster</Th> : null}
                    {shows("risk") ? (
                      <Th onClick={() => list.setSort("risk_score")}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          Risk
                          <AdminIcon name="chevD" size={14} />
                        </span>
                      </Th>
                    ) : null}
                    {shows("queue") ? (
                      <Th onClick={() => list.setSort("created_at")}>In queue</Th>
                    ) : null}
                    {shows("status") ? <Th>Status</Th> : null}
                    <Th width={40} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = age(r.created_at);
                    const locked = Boolean(r.locked_by);
                    const isSel = selected.includes(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => open(r)}
                        style={{
                          borderTop: "1px solid var(--divider)",
                          cursor: locked ? "default" : "pointer",
                          background: isSel ? "var(--accentSoft)" : "transparent",
                          opacity: locked ? 0.5 : 1,
                          borderLeft:
                            a.sla === "over" ? "3px solid var(--error)" : "3px solid transparent",
                        }}
                      >
                        <Td>
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={locked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() =>
                              setSelected((s) =>
                                s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id],
                              )
                            }
                            style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }}
                          />
                        </Td>
                        {shows("listing") ? (
                          <Td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Thumb size={40} src={r.cover_url} />
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "var(--ink1)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: 200,
                                  }}
                                >
                                  {r.title}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                                  {`ID #${r.id.slice(0, 8)}`}
                                </div>
                              </div>
                            </div>
                          </Td>
                        ) : null}
                        {shows("type") ? (
                          <Td className="hidden desktop:table-cell">
                            <Badge
                              bg="var(--s2)"
                              fg="var(--ink2)"
                              style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
                            >
                              {r.type_code ?? "—"}
                            </Badge>
                          </Td>
                        ) : null}
                        {shows("location") ? (
                          <Td>
                            <span style={{ color: "var(--ink2)", whiteSpace: "nowrap" }}>
                              {r.area_label ?? r.city_name ?? "—"}
                            </span>
                          </Td>
                        ) : null}
                        {shows("poster") ? (
                          <Td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Avatar initials={initials(r.poster_name)} size={24} />
                              <div>
                                <div style={{ fontSize: 13, color: "var(--ink1)" }}>
                                  {r.poster_name}
                                </div>
                                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                                  <Badge
                                    bg="var(--s2)"
                                    fg="var(--ink3)"
                                    style={{
                                      fontSize: 10,
                                      padding: "1px 5px",
                                      textTransform: "none",
                                      letterSpacing: 0,
                                    }}
                                  >
                                    {r.poster_role ?? ""}
                                  </Badge>
                                  {r.poster_is_new ? (
                                    <Badge
                                      bg="var(--warningSoft)"
                                      fg="var(--warning)"
                                      style={{ fontSize: 10, padding: "2px 5px" }}
                                    >
                                      New account
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </Td>
                        ) : null}
                        {shows("risk") ? (
                          <Td>
                            <RiskBadge score={r.risk_score} />
                          </Td>
                        ) : null}
                        {shows("queue") ? (
                          <Td>
                            <span
                              style={{ fontSize: 13, fontWeight: 600, color: slaColor(a.sla) }}
                            >
                              {a.text}
                            </span>
                          </Td>
                        ) : null}
                        {shows("status") ? (
                          <Td>
                            {locked ? (
                              <Badge bg="var(--s3)" fg="var(--ink3)">
                                Locked
                              </Badge>
                            ) : (
                              <StatusBadge status={STATUS_LABEL[r.status] ?? r.status} />
                            )}
                          </Td>
                        ) : null}
                        <Td>
                          <span
                            style={{ color: "var(--ink3)" }}
                            title={locked ? `${r.locked_by_name} is reviewing` : undefined}
                          >
                            <AdminIcon name={locked ? "lock" : "chevR"} size={16} />
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {sheet === "filters" ? (
        <FilterSheet
          groups={groups}
          value={list.filters}
          onApply={(next) => {
            list.applyFilters(next);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "columns" ? (
        <ColumnsSheet
          resource="listings"
          all={COLUMNS}
          visible={visibleColumns}
          onSaved={setVisibleColumns}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "export" ? (
        <ExportModal
          title="Export listings"
          resource="listings"
          query={list.query}
          total={list.data?.total ?? 0}
          fields={COLUMNS}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "views" ? (
        <SavedViewsMenu
          resource="listings"
          currentFilters={list.filters}
          onApply={(filters) => {
            list.applyFilters(filters);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

function initials(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || n.slice(0, 2).toUpperCase();
}

/* template 649-650 — the queue table's own th/td */
function Th({
  children,
  width,
  className,
  onClick,
}: {
  children?: React.ReactNode;
  width?: number;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <th
      className={className}
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink2)",
        position: "sticky",
        top: 0,
        background: "var(--s2)",
        whiteSpace: "nowrap",
        width,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td
      className={className}
      style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink1)", verticalAlign: "middle" }}
    >
      {children}
    </td>
  );
}
