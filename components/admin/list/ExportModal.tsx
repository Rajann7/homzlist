"use client";

/**
 * template 1567-1573 — `modal('Export listings', …)`.
 *
 * A centred MODAL, not a sheet: "Format" in 13px ink3 over CSV/XLSX radios with
 * a 16px gap and 14px below, then "Fields" over 13px checkbox rows at 4px
 * vertical padding, accent-coloured controls. The footer is Cancel + a primary
 * button that names the count — the design's own "Export 12 rows".
 *
 * The count is the server's filtered total, so the button promises exactly what
 * the file will contain. Fields carrying personal data are marked, because the
 * `exports` row records whether they were included and the audit entry says so.
 */

import { useState } from "react";
import { Modal } from "@/components/admin/ds/overlays";
import { Btn } from "@/components/admin/ds/primitives";
import { useToast } from "@/components/admin/ds/admin-context";

const PERSONAL = new Set(["phone", "email", "name", "ip", "device", "actor_name"]);

export function ExportModal({
  title,
  resource,
  query,
  total,
  fields,
  defaultSelected,
  onClose,
}: {
  /** the design titles this per screen — "Export listings", "Export users" */
  title: string;
  resource: string;
  /** the list's current querystring, so the file matches the table */
  query: string;
  total: number;
  fields: { key: string; label: string }[];
  defaultSelected?: string[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [selected, setSelected] = useState<string[]>(
    defaultSelected ?? fields.slice(0, 6).map((f) => f.key),
  );
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const run = async () => {
    if (!selected.length) {
      toast("Pick at least one field");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/v1/admin/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resource, query, format, fields: selected, name: title }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    onClose();
    toast(body?.ok ? "Export ready — check Exports Center" : "Export failed");
  };

  const includesPersonal = selected.some((k) => PERSONAL.has(k));

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Exporting…" : `Export ${total} rows`}
            kind="primary"
            onClick={run}
            disabled={busy}
          />
        </>
      }
    >
      <div>
        <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 8 }}>Format</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          {(["csv", "xlsx"] as const).map((f) => (
            <label
              key={f}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="fmt"
                checked={format === f}
                onChange={() => setFormat(f)}
                style={{ accentColor: "var(--accent)" }}
              />
              {f.toUpperCase()}
            </label>
          ))}
        </div>

        <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 8 }}>Fields</div>
        {fields.map((f) => (
          <label
            key={f.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              padding: "4px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(f.key)}
              onChange={() => toggle(f.key)}
              style={{ accentColor: "var(--accent)" }}
            />
            {f.label}
            {PERSONAL.has(f.key) ? (
              <span style={{ fontSize: 11, color: "var(--warning)" }}>personal</span>
            ) : null}
          </label>
        ))}

        {includesPersonal ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "var(--ink3)",
              background: "var(--warningSoft)",
              padding: 10,
              borderRadius: 8,
            }}
          >
            This export contains personal data. It is logged against your account and expires in 7
            days.
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
