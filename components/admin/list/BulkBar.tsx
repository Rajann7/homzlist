"use client";

/**
 * template 1008-1014 — the bar that replaces nothing and appears above the table
 * once rows are selected.
 *
 * accentSoft on a 1px accent border, radius 8, 8/12 padding, 14px below · "N
 * selected" in 13/600 · one 32-high button per action · "Clear" in accent 600 ·
 * and, pushed right, the 11px "Bulk actions are logged" — which is a promise the
 * server keeps: every bulk call writes an admin_audit_log row per subject.
 *
 * Actions are declared by the screen, because they differ per resource (approve
 * listings, suspend users). The cap is the design's own and is enforced
 * server-side too — a client that sends more ids than the cap is rejected.
 */

import { Btn } from "@/components/admin/ds/primitives";

export type BulkAction = {
  key: string;
  label: string;
  kind?: "outline" | "danger";
  onRun: (ids: string[]) => void;
};

export function BulkBar({
  selected,
  actions,
  onClear,
  cap,
}: {
  selected: string[];
  actions: BulkAction[];
  onClear: () => void;
  /** the design's per-screen limit; omit when the screen has none */
  cap?: number;
}) {
  if (!selected.length) return null;
  const overCap = cap !== undefined && selected.length > cap;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--accentSoft)",
        border: "1px solid var(--accent)",
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600 }}>{`${selected.length} selected`}</span>
      {actions.map((a) => (
        <Btn
          key={a.key}
          label={a.label}
          kind={a.kind ?? "outline"}
          onClick={() => a.onRun(selected)}
          style={{
            height: 32,
            fontSize: 13,
            ...(overCap ? { opacity: 0.4, cursor: "not-allowed" } : null),
          }}
          disabled={overCap}
        />
      ))}
      <span
        onClick={onClear}
        style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
      >
        Clear
      </span>
      <span style={{ fontSize: 11, color: "var(--ink3)", marginLeft: "auto" }}>
        {overCap ? `Select at most ${cap}` : "Bulk actions are logged"}
      </span>
    </div>
  );
}
