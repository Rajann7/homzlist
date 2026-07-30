"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { QueueRow, QueueTab } from "@/lib/admin/queues";
import { RiskBadge, StatusBadge, SlaText, Thumb, Initials } from "./queueBits";

/**
 * A3's screen, built to the design exactly (P13 A3 / designs listingsEl):
 * page head + count chip + saved views/columns/export · sub-tabs with dots and
 * counts · filter chips + Clear all · bulk bar (max 20) · desktop table with the
 * documented columns / mobile cards · empty + skeleton.
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
}

const BULK_MAX = 20;

/** The design's column list for A3, in its order. */
const COLUMNS = ["Listing", "Type", "Location", "Poster", "Risk", "In queue", "Status"] as const;

interface SavedView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  shared: boolean;
  mine: boolean;
}

export function QueueScreen({ title, subject, basePath, tabs, tab, counts, rows, canDecide, queueKey }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [riskTip, setRiskTip] = useState<QueueRow | null>(null);
  const [sheet, setSheet] = useState<null | "views" | "columns" | "export" | "filter" | "bulk">(null);
  const [busy, setBusy] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [hidden, setHidden] = useState<string[]>([]);

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
      const filters: Record<string, string> = { tab };
      for (const k of ["risk", "type", "city"]) {
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
      if (r.ok) setSheet(null);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSheet("views")}
            className="flex h-9 items-center gap-[6px] rounded-8 border px-3 text-[13px] font-semibold"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--ink-primary)" }}
          >
            {activeView}
            <Icon name="chevron-down" size={16} />
          </button>
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
              <GhostBtn onClick={() => setSheet(null)}>Cancel</GhostBtn>
              <PrimaryBtn disabled={busy} onClick={() => runBulk("approve")}>
                {busy ? "Approving…" : `Approve ${selected.length}`}
              </PrimaryBtn>
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

      {/* Saved views — real rows from admin_saved_views (Doc3 §1.4) */}
      {sheet === "views" && (
        <Modal title="Saved views" onClose={() => setSheet(null)}>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                router.push(`${basePath}?tab=${tab}`);
              }}
              className="rounded-8 px-3 py-[10px] text-left text-[14px] hover:bg-[var(--surface-2)]"
              style={{ color: "var(--ink-primary)" }}
            >
              All {tab}
            </button>
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setSheet(null);
                  applyView(v);
                }}
                className="flex items-center gap-2 rounded-8 px-3 py-[10px] text-left text-[14px] hover:bg-[var(--surface-2)]"
                style={{ color: "var(--ink-primary)" }}
              >
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                {!v.shared && (
                  <span className="shrink-0 text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    private
                  </span>
                )}
              </button>
            ))}
            {views.length === 0 && (
              <p className="px-3 py-2 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
                No saved views yet.
              </p>
            )}
            <div className="mt-1 border-t pt-1" style={{ borderColor: "var(--divider)" }}>
              <button
                type="button"
                onClick={saveCurrentView}
                disabled={busy}
                className="w-full rounded-8 px-3 py-[10px] text-left text-[14px] font-semibold disabled:opacity-40"
                style={{ color: "var(--accent)" }}
              >
                + Save current view
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Columns — a display preference, so localStorage is the right home (rule 3) */}
      {sheet === "columns" && (
        <Modal
          title="Columns"
          onClose={() => setSheet(null)}
          actions={<PrimaryBtn onClick={() => setSheet(null)}>Done</PrimaryBtn>}
        >
          <div className="flex flex-col">
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
          </div>
        </Modal>
      )}

      {/* Export — queues a real row in `exports`, collected in A30 */}
      {sheet === "export" && (
        <Modal
          title="Export listings"
          onClose={() => setSheet(null)}
          actions={
            <>
              <GhostBtn onClick={() => setSheet(null)}>Cancel</GhostBtn>
              <PrimaryBtn disabled={busy} onClick={runExport}>
                {busy ? "Queueing…" : `Export ${rows.length} rows`}
              </PrimaryBtn>
            </>
          }
        >
          <p className="mb-2 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            Format
          </p>
          <div className="mb-3 flex gap-4">
            {(["csv", "xlsx"] as const).map((f) => (
              <label key={f} className="flex cursor-pointer items-center gap-[6px] text-[13px]" style={{ color: "var(--ink-primary)" }}>
                <input type="radio" name="fmt" checked={format === f} onChange={() => setFormat(f)} style={{ accentColor: "var(--accent)" }} />
                {f.toUpperCase()}
              </label>
            ))}
          </div>
          <p className="rounded-8 p-[10px] text-[11px]" style={{ background: "var(--info-soft)", color: "var(--ink-secondary)" }}>
            Every export is logged with your name and is available for 48 hours in the Exports Centre.
          </p>
        </Modal>
      )}

      {sheet === "filter" && (
        <Modal title="Filters" onClose={() => setSheet(null)}>
          {(
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-semibold" style={{ color: "var(--ink-tertiary)" }}>
                Risk
              </p>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      go({ risk: riskFilter === b ? null : b });
                    }}
                    className="h-8 rounded-full border px-3 text-[13px] capitalize"
                    style={{
                      borderColor: riskFilter === b ? "var(--accent)" : "var(--border)",
                      background: riskFilter === b ? "var(--accent-soft)" : "var(--surface-1)",
                      color: riskFilter === b ? "var(--accent)" : "var(--ink-secondary)",
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
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

export function Modal({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="relative w-full max-w-[420px] rounded-16 p-5"
        style={{ background: "var(--surface-1)", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}
      >
        <h2 className="mb-3 text-[17px] font-semibold" style={{ color: "var(--ink-primary)" }}>
          {title}
        </h2>
        {children}
        <div className="mt-4 flex justify-end gap-2">{actions ?? <GhostBtn onClick={onClose}>Close</GhostBtn>}</div>
      </div>
    </div>
  );
}

export function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 rounded-8 border px-4 text-[15px] font-semibold"
      style={{ borderColor: "var(--border)", color: "var(--ink-primary)" }}
    >
      {children}
    </button>
  );
}

export function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-10 rounded-8 px-4 text-[15px] font-semibold text-white disabled:opacity-40"
      style={{ background: "var(--accent)" }}
    >
      {children}
    </button>
  );
}
