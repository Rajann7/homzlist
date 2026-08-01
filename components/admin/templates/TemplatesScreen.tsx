"use client";

/**
 * A21 — Templates & strings. Template 2237-2322.
 *
 * Five tabs: four channels and the UI string table. The four channel tabs are
 * ONE list resource with a tab per channel, because a template exists per
 * (code, channel) — "Listing approved" legitimately appears under both Email
 * and Push, and those are two rows, not one row shown twice.
 */

import { useEffect, useState } from "react";
import {
  AdminIcon,
  Badge,
  Btn,
  DTable,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  Modal,
  ModTabs,
  Mono,
  NoteStrip,
  PageHead,
  RowMenu,
  Shimmer,
  StatusBadge,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { FilterBar, Pager, useAdminList } from "@/components/admin/list";

type Tab = "email" | "sms" | "whatsapp" | "push" | "uistrings";

const TABS: [Tab, string][] = [
  ["email", "Email"],
  ["sms", "SMS"],
  ["whatsapp", "WhatsApp"],
  ["push", "Push"],
  ["uistrings", "UI strings"],
];

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

const ago = (iso: unknown) => {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(String(iso)).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  const days = Math.floor(mins / 1440);
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
};

export function TemplatesScreen() {
  const [tab, setTab] = useState<Tab>("email");
  return (
    <div>
      <PageHead title="Templates" />
      <ModTabs tabs={TABS} active={tab} onSelect={(k) => setTab(k as Tab)} />
      {tab === "uistrings" ? <StringsTab /> : <ChannelTab channel={tab} />}
    </div>
  );
}

/* ══════════════════════════════════════════════ the four channel tabs ══════ */

type TemplateRow = {
  id: string;
  code: string;
  channel: string;
  name: string;
  is_active: boolean;
  updated_at: string;
  has_en: boolean;
  has_gu: boolean;
  has_hi: boolean;
};

/** template 2260 — the EN/GU/HI dots. Each one is a fact about a locale row. */
function LangDots({ row }: { row: TemplateRow }) {
  const dot = (k: string, on: boolean) => (
    <span
      key={k}
      title={`${k.toUpperCase()}${on ? " translated" : " missing"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        color: on ? "var(--ink2)" : "var(--ink3)",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: on ? "var(--accent)" : "var(--inkDis)",
        }}
      />
      {k.toUpperCase()}
    </span>
  );
  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      {dot("en", row.has_en)}
      {dot("gu", row.has_gu)}
      {dot("hi", row.has_hi)}
    </span>
  );
}

function ChannelTab({ channel }: { channel: string }) {
  const toast = useToast();
  const list = useAdminList<TemplateRow>("templates", ["active"], channel);
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  // The channel tab is the resource's tab, so switching the outer tab has to
  // re-point the list rather than filter the page already loaded.
  useEffect(() => {
    if (list.tab !== channel) list.setTab(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<TemplateRow>[] = [
    { label: "Name", cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    {
      label: "Trigger",
      cell: (r) => (
        <Badge
          bg="var(--s2)"
          fg="var(--ink2)"
          style={{
            textTransform: "none",
            letterSpacing: 0,
            fontWeight: 400,
            fontFamily: "ui-monospace,monospace",
          }}
        >
          {r.code}
        </Badge>
      ),
    },
    { label: "Languages", cell: (r) => <LangDots row={r} /> },
    {
      label: "Status",
      cell: (r) => <StatusBadge status={r.is_active ? "Approved" : "Rejected"} />,
    },
    {
      label: "Last edited",
      cell: (r) => <span style={{ color: "var(--ink3)" }}>{ago(r.updated_at)}</span>,
    },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["Edit", () => setEditing(r)],
            ["Test send", () => void act({ action: "template_test", id: r.id, lang: "en" })],
            [
              r.is_active ? "Disable" : "Enable",
              () => void act({ action: "template_toggle", id: r.id, active: !r.is_active }),
              r.is_active,
            ],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      {list.loading ? (
        <Shimmer h={240} />
      ) : (list.data?.rows ?? []).length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          No templates on this channel.
        </div>
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} onRow={(r) => setEditing(r)} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}
      {editing ? (
        <TemplateEditor
          row={editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            toast(msg);
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** template 2288-2316 — the editor, with its per-language tab and live preview. */
function TemplateEditor({
  row,
  onClose,
  onDone,
}: {
  row: TemplateRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const toast = useToast();
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

  return (
    <Modal
      title={`${row.name} — ${row.channel}`}
      onClose={onClose}
      footer={
        <>
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
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
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
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════ tab 5 · UI strings ════ */

type StringRow = {
  id: string;
  key: string;
  area: string | null;
  en: string;
  gu: string | null;
  hi: string | null;
};

function StringsTab() {
  const toast = useToast();
  const list = useAdminList<StringRow>("ui-strings", ["area"], "all");
  const [editing, setEditing] = useState<{ row: StringRow; lang: "en" | "gu" | "hi" } | null>(null);
  const [importing, setImporting] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (list.data?.tabCounts) setCounts(list.data.tabCounts);
  }, [list.data]);

  const editCell = (r: StringRow, lang: "gu" | "hi") => {
    const v = r[lang];
    return v ? (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setEditing({ row: r, lang });
        }}
        style={{ color: "var(--accent)", cursor: "pointer" }}
      >
        {v}
      </span>
    ) : (
      <span onClick={(e) => { e.stopPropagation(); setEditing({ row: r, lang }); }}>
        <Badge
          bg="var(--warningSoft)"
          fg="var(--warning)"
          style={{ textTransform: "none", letterSpacing: 0, cursor: "pointer" }}
        >
          Add translation
        </Badge>
      </span>
    );
  };

  const cols: Col<StringRow>[] = [
    { label: "Key", cell: (r) => <Mono>{r.key}</Mono> },
    { label: "Screen", cell: (r) => <span style={{ color: "var(--ink3)" }}>{r.area ?? "—"}</span> },
    { label: "English", cell: (r) => r.en },
    { label: "ગુજરાતી", cell: (r) => editCell(r, "gu") },
    { label: "हिन्दी", cell: (r) => editCell(r, "hi") },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["Edit string", () => setEditing({ row: r, lang: "en" })],
            ["Add / edit translations", () => setEditing({ row: r, lang: "gu" })],
            [
              "Copy key",
              () => {
                void navigator.clipboard?.writeText(r.key);
                toast("Key copied");
              },
            ],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <FilterBar
          placeholder="Search key or text"
          search={list.search}
          onSearch={list.setSearch}
          groups={[]}
          filters={list.filters}
          onOpenFilters={() => undefined}
          onClear={list.clearFilters}
          countLabel={`${(list.data?.total ?? 0).toLocaleString("en-IN")} strings`}
        />
        <div style={{ flex: 1 }} />
        <span
          onClick={() => setImporting(true)}
          style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
        >
          Import
        </span>
        <span
          onClick={() => {
            window.location.href = "/api/v1/admin/templates?what=strings-csv";
          }}
          style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
        >
          Export
        </span>
      </div>

      {/* template 2301 — the counts are real counts over the whole table */}
      <ModTabs
        tabs={[
          ["all", "All", counts.all],
          ["missgu", "Missing GU", counts.missgu],
          ["misshi", "Missing HI", counts.misshi],
          ["recent", "Recently changed", counts.recent],
        ]}
        active={list.tab ?? "all"}
        onSelect={list.setTab}
      />

      <NoteStrip tone="neutral">
        Only the interface is translated. User content (listings, chats) is never translated.
      </NoteStrip>

      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {editing ? (
        <StringEditor
          row={editing.row}
          lang={editing.lang}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            toast(msg);
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}

      {importing ? (
        <StringImport
          onClose={() => setImporting(false)}
          onDone={(msg) => {
            toast(msg);
            setImporting(false);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function StringEditor({
  row,
  lang,
  onClose,
  onDone,
}: {
  row: StringRow;
  lang: "en" | "gu" | "hi";
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [value, setValue] = useState(row[lang] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={`${row.key} (${lang.toUpperCase()})`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Saving…" : "Save"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({ action: "string_save", key: row.key, [lang]: value });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
      {lang !== "en" ? (
        <div style={{ fontSize: 12, color: "var(--ink3)", marginBottom: 10 }}>
          English: {row.en}
        </div>
      ) : null}
      <FField label="Value">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 90 }}
        />
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

function StringImport({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState<string[]>([]);

  return (
    <Modal
      title="Import strings"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Importing…" : "Import"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError("");
              const json = await post({ action: "string_import", csv });
              setBusy(false);
              if (json?.ok) {
                const miss = (json.data?.unknown ?? []) as string[];
                if (miss.length) setUnknown(miss);
                else onDone(String(json.data?.summary ?? "Imported"));
              } else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <FField label="CSV" helper="key,en,gu,hi — one row per string">
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          spellCheck={false}
          style={{
            ...F_TEXTAREA_STYLE,
            height: 180,
            fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
            fontSize: 12,
          }}
        />
      </FField>
      {unknown.length ? (
        <NoteStrip tone="warn">
          {`${unknown.length} key(s) were skipped because no screen uses them: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}. Everything else was imported.`}
        </NoteStrip>
      ) : null}
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}
