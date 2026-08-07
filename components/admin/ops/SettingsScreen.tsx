"use client";

/**
 * A22 — Settings & flags. Template 2323-2426.
 *
 * Seven tabs, and the most dangerous screen in the panel. Everything on it is
 * Super-only, server-enforced; the lock gate the shell draws for an Admin is
 * the UI half of that, never the whole of it.
 *
 * Three of these tabs edit tables that, until this part, nothing read: the
 * flags, the rate limits and the velocity rules. The limiter now reads its
 * numbers from `rate_limits` (lib/auth/rate-limit.ts), so a change here is a
 * change to the front door rather than to a display value.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Btn,
  DTable,
  FField,
  F_INPUT_STYLE,
  Modal,
  ModTabs,
  Mono,
  NoteStrip,
  PageHead,
  Shimmer,
  Switch,
  UsageBar,
  useToast,
  type Col,
} from "@/components/admin/ds";
import { useAdminList, ListError } from "@/components/admin/list";

type Tab = "flags" | "branding" | "boost" | "limits" | "retention" | "maint" | "actions";

const TABS: [Tab, string][] = [
  ["flags", "Feature flags"],
  ["branding", "Branding"],
  ["boost", "Boost & pricing"],
  ["limits", "Limits & velocity"],
  ["retention", "Retention"],
  ["maint", "Maintenance"],
  ["actions", "System actions"],
];

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

async function get(what: string) {
  const res = await fetch(`/api/v1/admin/settings?what=${what}`, { cache: "no-store" }).catch(
    () => null,
  );
  const json = (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown> }
    | null;
  return json?.ok ? (json.data ?? null) : null;
}

const rupees = (paise: unknown) =>
  `₹${Math.round(Number(paise ?? 0) / 100).toLocaleString("en-IN")}`;

export function SettingsScreen() {
  const [tab, setTab] = useState<Tab>("flags");
  return (
    <div>
      <PageHead title="Settings" />
      <ModTabs tabs={TABS} active={tab} onSelect={(k) => setTab(k as Tab)} />
      {tab === "flags" ? (
        <FlagsTab />
      ) : tab === "branding" ? (
        <BrandingTab />
      ) : tab === "boost" ? (
        <BoostTab />
      ) : tab === "limits" ? (
        <LimitsTab />
      ) : tab === "retention" ? (
        <RetentionTab />
      ) : tab === "maint" ? (
        <MaintenanceTab />
      ) : (
        <ActionsTab />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ tab 1 · flags ═══ */

