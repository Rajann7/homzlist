"use client";

/**
 * A26 — Audit log. Template 2565-2601.
 *
 * The screen P1 built the whole list engine against, finally mounted. It is the
 * only list in the panel that is EXPANDABLE rows rather than a table: the design
 * puts the IP, the device and the before/after diff inside the row (template
 * 2590), because those are what an investigation actually needs and a column
 * for each would not fit.
 *
 * Super-only, and read-only by construction — there is no write path to
 * `admin_audit_log` outside `writeAudit`, and no endpoint here that offers one.
 */

import { useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Mono,
  PageHead,
  RoleChip,
  Shimmer,
} from "@/components/admin/ds";
import { ExportModal, FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup } from "@/components/admin/list";

type Row = {
  id: string;
  created_at: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_label: string;
  summary: string;
  diff: Record<string, unknown> | null;
  ip: string | null;
  device: string | null;
  is_sensitive: boolean;
  case_ref: string | null;
};

const FILTER_KEYS = ["admin", "action", "entity", "from", "to", "severity"] as const;

/** template 2578 — the design's own colour per action. */
const ACTION_TONE: Record<string, [bg: string, fg: string]> = {
  approve: ["var(--accentSoft)", "var(--accent)"],
  reject: ["var(--errorSoft)", "var(--error)"],
  edit: ["var(--infoSoft)", "var(--info)"],
  delete: ["var(--errorSoft)", "var(--error)"],
  refund: ["var(--warningSoft)", "var(--warning)"],
  impersonate: ["var(--warningSoft)", "var(--warning)"],
  suspend: ["var(--errorSoft)", "var(--error)"],
  grant: ["var(--accentSoft)", "var(--accent)"],
  flag_change: ["var(--warningSoft)", "var(--warning)"],
  export: ["var(--warningSoft)", "var(--warning)"],
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function AuditScreen({
  admins,
  actions,
  entities,
}: {
  admins: { value: string; label: string }[];
  actions: { value: string; label: string }[];
  entities: { value: string; label: string }[];
}) {
  const list = useAdminList<Row>("audit", FILTER_KEYS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const groups: FilterGroup[] = [
    { key: "admin", label: "Admin", options: admins },
    { key: "action", label: "Action", options: actions },
    { key: "entity", label: "Entity", options: entities },
    {
      key: "severity",
      label: "Severity",
      options: [
        { value: "true", label: "Sensitive only" },
        { value: "false", label: "Routine only" },
      ],
    },
  ];

  const rows = list.data?.rows ?? [];

  return (
    <div>
      <PageHead
        title="Audit log"
        right={
          <button
            type="button"
            aria-label="Export audit log"
            onClick={() => setExportOpen(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--s1)",
              color: "var(--ink2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AdminIcon name="download" size={18} />
          </button>
        }
      />

      <FilterBar
        placeholder="Entity ID, user, IP"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setFiltersOpen(true)}
        onClear={list.clearFilters}
        countLabel={`${(list.data?.total ?? 0).toLocaleString("en-IN")} entries`}
      />

      {list.loading ? (
        <Shimmer h={320} />
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          Nothing matches those filters.
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {rows.map((r) => {
            const tone = ACTION_TONE[r.action] ?? ["var(--s2)", "var(--ink2)"];
            const open = expanded[r.id];
            return (
              <div
                key={r.id}
                style={{
                  borderTop: "1px solid var(--divider)",
                  // template 2586 — a sensitive entry carries a warning rail
                  borderLeft: `3px solid ${r.is_sensitive ? "var(--warning)" : "transparent"}`,
                  background: "var(--s1)",
                }}
              >
                <div
                  onClick={() => setExpanded((e) => ({ ...e, [r.id]: !open }))}
                  className="grid grid-cols-1 md:grid-cols-[150px_150px_120px_1fr_40px]"
                  style={{
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <Mono style={{ color: "var(--ink3)" }}>{stamp(r.created_at)}</Mono>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Avatar initials={(r.actor_name ?? "??").slice(0, 2).toUpperCase()} size={22} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.actor_name}
                    </span>
                  </span>
                  <span>
                    <Badge bg={tone[0]} fg={tone[1]}>
                      {r.action}
                    </Badge>
                  </span>
                  <span style={{ color: "var(--ink2)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <b style={{ color: "var(--ink1)" }}>{r.entity_label}</b> — {r.summary}
                  </span>
                  <span
                    style={{
                      color: "var(--ink3)",
                      display: "flex",
                      justifyContent: "flex-end",
                      transform: open ? "rotate(180deg)" : "none",
                      transition: "transform .2s",
                    }}
                  >
                    <AdminIcon name="chevD" size={16} />
                  </span>
                </div>

                {open ? (
                  <div
                    style={{
                      padding: "0 16px 14px",
                      fontSize: 12,
                      color: "var(--ink2)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <RoleChip role={r.actor_role} />
                      {/* The IP is already masked at write time (Doc9 §19). */}
                      <Mono style={{ color: "var(--ink3)" }}>
                        {r.ip ?? "—"} · {r.device ?? "—"}
                      </Mono>
                      {r.case_ref ? (
                        <Badge bg="var(--warningSoft)" fg="var(--warning)">
                          {r.case_ref}
                        </Badge>
                      ) : null}
                    </div>
                    {r.diff ? (
                      <pre
                        style={{
                          background: "var(--s2)",
                          borderRadius: 8,
                          padding: 10,
                          margin: 0,
                          fontSize: 11,
                          overflowX: "auto",
                          fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
                        }}
                      >
                        {JSON.stringify(r.diff, null, 2)}
                      </pre>
                    ) : (
                      <span style={{ color: "var(--ink3)" }}>No before/after recorded for this action.</span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Pager
        page={list.data?.page ?? 1}
        pageSize={list.data?.pageSize ?? 50}
        total={list.data?.total ?? 0}
        onPage={list.setPage}
      />

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

      {exportOpen ? (
        <ExportModal
          title="Export audit log"
          resource="audit"
          query={list.query}
          total={list.data?.total ?? 0}
          fields={[
            { key: "time", label: "Time" },
            { key: "admin", label: "Admin" },
            { key: "action", label: "Action" },
            { key: "entity", label: "Entity" },
            { key: "summary", label: "Summary" },
          ]}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}
