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

export type FilterGroup = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
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

  const toggle = (key: string, option: string) =>
    setStaged((s) => {
      const current = s[key] ?? [];
      const next = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
      return { ...s, [key]: next };
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
                  onClick={() => toggle(g.key, o.value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </RightSheet>
  );
}
