"use client";

/**
 * template 1627-1628 — `rightSheet('Columns', …)`.
 *
 * Checkbox rows, 10px vertical padding, 14px label, divider under each, accent
 * checkbox; one primary "Done" footer button at `flex:1`.
 *
 * The value is PER ADMIN and lives on the server (admin_column_prefs, 0091), so
 * it survives a reload and a new device. Saving happens on Done, and the sheet
 * refuses to leave the table with no columns at all.
 */

import { useState } from "react";
import { RightSheet } from "@/components/admin/ds/overlays";
import { Btn } from "@/components/admin/ds/primitives";
import { useToast } from "@/components/admin/ds/admin-context";

export function ColumnsSheet({
  resource,
  all,
  visible,
  onSaved,
  onClose,
}: {
  resource: string;
  /** every column the resource allows, in the design's order */
  all: { key: string; label: string }[];
  visible: string[];
  onSaved: (columns: string[]) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [staged, setStaged] = useState<string[]>(visible);
  const [saving, setSaving] = useState(false);

  const toggle = (key: string) =>
    setStaged((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const save = async () => {
    if (!staged.length) {
      toast("Keep at least one column");
      return;
    }
    setSaving(true);
    // Stored in the design's own column order, so hiding and re-showing a column
    // puts it back where the design draws it rather than at the end.
    const ordered = all.map((c) => c.key).filter((k) => staged.includes(k));
    const res = await fetch(`/api/v1/admin/column-prefs/${resource}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ columns: ordered }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!body?.ok) {
      toast("Couldn't save columns");
      return;
    }
    onSaved(body.data.columns as string[]);
    onClose();
  };

  return (
    <RightSheet
      title="Columns"
      onClose={onClose}
      footer={
        <Btn
          label={saving ? "Saving…" : "Done"}
          kind="primary"
          onClick={save}
          style={{ flex: 1 }}
        />
      }
    >
      <div>
        {all.map((c) => (
          <label
            key={c.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 0",
              fontSize: 14,
              borderBottom: "1px solid var(--divider)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={staged.includes(c.key)}
              onChange={() => toggle(c.key)}
              style={{ accentColor: "var(--accent)" }}
            />
            {c.label}
          </label>
        ))}
      </div>
    </RightSheet>
  );
}
