"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { QueueRow, QueueTab } from "@/lib/admin/queues";
import type { QueueFilterOptions } from "@/lib/admin/queueFilters";
import { RiskBadge, StatusBadge, SlaText, Thumb, Initials } from "./queueBits";
import { Btn, Chip, Dropdown, DropdownItem, Modal, NoteBlock, RightSheet } from "./overlays";
import { AdminToast } from "./AdminToast";

/**
 * A3's screen, built to the design exactly (P13 A3 / designs `listingsEl`):
 * page head + count chip + saved views/columns/export · sub-tabs with dots and
 * counts · filter chips + Clear all · bulk bar (max 20) · table from tablet up,
 * cards at mobile only · empty + skeleton.
 *
 * Each control wears the SHAPE the design gives it, which is not all the same:
 *   saved views → an anchored DROPDOWN (no scrim)
 *   columns     → a RIGHT-SHEET with one full-width "Done"
 *   filters     → a RIGHT-SHEET of chip groups with Clear + Apply
 *   export      → a MODAL with Format radios and a Fields list
 *   bulk, risk  → MODALs
 * They were all Modals here, which flattened four different affordances into one.
 *
 * The numbers are the only departure from the mock, and it is the required one:
 * the design hardcodes "12 pending"; these are counted (CLAUDE.md rule 12).
 */

interface Props {
  title: string;
  subject: string;
  basePath: string;
  tabs: QueueTab[];
  tab: string;
  counts: Record<string, number>;
  rows: QueueRow[];
  canDecide: boolean;
  /** admin_saved_views.queue / exports.entity key for this screen. */
  queueKey: string;
  /** Real option rows for the filter sheet (lib/admin/queueFilters). */
  filterOptions: QueueFilterOptions;
}

const BULK_MAX = 20;

/** The design's column list for A3, in its order. */
const COLUMNS = ["Listing", "Type", "Location", "Poster", "Risk", "In queue", "Status"] as const;

/** The design's export field list, in its order. */
const EXPORT_FIELDS = ["Listing ID", "Title", "Type", "Location", "Poster", "Risk", "Status", "In queue"] as const;

/** The design's filter groups: which option list feeds which query param. */
const FACETS = [
  { key: "types", param: "type", label: "Type" },
  { key: "cities", param: "city", label: "City" },
  { key: "risks", param: "risk", label: "Risk" },
  { key: "roles", param: "role", label: "Role" },
] as const satisfies ReadonlyArray<{ key: keyof QueueFilterOptions; param: string; label: string }>;

interface SavedView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  shared: boolean;
  mine: boolean;
}