function FlagsTab() {
  const toast = useToast();
  const list = useAdminList<{
    id: string;
    key: string;
    label: string;
    description: string | null;
    enabled: boolean;
    scope: string;
    scope_value: string | null;
    updated_at: string;
    updated_by_name: string | null;
  }>("flags", ["scope"]);
  const [scoping, setScoping] = useState<{ key: string; label: string; scope: string; scope_value: string | null } | null>(null);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  type Row = NonNullable<typeof list.data>["rows"][number];
  const cols: Col<Row>[] = [
    { label: "Feature", cell: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
    { label: "Description", cell: (r) => <span style={{ color: "var(--ink2)" }}>{r.description ?? "—"}</span> },
    {
      label: "Scope",
      cell: (r) => (
        <span onClick={(e) => { e.stopPropagation(); setScoping(r); }} style={{ cursor: "pointer" }}>
          <Badge
            bg={r.scope === "all" ? "var(--s2)" : "var(--infoSoft)"}
            fg={r.scope === "all" ? "var(--ink2)" : "var(--info)"}
            style={{ textTransform: "none", letterSpacing: 0 }}
          >
            {r.scope === "all" ? "All users" : `${r.scope}${r.scope_value ? ` · ${r.scope_value}` : ""}`}
          </Badge>
        </span>
      ),
    },
    {
      label: "Status",
      cell: (r) => (
        <Switch
          on={r.enabled}
          onClick={() => void act({ action: "flag_toggle", id: r.key, enabled: !r.enabled })}
        />
      ),
    },
    {
      label: "Last changed",
      cell: (r) => (
        <span style={{ fontSize: 11, color: "var(--ink3)" }}>
          {r.updated_by_name ?? "—"} ·{" "}
          {r.updated_at
            ? new Date(r.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      {list.error ? <ListError code={list.error} onRetry={list.reload} /> : list.loading ? <Shimmer h={280} /> : <DTable cols={cols} rows={list.data?.rows ?? []} />}
      <div style={{ marginTop: 16 }}>
        <NoteStrip tone="warn">
          Turning a feature off hides it for everyone immediately. Use for incidents.
        </NoteStrip>
      </div>
      {scoping ? (
        <ScopeEditor
          row={scoping}
          onClose={() => setScoping(null)}
          onDone={(msg) => {
            toast(msg);
            setScoping(null);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ScopeEditor({
  row,
  onClose,
  onDone,
}: {
  row: { key: string; label: string; scope: string; scope_value: string | null };
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [scope, setScope] = useState(row.scope);
  const [value, setValue] = useState(row.scope_value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={`Scope — ${row.label}`}
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
              setError("");
              const json = await post({
                action: "flag_scope",
                id: row.key,
                scope,
                scope_value: scope === "all" ? null : value,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <FField label="Who sees it">
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={F_INPUT_STYLE}>
          <option value="all">All users</option>
          <option value="percent">A percentage (rollout)</option>
          <option value="role">One role</option>
          <option value="city">One city</option>
          <option value="staff">Staff only</option>
        </select>
      </FField>
      {scope !== "all" && scope !== "staff" ? (
        <FField
          label={scope === "percent" ? "Percentage" : scope === "role" ? "Role" : "City"}
          helper={scope === "percent" ? "0–100" : undefined}
        >
          <input value={value} onChange={(e) => setValue(e.target.value)} style={F_INPUT_STYLE} />
        </FField>
      ) : null}
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/* ════════════════════════════════════════════════════ tab 2 · branding ═══ */

function BrandingTab() {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setValues(((await get("branding")) ?? {}) as Record<string, string>);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!values) return <Shimmer h={280} />;
  const set = (k: string, v: string) => setValues((s) => ({ ...(s ?? {}), [k]: v }));

  return (
    <div>
      {/* template 2400: `mobile ? column : '1fr 1fr'` — split at tablet */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--s1)", padding: 20 }}>
          <FField label="App name">
            <input value={values.app_name ?? ""} onChange={(e) => set("app_name", e.target.value)} style={F_INPUT_STYLE} />
          </FField>
          <FField label="Tagline">
            <input value={values.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} style={F_INPUT_STYLE} />
          </FField>
          <FField label="Primary colour" helper="6-digit hex — it becomes the accent everywhere">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: values.primary_color ?? "#0F9D58",
                  flex: "none",
                  border: "1px solid var(--border)",
                }}
              />
              <input
                value={values.primary_color ?? ""}
                onChange={(e) => set("primary_color", e.target.value)}
                style={F_INPUT_STYLE}
              />
            </div>
          </FField>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--s1)", padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Live previews</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
            <div
              style={{
                height: 44,
                borderBottom: "1px solid var(--divider)",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              <span>{(values.app_name ?? "HomzList").slice(0, 4)}</span>
              <span style={{ color: values.primary_color ?? "var(--accent)" }}>
                {(values.app_name ?? "HomzList").slice(4)}
              </span>
            </div>
            <div style={{ height: 60, background: "var(--s2)" }} />
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                height: 80,
                background:
                  "repeating-linear-gradient(135deg,var(--s2),var(--s2) 10px,var(--s3) 10px,var(--s3) 20px)",
              }}
            />
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{values.app_name ?? "HomzList"}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                {values.tagline ?? ""} · homzlist.com
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16 }}>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for change…"
          style={{ ...F_INPUT_STYLE, flex: 1, height: 38 }}
        />
        <Btn
          label={busy ? "Saving…" : "Save branding"}
          kind="primary"
          onClick={async () => {
            setBusy(true);
            const json = await post({ action: "branding_save", ...values, reason });
            setBusy(false);
            toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't save"));
            if (json?.ok) void load();
          }}
        />
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════ tab 3 · boost rates ═══ */

function BoostTab() {
  const toast = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const load = useCallback(async () => setData(await get("boost")), []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) void load();
  };

  if (!data) return <Shimmer h={280} />;

  type Rate = { code: string; label: string; price_paise: number; is_active: boolean; sales_30d: number };
  type Cap = { city_id: string; max_active_boosts: number; active_now: number; locations?: { name: string } };

  const rates = (data.rates ?? []) as Rate[];
  const caps = (data.caps ?? []) as Cap[];

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Boost rates</div>
      <DTable
        cols={[
          { label: "Duration", cell: (r: Rate) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
          { label: "Price", cell: (r: Rate) => rupees(r.price_paise) },
          {
            label: "Active",
            cell: (r: Rate) => (
              <Switch
                on={r.is_active}
                onClick={() => void act({ action: "rate_save", id: r.code, is_active: !r.is_active })}
              />
            ),
          },
          { label: "Sales (30d)", cell: (r: Rate) => r.sales_30d },
        ]}
        rows={rates}
      />

      <div style={{ marginTop: 20 }}>
        <NoteStrip tone="info">
          Limits how many boosted listings can appear at once in a city, so the feed stays useful.
        </NoteStrip>
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, margin: "10px 0" }}>City caps</div>
      <DTable
        cols={[
          {
            label: "City",
            cell: (r: Cap) => <span style={{ fontWeight: 600 }}>{r.locations?.name ?? r.city_id.slice(0, 8)}</span>,
          },
          { label: "Cap", cell: (r: Cap) => r.max_active_boosts },
          {
            label: "Currently active",
            cell: (r: Cap) => (
              <div>
                {r.active_now} / {r.max_active_boosts}
                <UsageBar
                  pct={r.max_active_boosts ? Math.min(100, (r.active_now / r.max_active_boosts) * 100) : 0}
                />
              </div>
            ),
          },
        ]}
        rows={caps}
      />

      <div style={{ marginTop: 16 }}>
        <NoteStrip tone="ok">Price changes apply to new purchases only.</NoteStrip>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ tab 4 · limits & velocity ═══ */

function LimitsTab() {
  const toast = useToast();
  const limits = useAdminList<{
    id: string;
    key: string;
    label: string;
    scope: string;
    window_seconds: number;
    max_requests: number;
    is_active: boolean;
    hits_24h: number;
  }>("rate-limits", ["scope"]);
  const velocity = useAdminList<{
    id: string;
    key: string;
    label: string;
    threshold: number;
    window_hours: number;
    action: string;
    is_active: boolean;
    hits_24h: number;
  }>("velocity", ["action"]);
  const [editing, setEditing] = useState<{ key: string; label: string; max: number; window: number } | null>(null);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) {
      limits.reload();
      velocity.reload();
    }
  };

  const window = (secs: number) =>
    secs >= 86400 ? `${secs / 86400}d` : secs >= 3600 ? `${secs / 3600}h` : `${secs / 60}min`;

  return (
    <div>
      <NoteStrip tone="info">
        These are the numbers the limiter actually uses — an edit here changes the front door on the
        next request, not just this table.
      </NoteStrip>

      <div style={{ fontSize: 15, fontWeight: 600, margin: "10px 0" }}>Rate limits</div>
      {limits.loading ? (
        <Shimmer h={200} />
      ) : (
        <DTable
          cols={[
            {
              label: "Endpoint",
              cell: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span>,
            },
            {
              label: "Limit",
              cell: (r) => (
                <span
                  onClick={() =>
                    setEditing({ key: r.key, label: r.label, max: r.max_requests, window: r.window_seconds })
                  }
                  style={{ color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
                >
                  {r.max_requests} / {window(r.window_seconds)}
                </span>
              ),
            },
            {
              label: "Scope",
              cell: (r) => (
                <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                  Per {r.scope}
                </Badge>
              ),
            },
            { label: "Hits (24h)", cell: (r) => r.hits_24h },
            {
              label: "Status",
              cell: (r) => (
                <Switch
                  on={r.is_active}
                  onClick={() => void act({ action: "limit_save", id: r.key, is_active: !r.is_active })}
                />
              ),
            },
          ]}
          rows={limits.data?.rows ?? []}
        />
      )}

      <div style={{ fontSize: 15, fontWeight: 600, margin: "20px 0 10px" }}>Velocity rules</div>
      {velocity.loading ? (
        <Shimmer h={200} />
      ) : (
        <DTable
          cols={[
            { label: "Action", cell: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
            { label: "Threshold", cell: (r) => `${r.threshold} / ${r.window_hours}h` },
            {
              label: "Then",
              cell: (r) => (
                <Badge
                  bg={
                    r.action === "block"
                      ? "var(--errorSoft)"
                      : r.action === "throttle"
                        ? "var(--warningSoft)"
                        : "var(--infoSoft)"
                  }
                  fg={
                    r.action === "block"
                      ? "var(--error)"
                      : r.action === "throttle"
                        ? "var(--warning)"
                        : "var(--info)"
                  }
                  style={{ textTransform: "none", letterSpacing: 0 }}
                >
                  {r.action}
                </Badge>
              ),
            },
            {
              label: "Status",
              cell: (r) => (
                <Switch
                  on={r.is_active}
                  onClick={() => void act({ action: "velocity_save", id: r.key, is_active: !r.is_active })}
                />
              ),
            },
          ]}
          rows={velocity.data?.rows ?? []}
        />
      )}

      <div style={{ marginTop: 16 }}>
        <NoteStrip tone="neutral">
          Velocity rules only flag or slow — genuine users never hit these.
        </NoteStrip>
      </div>

      {editing ? (
        <LimitEditor
          row={editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            toast(msg);
            setEditing(null);
            limits.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function LimitEditor({
  row,
  onClose,
  onDone,
}: {
  row: { key: string; label: string; max: number; window: number };
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [max, setMax] = useState(String(row.max));
  const [win, setWin] = useState(String(row.window));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={row.label}
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
              setError("");
              const json = await post({
                action: "limit_save",
                id: row.key,
                max_requests: Number(max),
                window_seconds: Number(win),
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <NoteStrip tone="warn">
        This is live. Too low and real users are blocked; too high and the endpoint is unprotected.
      </NoteStrip>
      <FField label="Max requests">
        <input value={max} onChange={(e) => setMax(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Window (seconds)">
        <input value={win} onChange={(e) => setWin(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════ tab 5 · retention ═══ */

function RetentionTab() {
  const toast = useToast();
  const [rows, setRows] = useState<
    { key: string; label: string; days: number; is_locked: boolean; note: string | null }[] | null
  >(null);
  const [editing, setEditing] = useState<{ key: string; label: string; days: number } | null>(null);

  const load = useCallback(async () => {
    const d = await get("retention");
    setRows(((d?.rows ?? []) as never[]) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!rows) return <Shimmer h={280} />;

  return (
    <div>
      <DTable
        cols={[
          { label: "Data type", cell: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
          {
            label: "Keep for",
            cell: (r) =>
              r.is_locked ? (
                // The padlock is a picture; the refusal is in the endpoint.
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                  {r.days} days 🔒
                </span>
              ) : (
                <span
                  onClick={() => setEditing({ key: r.key, label: r.label, days: r.days })}
                  style={{ color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
                >
                  {r.days} days
                </span>
              ),
          },
          {
            label: "Note",
            cell: (r) => <span style={{ fontSize: 11, color: "var(--ink3)" }}>{r.note ?? "—"}</span>,
          },
        ]}
        rows={rows}
      />
      <div style={{ marginTop: 16 }}>
        <NoteStrip tone="neutral">DPDP-aligned. Legal minimums are locked.</NoteStrip>
      </div>

      {editing ? (
        <Modal
          title={editing.label}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setEditing(null)} style={{ flex: 1 }} />
              <Btn
                label="Save"
                kind="primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  const json = await post({
                    action: "retention_save",
                    id: editing.key,
                    days: editing.days,
                  });
                  toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
                  if (json?.ok) {
                    setEditing(null);
                    void load();
                  }
                }}
              />
            </>
          }
        >
          <FField label="Keep for (days)">
            <input
              value={String(editing.days)}
              onChange={(e) => setEditing({ ...editing, days: Number(e.target.value) || 0 })}
              style={F_INPUT_STYLE}
            />
          </FField>
        </Modal>
      ) : null}
    </div>
  );
}

/* ═════════════════════════════════════════════════ tab 6 · maintenance ═══ */

function MaintenanceTab() {
  const toast = useToast();
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => setState(await get("maintenance")), []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return <Shimmer h={240} />;
  const on = state.enabled === true;

  return (
    <div>
      <div
        style={{
          border: `1px solid ${on ? "var(--error)" : "var(--border)"}`,
          borderRadius: 12,
          background: on ? "var(--errorSoft)" : "var(--s1)",
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Switch
            on={on}
            onClick={async () => {
              if (on) {
                const json = await post({ action: "maintenance", enabled: false });
                toast(json?.ok ? `${json.data?.summary}` : "That didn't work");
                void load();
              } else {
                setConfirming(true);
              }
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Maintenance mode</div>
            <div style={{ fontSize: 12, color: "var(--ink2)" }}>
              {on ? "ON · Users see the maintenance page" : "Off — the app is live for everyone"}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--s1)",
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>User maintenance page preview</div>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 30,
            textAlign: "center",
            background: "var(--s2)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>We&apos;ll be right back</div>
          <div style={{ fontSize: 13, color: "var(--ink2)" }}>
            {String(state.message ?? "HomzList is under maintenance.")}
          </div>
        </div>
      </div>

      <NoteStrip tone="ok">
        Admins and staff bypass maintenance automatically — the bypass is not a setting that can be
        cleared, because clearing it would lock the panel that turns this off.
      </NoteStrip>

      {confirming ? (
        <MaintenanceOn
          onClose={() => setConfirming(false)}
          onDone={(msg) => {
            toast(msg);
            setConfirming(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function MaintenanceOn({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [message, setMessage] = useState("HomzList is under maintenance. Back in ~30 minutes.");
  // Minutes, because `maintenance_settings.eta` is a timestamp and the server
  // turns a duration into the moment we expect to be back.
  const [etaMinutes, setEtaMinutes] = useState("30");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Turn on maintenance mode"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Turning on…" : "Turn on"}
            kind="danger"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({
                action: "maintenance",
                enabled: true,
                message,
                eta_minutes: Number(etaMinutes),
              });
              setBusy(false);
              onDone(String(json?.ok ? json.data?.summary : (json?.error?.message ?? "That didn't work")));
            }}
          />
        </>
      }
    >
      <NoteStrip tone="warn">
        Every user is shown the maintenance page immediately. Staff keep working.
      </NoteStrip>
      <FField label="What users see">
        <input value={message} onChange={(e) => setMessage(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Expected duration (minutes)">
        <input
          value={etaMinutes}
          onChange={(e) => setEtaMinutes(e.target.value.replace(/D/g, "").slice(0, 4))}
          style={F_INPUT_STYLE}
        />
      </FField>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════ tab 7 · system actions ══ */

function ActionsTab() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const ACTIONS: [op: string, title: string, detail: string, cta: string][] = [
    ["purge_cdn", "Purge CDN cache", "Images may load slower for a few minutes.", "Purge now"],
    ["sitemaps", "Regenerate sitemaps", "Rebuild sitemap.xml for all public URLs.", "Regenerate"],
    ["reindex", "Rebuild search index", "Re-index all listings and requirements.", "Rebuild"],
    ["area_stats", "Recalculate area stats", "Refresh avg prices and counts per area.", "Recalculate"],
    ["resend_notifications", "Resend failed notifications", "Re-queue every delivery that failed.", "Resend"],
    ["clear_rate_blocks", "Clear rate-limit blocks", "Clears every rate-limit counter.", "Clear"],
  ];

  return (
    <div>
      <NoteStrip tone="warn">
        These act on the live system. Each one is logged with who ran it.
      </NoteStrip>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2" style={{ marginTop: 12 }}>
        {ACTIONS.map(([op, title, detail, cta]) => (
          <div
            key={op}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--s1)",
              padding: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 12, color: "var(--ink3)" }}>{detail}</div>
            </div>
            <Btn
              label={busy === op ? "…" : cta}
              kind="outline"
              style={{ height: 32, fontSize: 13 }}
              onClick={async () => {
                setBusy(op);
                const json = await post({ action: "system_action", op });
                setBusy(null);
                // A job with no registered worker reports that, rather than
                // showing a success toast over nothing.
                toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
