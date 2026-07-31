"use client";

/**
 * template 998-1001 / 607-610 — the three controls that sit in the page header,
 * to the right of the title: the saved-views button (a labelled 36-high button
 * with a 16px chevron), then two 36×36 icon buttons for columns and export.
 *
 * Every list screen passes this as `pageHead`'s `right`, so the header is
 * assembled the same way everywhere instead of each screen rebuilding it.
 */

import { AdminIcon } from "@/components/admin/ds/icons";

export function ListToolbar({
  viewLabel,
  onOpenViews,
  onOpenColumns,
  onOpenExport,
}: {
  /** the active saved view's name, or the design's default ("All users") */
  viewLabel: string;
  onOpenViews: () => void;
  onOpenColumns: () => void;
  onOpenExport: () => void;
}) {
  const iconBtn = {
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
  } as const;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        onClick={onOpenViews}
        style={{
          height: 36,
          padding: "0 12px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s1)",
          color: "var(--ink1)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {viewLabel}
        <AdminIcon name="chevD" size={16} />
      </button>
      <button type="button" onClick={onOpenColumns} aria-label="Columns" style={iconBtn}>
        <AdminIcon name="columns" size={18} />
      </button>
      <button type="button" onClick={onOpenExport} aria-label="Export" style={iconBtn}>
        <AdminIcon name="download" size={18} />
      </button>
    </div>
  );
}
