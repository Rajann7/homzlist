"use client";

/**
 * The design's two raw table shells, ported. P1's table engine (filters, saved
 * views, column settings, export, bulk bar) is built ON TOP of these — these
 * two only own the chrome.
 *
 * The device bands are the design's, expressed as CSS breakpoints instead of the
 * prototype's frame width: mobile = unprefixed, tablet = `md:` (768),
 * desktop = `desktop:` (1440). A `tablet ? 820 : 0` min-width in the template is
 * therefore a min-width that belongs to the MIDDLE band only, and reads
 * `md:min-w-[820px] desktop:min-w-0` here — not an unconditional one.
 */

import type { CSSProperties, ReactNode } from "react";

export type Col<R> = {
  /** header text; "" for the trailing chevron / overflow column */
  label: string;
  /** fixed column width, when the design gives one */
  w?: number;
  cell: (row: R) => ReactNode;
  /** extra classes for band visibility, e.g. "hidden desktop:table-cell" */
  className?: string;
};

const TH_STYLE: CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ink2)",
  background: "var(--s2)",
  whiteSpace: "nowrap",
};

const TD_STYLE: CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--ink1)",
  verticalAlign: "middle",
};

/* ── template 818-826 — queueTable(cols,rows,onRow) ──────────────────────────
   Note what this does NOT have: no mobile branch and no tablet min-width. The
   queue tables are deliberately plain; only the master lists (dtable and the
   A10/A12/A15/A17 lists) get a card layout on mobile.

   ONE technical fix to the design, approved by Rajan: the template wraps this in
   `overflow:hidden` (821). A3's table is 1071px wide inside a ~528px column at
   the tablet band, so drawn exactly the Status column is CLIPPED — unreachable,
   not scrollable. `auto` clips identically to `hidden` whenever the content
   fits, so nothing about how it looks changes; it only stops the overflow case
   from being a dead end.                                                      */
/**
 * `R` is any row shape. It was constrained to `{ sla?: … }`, which reads as
 * "rows may carry an SLA" but is a WEAK TYPE: TypeScript rejects any row that
 * has no property in common with it, so every real queue row failed to compile
 * against a table it renders perfectly. The SLA is read defensively instead —
 * a row that has one gets the design's red left border, a row that does not
 * gets a transparent one.
 */
export function QueueTable<R>({
  cols,
  rows,
  onRow,
}: {
  cols: Col<R>[];
  rows: R[];
  onRow?: (row: R) => void;
}) {
  const slaOf = (row: R) => (row as { sla?: "ok" | "warn" | "over" }).sla;
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "auto",
      }}
    >
      <table
        style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}
      >
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c.label || `c${i}`} className={c.className} style={{ ...TH_STYLE, width: c.w }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              // A row that opens a panel on click was reachable by mouse only.
              // Focusable + Enter/Space when the row ITSELF has focus (the
              // guard keeps a button inside the row from double-firing).
              tabIndex={onRow ? 0 : undefined}
              onKeyDown={
                onRow
                  ? (e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRow(r);
                      }
                    }
                  : undefined
              }
              onClick={() => onRow?.(r)}
              style={{
                borderTop: "1px solid var(--divider)",
                cursor: onRow ? "pointer" : "default",
                borderLeft:
                  slaOf(r) === "over" ? "3px solid var(--error)" : "3px solid transparent",
              }}
            >
              {cols.map((c, j) => (
                <td key={j} className={c.className} style={TD_STYLE}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── template 2021-2029 — dtable(cols,rows,onRow) ───────────────────────────
   The shared master-data table: scrollable, sticky header row, per-row accent
   rail via `_hl`, and the tablet-only 820px min-width.                       */
/**
 * `R` was constrained to `{ _hl?: string }` — the same WEAK TYPE mistake
 * QueueTable had above. TypeScript rejects any row object with no property in
 * common with it, so every real row shape failed to compile against a table
 * that renders it perfectly. The accent rail is read defensively instead.
 */
export function DTable<R>({
  cols,
  rows,
  onRow,
}: {
  cols: Col<R>[];
  rows: R[];
  onRow?: (row: R) => void;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "auto" }}>
      <table
        className="min-w-0 md:min-w-[820px] desktop:min-w-0"
        style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}
      >
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={c.label || `c${i}`}
                className={c.className}
                style={{ ...TH_STYLE, width: c.w, position: "sticky", top: 0 }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              // A row that opens a panel on click was reachable by mouse only.
              // Focusable + Enter/Space when the row ITSELF has focus (the
              // guard keeps a button inside the row from double-firing).
              tabIndex={onRow ? 0 : undefined}
              onKeyDown={
                onRow
                  ? (e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRow(r);
                      }
                    }
                  : undefined
              }
              onClick={() => onRow?.(r)}
              style={{
                borderTop: "1px solid var(--divider)",
                cursor: onRow ? "pointer" : "default",
                borderLeft: `3px solid ${(r as { _hl?: string })?._hl ?? "transparent"}`,
              }}
            >
              {cols.map((c, j) => (
                <td key={j} className={c.className} style={TD_STYLE}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
