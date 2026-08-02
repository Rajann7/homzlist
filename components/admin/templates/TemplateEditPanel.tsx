"use client";

/**
 * A21's template editor — template 2288-2316,
 * `pushPanel('tplEdit',{...r,channel:ch})`.
 *
 * A STACKED PANEL, not a modal. §5: where a click lands is part of the design.
 * The first pass built it as a centred `Modal`, which also cost it the
 * breadcrumb bar and the ability to be pushed on top of another panel.
 */

import { useEffect, useState } from "react";
import {
  Badge,
  Btn,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  NoteStrip,
  Shimmer,
  useToast,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";

type TemplateRow = {
  id: string;
  code: string;
  channel: string;
  name: string;
  is_active: boolean;
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

export function TemplateEditPanelBody({ panel }: { panel: PanelEntry }) {
  const toast = useToast();
  const { popPanel, notifyChanged } = usePanels();
  const row = panel.data as unknown as TemplateRow;
  const [lang, setLang] = useState<"en" | "gu" | "hi">("en");
  const [locales, setLocales] = useState<Record<string, { subject: string; body: string }>>({});
  const [providerRef, setProviderRef] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/admin/templates?what=template&id=${row.id}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | {
            ok?: boolean;
            data?: {
              provider_ref: string | null;
              variables_allowed: string[];
              locales: { lang: string; subject: string | null; body: string }[];
            };
          }
        | null;
      if (json?.ok && json.data) {
        const map: Record<string, { subject: string; body: string }> = {};
        for (const l of json.data.locales) map[l.lang] = { subject: l.subject ?? "", body: l.body };
        setLocales(map);
        setProviderRef(json.data.provider_ref ?? "");
        setVars(json.data.variables_allowed ?? []);
      }
      setLoaded(true);
    })();
  }, [row.id]);

  const cur = locales[lang] ?? { subject: "", body: "" };
  const setCur = (patch: Partial<{ subject: string; body: string }>) =>
    setLocales((m) => ({ ...m, [lang]: { ...cur, ...patch } }));

  const sample: Record<string, string> = {
    user_name: "Rajesh",
    listing_title: "3 BHK Flat, Shree Residency",
    price: "₹48,00,000",
    area: "Mavdi",
    plan_name: "₹999 Listing Plan",
    expiry_date: "12 Aug 2026",
    amount: "₹943",
    ticket_id: "TKT-0001",
    link: "https://homzlist.com",
    otp: "4821",
  };
  const rendered = cur.body.replace(
    /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    (_, k: string) => sample[k.toLowerCase()] ?? `{{${k}}}`,
  );

  const footer = (
    <div
      style={{
        flex: "none",
        borderTop: "1px solid var(--divider)",
        padding: 16,
        display: "flex",
        gap: 8,
      }}
    >
          <Btn
            label="Test send"
            kind="outline"
            style={{ flex: 1 }}
            onClick={async () => {
              const json = await post({ action: "template_test", id: row.id, lang });
              toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "Test failed"));
            }}
          />
          <Btn
            label={busy ? "Saving…" : "Save"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError("");
              const json = await post({
                action: "template_save",
                id: row.id,
                lang,
                subject: cur.subject,
                body: cur.body,
                provider_ref: providerRef,
              });
              setBusy(false);
              if (json?.ok) {
                toast(String(json.data?.summary ?? "Saved"));
                notifyChanged();
                popPanel();
              } else setError(json?.error?.message ?? "That didn't save");
            }}
          />
    </div>
  );

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
      {!loaded ? (
        <Shimmer h={240} />
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", marginBottom: 6 }}>
              Trigger
            </div>
            <Badge
              bg="var(--s2)"
              fg="var(--ink2)"
              style={{
                textTransform: "none",
                letterSpacing: 0,
                fontFamily: "ui-monospace,monospace",
              }}
            >
              {row.code}
            </Badge>
          </div>

          <div
            style={{
              display: "flex",
              gap: 4,
              borderBottom: "1px solid var(--divider)",
              marginBottom: 14,
            }}
          >
            {(["en", "gu", "hi"] as const).map((k) => (
              <div
                key={k}
                onClick={() => setLang(k)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: lang === k ? "var(--ink1)" : "var(--ink3)",
                  borderBottom: `2px solid ${lang === k ? "var(--accent)" : "transparent"}`,
                  cursor: "pointer",
                }}
              >
                {k.toUpperCase()}
              </div>
            ))}
          </div>

          {row.channel === "email" ? (
            <FField label="Subject">
              <input
                value={cur.subject}
                onChange={(e) => setCur({ subject: e.target.value })}
                style={F_INPUT_STYLE}
              />
            </FField>
          ) : null}

          <FField label="Body">
            <textarea
              value={cur.body}
              onChange={(e) => setCur({ body: e.target.value })}
              style={{ ...F_TEXTAREA_STYLE, height: 120 }}
            />
          </FField>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", marginBottom: 6 }}>
              Variables{" "}
              <span style={{ fontWeight: 400, color: "var(--ink3)" }}>click to insert</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {vars.map((v) => (
                <span
                  key={v}
                  onClick={() => setCur({ body: `${cur.body}{{${v}}}` })}
                  style={{
                    fontFamily: "ui-monospace,monospace",
                    fontSize: 11,
                    background: "var(--s2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                    color: "var(--ink2)",
                  }}
                >
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          </div>

          {row.channel === "whatsapp" ? (
            <>
              <FField label="Meta template ID">
                <input
                  value={providerRef}
                  onChange={(e) => setProviderRef(e.target.value)}
                  placeholder="plan_offer_v2"
                  style={F_INPUT_STYLE}
                />
              </FField>
              <NoteStrip tone="warn">Template changes need Meta re-approval (2–7 days).</NoteStrip>
            </>
          ) : null}

          {row.channel === "sms" ? (
            <>
              <FField label="DLT template ID">
                <input
                  value={providerRef}
                  onChange={(e) => setProviderRef(e.target.value)}
                  placeholder="1107xxxxxxxxxxxx"
                  style={F_INPUT_STYLE}
                />
              </FField>
              {/* the design prints this; it is a real count over the real body */}
              <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>
                {`${cur.body.length} / 160 · ${Math.max(1, Math.ceil(cur.body.length / 160))} SMS`}
              </div>
              <NoteStrip tone="warn">DLT-registered templates only.</NoteStrip>
            </>
          ) : null}

          <div style={{ fontSize: 13, fontWeight: 600, margin: "14px 0 8px" }}>Preview</div>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
              background: "var(--s2)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Live preview</div>
            <div style={{ background: "var(--s1)", borderRadius: 8, padding: 14 }}>
              {row.channel === "email" && cur.subject ? (
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{cur.subject}</div>
              ) : null}
              <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {rendered || "Nothing to preview yet."}
              </div>
            </div>
          </div>

          {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
        </>
      )}
      </div>
      {footer}
    </>
  );
}
