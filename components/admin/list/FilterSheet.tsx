"use client";

/**
 * template 1630-1632 — `rightSheet('Filters', …)`.
 *
 * A RIGHT SHEET, not a dropdown under the chip that opened it (§5). Groups are a
 * 13/600 ink3 label over wrapped chips, 8px gap, 16px between groups; the footer
 * is Clear + Apply, each `flex:1`.
 *
 * The options are the RESOURCE's declared options, fetched from the server —
 * never a list hardcoded in a component (CLAUDE.md rule 7 on option lists).
 * Selection is staged locally and only committed on Apply, which is what the
 * design's two-button footer implies.
 */

import { useState } from "react";
import { RightSheet } from "@/components/admin/ds/overlays";
import { Btn, Chip } from "@/components/admin/ds/primitives";

export type FilterOption = {
  value: string;
  label: string;
  /**
   * Extra query keys this ONE chip also sets.
   *
   * A12's "Price range" and both screens' date pill are single facts in the
   * design and TWO parameters on the wire (priceMin+priceMax, from+to). Without
   * this, either the pill disappears — a design deviation — or it half-works,
   * which §3 counts as a failure. The chip stays one chip; the engine still
   * gets two real SQL bounds.
   */
  params?: Record<string, string>;
};

export type FilterGroup = {
  key: string;
  label: string;
  options: FilterOption[];
  /** a range is one choice, not a set — picking a second replaces the first */
  single?: boolean;
};

export function FilterSheet({
  groups,
  value,
  onApply,
  onClose,
}: {
  groups: FilterGroup[];
  value: Record<string, string[]>;
  onApply: (next: Record<string, string[]>) => void;
  onClose: () => void;
}) {
  const [staged, setStaged] = useState<Record<string, string[]>>(value);

  const toggle = (group: FilterGroup, option: FilterOption) =>
    setStaged((s) => {
      const current = s[group.key] ?? [];
      const on = current.includes(option.value);
      const next = { ...s };

      if (group.single) next[group.key] = on ? [] : [option.value];
      else next[group.key] = on ? current.filter((v) => v !== option.value) : [...current, option.value];

      // A chip that carries extra params sets or clears all of them together —
      // a priceMin left behind by a cleared priceMax is a filter nobody chose.
      for (const o of group.options) for (const k of Object.keys(o.params ?? {})) next[k] = [];
      if (!on) for (const [k, v] of Object.entries(option.params ?? {})) next[k] = [v];

      return next;
    });

  return (
    <RightSheet
      title="Filters"
      onClose={onClose}
      footer={
        <>
          <Btn label="Clear" kind="outline" onClick={() => setStaged({})} style={{ flex: 1 }} />
          <Btn
            label="Apply"
            kind="primary"
            onClick={() => {
              onApply(staged);
              onClose();
            }}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <div>
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 16 }}>
            <div
              style={{ fontSize: 13, fontWeight: 600, color: "var(--ink3)", marginBottom: 8 }}
            >
              {g.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {g.options.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={(staged[g.key] ?? []).includes(o.value)}
                  onClick={() => toggle(g, o)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </RightSheet>
  );
}
