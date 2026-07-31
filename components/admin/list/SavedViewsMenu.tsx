"use client";

/**
 * template 1622-1625 — the saved-views menu.
 *
 * An anchored card at `top:150`, `right: mobile ? 12 : 60`, width 240, padding 6,
 * `scaleIn .18s`; rows are 10px/12px at 14px; the last row is "+ Save current
 * view" in accent 600 with a divider above it and 4px of margin.
 *
 * Views are rows in admin_saved_views — saving one persists the CURRENT filter
 * set and picking one replays it through the same server query, so a view can
 * never show something a live filter would not.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/admin/ds/admin-context";
import { useEscape } from "@/components/admin/ds/overlays";

export type SavedView = {
  id: string;
  name: string;
  filters: Record<string, string[] | string>;
  is_shared: boolean;
  mine: boolean;
};

export function SavedViewsMenu({
  resource,
  currentFilters,
  onApply,
  onClose,
}: {
  resource: string;
  currentFilters: Record<string, string[]>;
  onApply: (filters: Record<string, string[]>) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [views, setViews] = useState<SavedView[] | null>(null);
  useEscape(onClose);

  useEffect(() => {
    fetch(`/api/v1/admin/saved-views?resource=${resource}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setViews(b.ok ? (b.data.views as SavedView[]) : []))
      .catch(() => setViews([]));
  }, [resource]);

  const save = async () => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    const res = await fetch("/api/v1/admin/saved-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resource, name, filters: currentFilters }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    onClose();
    toast(body?.ok ? "View saved" : "Couldn't save the view");
  };

  const row = {
    padding: "10px 12px",
    fontSize: 14,
    color: "var(--ink1)",
    cursor: "pointer",
    borderRadius: 8,
  } as const;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, animation: "fadeIn .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="right-3 md:right-[60px]"
        style={{
          position: "absolute",
          top: 150,
          width: 240,
          background: "var(--s1)",
          borderRadius: 12,
          boxShadow: "var(--L3)",
          border: "1px solid var(--border)",
          padding: 6,
          animation: "scaleIn .18s ease",
        }}
      >
        {views === null ? (
          <div style={{ ...row, color: "var(--ink3)" }}>Loading…</div>
        ) : views.length === 0 ? (
          <div style={{ ...row, color: "var(--ink3)" }}>No saved views yet</div>
        ) : (
          views.map((v) => (
            <div
              key={v.id}
              onClick={() => {
                const normalised = Object.fromEntries(
                  Object.entries(v.filters ?? {}).map(([k, val]) => [
                    k,
                    Array.isArray(val) ? val.map(String) : [String(val)],
                  ]),
                );
                onApply(normalised);
                onClose();
                toast(`View: ${v.name}`);
              }}
              style={row}
            >
              {v.name}
            </div>
          ))
        )}
        <div
          onClick={save}
          style={{
            ...row,
            color: "var(--accent)",
            fontWeight: 600,
            borderTop: "1px solid var(--divider)",
            marginTop: 4,
          }}
        >
          + Save current view
        </div>
      </div>
    </div>
  );
}
