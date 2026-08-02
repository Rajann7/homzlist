"use client";

/**
 * A19's "Edit config" — template 2137, `pushPanel('fieldConfig',{type:r[0]})`.
 *
 * A STACKED PANEL, not a modal. §5 is explicit that where a click lands is part
 * of the design; the first pass built this as a centred `Modal`, which also
 * meant no breadcrumb and no way to drill onward.
 *
 * It edits `property_types.field_config`, which decides which fields a seller
 * even sees — so every key is checked against the field catalogue on save and
 * an unknown one is refused rather than producing a form nobody can submit.
 */

import { useEffect, useState } from "react";
import {
  Btn,
  Mono,
  NoteStrip,
  F_TEXTAREA_STYLE,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";

export function FieldConfigPanelBody({ panel }: { panel: PanelEntry }) {
  const { popPanel, notifyChanged } = usePanels();
  const code = String(panel.data.code ?? "");
  const label = String(panel.data.label ?? code);

  const [text, setText] = useState(() => JSON.stringify(panel.data.field_config ?? {}, null, 2));
  const [known, setKnown] = useState<{ key: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/v1/admin/master-data?what=fields", { cache: "no-store" }).catch(
        () => null,
      );
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: { fields: { key: string; label: string }[] } }
        | null;
      setKnown(json?.ok ? (json.data?.fields ?? []) : []);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/v1/admin/master-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action: "type_config", id: code, config: text }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; error?: { message?: string } }
      | null;
    setBusy(false);
    if (json?.ok) {
      notifyChanged();
      popPanel();
    } else setError(json?.error?.message ?? "That config was refused");
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        <NoteStrip tone="info">
          This decides which fields a seller sees for a {label}. Every key is checked against the
          field catalogue on save — an unknown key is refused rather than producing a form nobody
          can submit.
        </NoteStrip>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          style={{
            ...F_TEXTAREA_STYLE,
            height: 380,
            fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
            fontSize: 12,
          }}
        />

        {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 6 }}>
            {known.length} keys available
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {known.map((k) => (
              <Mono
                key={k.key}
                style={{
                  background: "var(--s2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "3px 6px",
                  color: "var(--ink2)",
                }}
              >
                {k.key}
              </Mono>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          flex: "none",
          borderTop: "1px solid var(--divider)",
          padding: 16,
          display: "flex",
          gap: 8,
        }}
      >
        <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={popPanel} />
        <Btn
          label={busy ? "Saving…" : "Save config"}
          kind="primary"
          style={{ flex: 1 }}
          onClick={save}
        />
      </div>
    </>
  );
}