export function QueueScreen({ title, subject, basePath, tabs, tab, counts, rows, canDecide, queueKey, filterOptions }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [riskTip, setRiskTip] = useState<QueueRow | null>(null);
  const [sheet, setSheet] = useState<null | "views" | "columns" | "export" | "filter" | "bulk">(null);
  const [busy, setBusy] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [hidden, setHidden] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  /** Filter sheet selections, staged until Apply. */
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  /** Export field selection — the design pre-ticks the first six. */
  const [fields, setFields] = useState<string[]>(() => EXPORT_FIELDS.slice(0, 6));

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  const activeView = params.get("view") ?? `All ${tab}`;

  // Column visibility is a display preference, not business data, so
  // localStorage is the correct home for it (CLAUDE.md rule 3 permits UI prefs).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`hz-admin-cols-${queueKey}`);
      if (raw) setHidden(JSON.parse(raw));
    } catch {
      /* a corrupt pref must never break the queue */
    }
  }, [queueKey]);

  const toggleColumn = (c: string) => {
    setHidden((h) => {
      const next = h.includes(c) ? h.filter((x) => x !== c) : [...h, c];
      localStorage.setItem(`hz-admin-cols-${queueKey}`, JSON.stringify(next));
      return next;
    });
  };
  const shows = (c: string) => !hidden.includes(c);

  /** Views load when the dropdown opens — no reason to fetch them on every render. */
  useEffect(() => {
    if (sheet !== "views") return;
    let dead = false;
    (async () => {
      const r = await fetch(`/api/v1/admin/saved-views?queue=${queueKey}`, { cache: "no-store" });
      const j = await r.json();
      if (!dead && j.ok) setViews(j.data.views);
    })();
    return () => {
      dead = true;
    };
  }, [sheet, queueKey]);

  const applyView = (v: SavedView) => {
    const q = new URLSearchParams({ tab, view: v.name });
    for (const [k, val] of Object.entries(v.filters)) {
      if (val != null && val !== "") q.set(k, String(val));
    }
    router.push(`${basePath}?${q}`);
  };

  const saveCurrentView = async () => {
    const name = window.prompt("Name this view", `${title} · ${tab}`);
    if (!name) return;
    setBusy(true);
    try {
      const filters: Record<string, string> = {};
      for (const k of ["risk", "type", "city", "role", "since"]) {
        const v = params.get(k);
        if (v) filters[k] = v;
      }
      const r = await fetch("/api/v1/admin/saved-views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue: queueKey, name, filters, shared: false }),
        cache: "no-store",
      });
      if (r.ok) {
        const j = await r.json();
        setViews((vs) => [...vs, { id: j.data.id, name, filters, shared: false, mine: true }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setBusy(true);
    try {
      // `fields` rides in the filters jsonb: the design offers a field list, and an
      // export row has to record what was actually asked for or the list is
      // decoration. A30 (P6) reads it when it builds the file.
      const filters: Record<string, unknown> = { tab, fields };
      for (const k of ["risk", "type", "city", "role"]) {
        const v = params.get(k);
        if (v) filters[k] = v;
      }
      const r = await fetch("/api/v1/admin/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: queueKey,
          name: `${title} · ${tab}`,
          filters,
          format,
          rowCount: rows.length,
        }),
        cache: "no-store",
      });
      if (r.ok) {
        setSheet(null);
        // The design's toast, and it is the truth: the file is collected in A30.
        show("Export ready — check Exports Centre");
      }
    } finally {
      setBusy(false);
    }
  };

  const activeTab = tabs.find((t) => t.key === tab);
  const countChip = `${counts[tab] ?? 0} ${(activeTab?.label ?? "pending").toLowerCase()}`;
  const riskFilter = params.get("risk");

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.push(`${basePath}${q.toString() ? `?${q}` : ""}`);
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= BULK_MAX ? s : [...s, id]));

  const runBulk = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/admin/queues/${subject}/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selected, action, reason: action === "reject" ? "Bulk rejection" : undefined }),
        cache: "no-store",
      });
      if (r.ok) {
        setSelected([]);
        setSheet(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Page head */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--ink-primary)" }}>
          {title}
        </h1>
        <span
          className="rounded-full px-[10px] py-[5px] text-[13px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          {countChip}
        </span>
        <div className="flex-1" />
        {/* Design: gap 8, a 36px-high labelled button then two 36×36 icon buttons. */}
        <div className="flex items-center gap-2">
          {/* The saved-views dropdown is anchored to its own button, so this wrapper
              is `relative` — the design's absolute top:150/right:60 is the same
              picture inside its fixed frame. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSheet(sheet === "views" ? null : "views")}
              aria-expanded={sheet === "views"}
              aria-haspopup="menu"
              className="flex h-9 items-center gap-[6px] rounded-8 border px-3 text-[13px] font-semibold"
              style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-primary)" }}
            >
              {activeView}
              <Icon name="chevron-down" size={16} />
            </button>

            {sheet === "views" && (
              <Dropdown onClose={() => setSheet(null)}>
                <DropdownItem
                  onSelect={() => {
                    setSheet(null);
                    router.push(`${basePath}?tab=${tab}`);
                  }}
                >
                  All {tab}
                </DropdownItem>
                {views.map((v) => (
                  <DropdownItem
                    key={v.id}
                    onSelect={() => {
                      setSheet(null);
                      applyView(v);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    {!v.shared && (
                      <span className="shrink-0 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                        private
                      </span>
                    )}
                  </DropdownItem>
                ))}
                {views.length === 0 && (
                  <p className="px-3 py-2 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
                    No saved views yet.
                  </p>
                )}
                <DropdownItem accent topBorder disabled={busy} onSelect={saveCurrentView}>
                  + Save current view
                </DropdownItem>
              </Dropdown>
            )}
          </div>

          <IconBtn label="Columns" icon="sliders" onClick={() => setSheet("columns")} />
          <IconBtn label="Export" icon="download" onClick={() => setSheet("export")} />
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="mb-[14px] flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--divider)" }}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setSelected([]);
                go({ tab: t.key });
              }}
              className="flex shrink-0 items-center gap-[6px] px-3 py-[10px] text-[15px] font-semibold"
              style={{
                color: on ? "var(--ink-primary)" : "var(--ink-tertiary)",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
              }}
            >
              {t.dot && (
                <span
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ background: t.dot === "warning" ? "var(--warning)" : "var(--info)" }}
                />
              )}
              {t.label}
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-tertiary)" }}>
                {counts[t.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter chips */}
      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        {["Type", "City", "Risk", "Date", "Role"].map((f) => {
          const on = f === "Risk" && riskFilter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setSheet("filter")}
              className="inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px]"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                background: on ? "var(--accent-soft)" : "var(--surface-1)",
                color: on ? "var(--accent)" : "var(--ink-secondary)",
              }}
            >
              {on ? `Risk: ${riskFilter}` : f}
              <Icon name="chevron-down" size={14} />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => router.push(`${basePath}?tab=${tab}`)}
          className="ml-1 text-[13px] font-semibold"
          style={{ color: "var(--accent)" }}
        >
          Clear all
        </button>
      </div>

      {/* Bulk bar */}
      {selected.length > 0 && (
        <div
          className="mb-[14px] flex flex-wrap items-center gap-3 rounded-8 border px-3 py-2"
          style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}
        >
          <span className="text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {selected.length} selected
          </span>
          <button
            type="button"
            disabled={!canDecide}
            onClick={() => setSheet("bulk")}
            className="h-8 rounded-8 border px-3 text-[13px] font-semibold disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--ink-primary)" }}
            title={canDecide ? undefined : "Admin only"}
          >
            Approve selected
          </button>
          <button
            type="button"
            disabled={!canDecide}
            onClick={() => runBulk("reject")}
            className="h-8 rounded-8 border px-3 text-[13px] font-semibold disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--ink-primary)" }}
            title={canDecide ? undefined : "Admin only"}
          >
            Reject selected
          </button>
          <button type="button" onClick={() => setSelected([])} className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
            Clear
          </button>
          <span className="ml-auto text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            Max {BULK_MAX} at a time
          </span>
        </div>
      )}

      {/* Empty */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] px-6 py-[70px] text-center">
          <span style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="inbox" size={96} />
          </span>
          <p className="text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            Queue is clear
          </p>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            All listings are reviewed. Nice work.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-[10px] md:hidden">
            {rows.map((r) => {
              const locked = Boolean(r.lock && !r.lock.mine);
              return (
                <Link
                  key={r.id}
                  href={locked ? "#" : `${basePath}/${r.id}`}
                  onClick={(e) => locked && e.preventDefault()}
                  className="rounded-12 border p-3"
                  style={{
                    background: "var(--surface-1)",
                    borderColor: r.sla === "over" ? "var(--error)" : "var(--border)",
                    borderLeft: r.sla === "over" ? "3px solid var(--error)" : undefined,
                    opacity: locked ? 0.5 : 1,
                  }}
                >
                  <div className="flex gap-[10px]">
                    <Thumb size={48} url={r.coverUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                        {r.title}
                      </p>
                      <p className="mt-[2px] text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                        ID #{r.id.slice(0, 8)} · {r.location ?? "—"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-[6px]">
                        <RiskBadge risk={r.risk} />
                        <StatusBadge label={r.statusLabel} />
                        <SlaText sla={r.sla} text={r.ageText} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-12 border md:block" style={{ borderColor: "var(--border)" }}>
            <table className="w-full border-collapse" style={{ background: "var(--surface-1)" }}>
              <thead>
                <tr>
                  <Th width={40} />
                  {shows("Listing") && <Th>Listing</Th>}
                  {shows("Type") && <Th className="hidden lg:table-cell">Type</Th>}
                  {shows("Location") && <Th>Location</Th>}
                  {shows("Poster") && <Th>Poster</Th>}
                  {shows("Risk") && (
                    <Th>
                      <span className="inline-flex items-center gap-[3px]">
                        Risk
                        <Icon name="chevron-down" size={14} />
                      </span>
                    </Th>
                  )}
                  {shows("In queue") && <Th>In queue</Th>}
                  {shows("Status") && <Th>Status</Th>}
                  <Th width={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const locked = Boolean(r.lock && !r.lock.mine);
                  const isSel = selected.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => !locked && router.push(`${basePath}/${r.id}`)}
                      style={{
                        borderTop: "1px solid var(--divider)",
                        cursor: locked ? "default" : "pointer",
                        background: isSel ? "var(--accent-soft)" : undefined,
                        opacity: locked ? 0.5 : 1,
                        borderLeft: `3px solid ${r.sla === "over" ? "var(--error)" : "transparent"}`,
                      }}
                    >
                      <Td>
                        <input
                          type="checkbox"
                          checked={isSel}
                          disabled={locked}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(r.id);
                          }}
                          onChange={() => {}}
                          className="h-4 w-4 cursor-pointer"
                          style={{ accentColor: "var(--accent)" }}
                          aria-label={`Select ${r.title}`}
                        />
                      </Td>
                      {shows("Listing") && (
                      <Td>
                        <div className="flex items-center gap-[10px]">
                          <Thumb size={40} url={r.coverUrl} />
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                              {r.title}
                            </p>
                            <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                              ID #{r.id.slice(0, 8)}
                            </p>
                          </div>
                        </div>
                      </Td>
                      )}
                      {shows("Type") && (
                      <Td className="hidden lg:table-cell">
                        {r.typeLabel && (
                          <span className="rounded-4 px-[6px] py-[2px] text-[11px]" style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}>
                            {r.typeLabel}
                          </span>
                        )}
                      </Td>
                      )}
                      {shows("Location") && (
                      <Td>
                        <span className="whitespace-nowrap" style={{ color: "var(--ink-secondary)" }}>
                          {r.location ?? "—"}
                        </span>
                      </Td>
                      )}
                      {shows("Poster") && (
                      <Td>
                        <div className="flex items-center gap-[6px]">
                          <Initials text={r.poster.initials} size={24} />
                          <div>
                            <p className="text-[13px]" style={{ color: "var(--ink-primary)" }}>
                              {r.poster.name}
                            </p>
                            <div className="mt-[2px] flex gap-1">
                              {r.poster.role && (
                                <span className="rounded-4 px-[5px] py-[1px] text-[10px]" style={{ background: "var(--surface-2)", color: "var(--ink-tertiary)" }}>
                                  {r.poster.role}
                                </span>
                              )}
                              {r.poster.isNew && (
                                <span
                                  className="rounded-4 px-[5px] py-[1px] text-[10px] font-semibold"
                                  style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                                >
                                  New account
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Td>
                      )}
                      {shows("Risk") && (
                      <Td>
                        <div className="flex items-center gap-1">
                          <RiskBadge risk={r.risk} />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRiskTip(r);
                            }}
                            style={{ color: "var(--ink-tertiary)" }}
                            aria-label="How this score was calculated"
                          >
                            <Icon name="info" size={14} />
                          </button>
                        </div>
                      </Td>
                      )}
                      {shows("In queue") && (
                      <Td>
                        <SlaText sla={r.sla} text={r.ageText} />
                      </Td>
                      )}
                      {shows("Status") && <Td>{locked ? <StatusBadge label="Locked" /> : <StatusBadge label={r.statusLabel} />}</Td>}
                      <Td>
                        <span style={{ color: "var(--ink-tertiary)" }} title={locked ? `${r.lock!.lockedByName} is reviewing` : undefined}>
                          <Icon name={locked ? "lock" : "chevron-right"} size={16} />
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Risk tooltip — the reasons behind the number */}
      {riskTip && (
        <Modal title={`Risk score · ${riskTip.risk.bandLabel} · ${riskTip.risk.score}`} onClose={() => setRiskTip(null)}>
          {riskTip.risk.reasons.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              Nothing flagged — this item scored zero.
            </p>
          ) : (
            <div className="text-[12px] leading-[1.9]" style={{ color: "var(--ink-secondary)" }}>
              {riskTip.risk.reasons.map((rr) => (
                <div key={rr.code}>
                  {rr.label} +{rr.points}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Bulk confirm */}
      {sheet === "bulk" && (
        <Modal
          title={`Approve ${selected.length} listing${selected.length === 1 ? "" : "s"}?`}
          onClose={() => setSheet(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setSheet(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={busy} onClick={() => runBulk("approve")}>{busy ? "Approving…" : `Approve ${selected.length}`}</Btn>
            </>
          }
        >
          <div>
            {rows
              .filter((r) => selected.includes(r.id))
              .slice(0, 5)
              .map((r) => (
                <p key={r.id} className="truncate py-[3px] text-[13px]" style={{ color: "var(--ink-primary)" }}>
                  {r.title}
                </p>
              ))}
          </div>
          <p className="mt-2 rounded-8 p-[10px] text-[11px]" style={{ background: "var(--warning-soft)", color: "var(--ink-secondary)" }}>
            This will publish them immediately and generate stories.
          </p>
        </Modal>
      )}

      {/*
        Columns — the design puts this in a RIGHT-SHEET with a single full-width
        "Done", not a modal. Rows are `padding:10px 0` at 14px with a divider
        under each. Visibility stays a display preference in localStorage
        (CLAUDE.md rule 3 permits UI prefs there).
      */}
      {sheet === "columns" && (
        <RightSheet
          title="Columns"
          onClose={() => setSheet(null)}
          actions={
            <Btn kind="primary" style={{ flex: 1 }} onClick={() => setSheet(null)}>
              Done
            </Btn>
          }
        >
          {COLUMNS.map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-2 border-b py-[10px] text-[14px]"
              style={{ borderColor: "var(--divider)", color: "var(--ink-primary)" }}
            >
              <input
                type="checkbox"
                checked={hidden.indexOf(c) === -1}
                onChange={() => toggleColumn(c)}
                style={{ accentColor: "var(--accent)" }}
              />
              {c}
            </label>
          ))}
        </RightSheet>
      )}

      {/*
        Export — a modal, as the design has it: a Format radio pair then a Fields
        checkbox list. The chosen fields ride along in the `exports.filters` jsonb,
        so A30 (P6) collects a row that records what was actually asked for rather
        than a list that looked selectable and changed nothing.
      */}
      {sheet === "export" && (
        <Modal
          title={`Export ${title.replace(" queue", "").toLowerCase()}`}
          onClose={() => setSheet(null)}
          actions={
            <>
              <Btn kind="outline" onClick={() => setSheet(null)}>
                Cancel
              </Btn>
              <Btn kind="primary" disabled={busy} onClick={runExport}>
                {busy ? "Queueing…" : `Export ${rows.length} rows`}
              </Btn>
            </>
          }
        >
          <p className="mb-2 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            Format
          </p>
          <div className="mb-[14px] flex gap-4">
            {(["csv", "xlsx"] as const).map((f) => (
              <label key={f} className="flex cursor-pointer items-center gap-[6px] text-[13px]" style={{ color: "var(--ink-primary)" }}>
                <input type="radio" name="fmt" checked={format === f} onChange={() => setFormat(f)} style={{ accentColor: "var(--accent)" }} />
                {f.toUpperCase()}
              </label>
            ))}
          </div>

          <p className="mb-2 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            Fields
          </p>
          {EXPORT_FIELDS.map((f) => (
            <label
              key={f}
              className="flex cursor-pointer items-center gap-2 py-1 text-[13px]"
              style={{ color: "var(--ink-primary)" }}
            >
              <input
                type="checkbox"
                checked={fields.includes(f)}
                onChange={() => setFields((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]))}
                style={{ accentColor: "var(--accent)" }}
              />
              {f}
            </label>
          ))}
          <div className="mt-3">
            <NoteBlock tone="info">
              Every export is logged with your name and is available for 48 hours in the Exports Centre.
            </NoteBlock>
          </div>
        </Modal>
      )}

      {/*
        Filters — a RIGHT-SHEET in the design, one chip group per facet, with
        Clear + Apply as two equal footer buttons. Selections are staged locally and
        committed on Apply, which is what "Apply" has to mean.
      */}
      {sheet === "filter" && (
        <RightSheet
          title="Filters"
          onClose={() => setSheet(null)}
          actions={
            <>
              <Btn
                kind="outline"
                style={{ flex: 1 }}
                onClick={() => {
                  setDraft({});
                  setSheet(null);
                  router.push(`${basePath}?tab=${tab}`);
                }}
              >
                Clear
              </Btn>
              <Btn
                kind="primary"
                style={{ flex: 1 }}
                onClick={() => {
                  setSheet(null);
                  go(draft);
                }}
              >
                Apply
              </Btn>
            </>
          }
        >
          {FACETS.map((facet) => {
            const options = filterOptions[facet.key];
            if (!options.length) return null;
            const current = draft[facet.param] !== undefined ? draft[facet.param] : params.get(facet.param);
            return (
              <div key={facet.param} className="mb-4">
                <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ink-tertiary)" }}>
                  {facet.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {options.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      active={current === o.value}
                      // Tapping the active chip clears that facet — the design's
                      // chips are a single choice per group.
                      onClick={() => setDraft((d) => ({ ...d, [facet.param]: current === o.value ? null : o.value }))}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </RightSheet>
      )}
      <AdminToast message={toast} />
    </div>
  );
}

function Th({ children, width, className }: { children?: React.ReactNode; width?: number; className?: string }) {
  return (
    <th
      className={className}
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink-secondary)",
        background: "var(--surface-2)",
        whiteSpace: "nowrap",
        width,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={className} style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink-primary)", verticalAlign: "middle" }}>
      {children}
    </td>
  );
}

function IconBtn({ label, icon, onClick }: { label: string; icon: "sliders" | "download"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-8 border"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-secondary)" }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
