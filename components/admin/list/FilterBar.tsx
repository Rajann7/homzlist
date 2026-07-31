"use client";

/**
 * template 1002-1006 — the filter bar every list screen carries.
 *
 * Search box 36 high, min-width 180, s2 on border, radius 8, 16px search icon,
 * 13px text · one 32-high pill per filter group with a 14px chevron · "Clear
 * all" in accent 600 · the result count pushed right with `margin-left:auto`.
 *
 * The count is the SERVER's filtered total, so "128 users" is a fact rather than
 * `rows.length`. The search box debounces and then re-queries — it never filters
 * the page that happens to be loaded.
 */

import { useEffect, useState } from "react";
import { AdminIcon } from "@/components/admin/ds/icons";
import type { FilterGroup } from "./FilterSheet";

export function FilterBar({
  placeholder,
  search,
  onSearch,
  groups,
  filters,
  onOpenFilters,
  onClear,
  countLabel,
}: {
  placeholder: string;
  search: string;
  onSearch: (term: string) => void;
  groups: FilterGroup[];
  filters: Record<string, string[]>;
  onOpenFilters: () => void;
  onClear: () => void;
  /** e.g. "128 users" — already pluralised by the screen that owns the noun */
  countLabel: string;
}) {
  const [term, setTerm] = useState(search);

  // Keep in step when the URL changes underneath (Back button, saved view).
  useEffect(() => setTerm(search), [search]);

  // Debounced so typing is one query per pause, not one per keystroke.
  useEffect(() => {
    if (term === search) return;
    const t = setTimeout(() => onSearch(term), 300);
    return () => clearTimeout(t);
  }, [term, search, onSearch]);

  const active = Object.values(filters).reduce((n, v) => n + v.length, 0);

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 14,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div
        style={{
          height: 36,
          minWidth: 180,
          background: "var(--s2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          color: "var(--ink3)",
        }}
      >
        <AdminIcon name="search" size={16} />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "transparent",
            color: "var(--ink1)",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      {groups.map((g) => {
        const chosen = filters[g.key]?.length ?? 0;
        return (
          <button
            key={g.key}
            type="button"
            onClick={onOpenFilters}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px solid ${chosen ? "var(--accent)" : "var(--border)"}`,
              background: chosen ? "var(--accentSoft)" : "var(--s1)",
              color: chosen ? "var(--accent)" : "var(--ink2)",
              fontSize: 13,
              fontWeight: chosen ? 600 : 400,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {chosen ? `${g.label} · ${chosen}` : g.label}
            <AdminIcon name="chevD" size={14} />
          </button>
        );
      })}

      {active || search ? (
        <span
          onClick={onClear}
          style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
        >
          Clear all
        </span>
      ) : null}

      <span style={{ fontSize: 13, color: "var(--ink3)", marginLeft: "auto" }}>{countLabel}</span>
    </div>
  );
}
