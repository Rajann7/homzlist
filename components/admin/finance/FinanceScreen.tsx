"use client";

/**
 * A16 — Finance. Template 1148-1163.
 *
 * Four tabs, fetched one at a time. Every number is the server's: the trend,
 * the product split, the renewal rate and the reconciliation counts are all
 * SQL, because a KPI the browser derives from the page it happens to be showing
 * changes when you paginate.
 *
 * Where the design draws a fixture the product cannot produce, the screen says
 * so rather than printing the fixture — a Finance screen that guesses is worse
 * than one that admits it does not know.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  Chip,
  Modal,
  PageHead,
  ShareBar,
  Shimmer,
  useToast,
  usePanels,
} from "@/components/admin/ds";
import { useNow } from "@/lib/hooks/useNow";

type Tab = "revenue" | "churn" | "recon" | "exports";
const TABS: [Tab, string][] = [
  ["revenue", "Revenue"],
  ["churn", "Churn"],
  ["recon", "Reconciliation"],
  ["exports", "Exports"],
];

const RANGES: [key: string, label: string][] = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["6m", "Last 6 months"],
  ["12m", "Last year"],
];

const rupees = (paise: unknown) =>
  `₹${Math.round(Number(paise ?? 0) / 100).toLocaleString("en-IN")}`;

const short = (paise: unknown) => {
  const r = Number(paise ?? 0) / 100;
  if (r >= 1_00_00_000) return `₹${(r / 1_00_00_000).toFixed(1)}Cr`;
  if (r >= 1_00_000) return `₹${(r / 1_00_000).toFixed(1)}L`;
  if (r >= 1_000) return `₹${(r / 1_000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
};

/**
 * "1–31 Jan 2025" — the design's own format (template 1151). The month and year
 * are printed once when both ends share them, which is what makes the short
 * form readable; a range that straddles a month prints both.
 */
function rangeLabel(from: unknown, to: unknown): string | null {
  if (!from || !to) return null;
  const a = new Date(String(from));
  const b = new Date(String(to));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const mon = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
    return `${a.getDate()}–${b.getDate()} ${mon(b)} ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear())
    return `${a.getDate()} ${mon(a)} – ${b.getDate()} ${mon(b)} ${b.getFullYear()}`;
  return `${a.getDate()} ${mon(a)} ${a.getFullYear()} – ${b.getDate()} ${mon(b)} ${b.getFullYear()}`;
}

const day = (iso: unknown) =>
  iso
    ? new Date(String(iso)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "—";

export function FinanceScreen() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("revenue");
  const [range, setRange] = useState("30d");
  const [gran, setGran] = useState<"day" | "week" | "month">("week");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [rangeOpen, setRangeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = tab === "revenue" ? `&range=${range}&gran=${gran}` : "";
    const res = await fetch(`/api/v1/admin/finance?tab=${tab}${q}`, { cache: "no-store" }).catch(
      () => null,
    );
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: Record<string, unknown> }
      | null;
    setData(json?.ok ? (json.data ?? null) : null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range, gran, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/v1/admin/finance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    toast(json?.ok ? `${json.data?.summary} · logged` : (json?.error?.message ?? "That didn't go through"));
    if (json?.ok) setNonce((n) => n + 1);
  };

  return (
    <div>
      <PageHead
        title="Finance"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setRangeOpen(true)}
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--s1)",
                color: "var(--ink1)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {/* template 1151 prints the WINDOW ("1–31 Jan 2025"), not the
                  name of a preset. The dates are the server's resolved range,
                  so the button and the numbers under it cannot disagree. */}
              {rangeLabel(data?.range_from, data?.range_to) ??
                (RANGES.find((r) => r[0] === range)?.[1] ?? "Last 30 days")}
              <AdminIcon name="chevD" size={16} />
            </button>
          </div>
        }
      />

      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--divider)",
          marginBottom: 16,
          overflowX: "auto",
        }}
      >
        {TABS.map(([key, label]) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "10px 12px",
              fontSize: 15,
              fontWeight: 600,
              color: tab === key ? "var(--ink1)" : "var(--ink3)",
              borderBottom: `2px solid ${tab === key ? "var(--accent)" : "transparent"}`,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {loading || !data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Shimmer h={90} />
          <Shimmer h={200} />
        </div>
      ) : tab === "revenue" ? (
        <RevenueTab data={data} gran={gran} onGran={setGran} />
      ) : tab === "churn" ? (
        <ChurnTab data={data} onRemind={(id) => act({ action: "remind", id })} />
      ) : tab === "recon" ? (
        <ReconTab data={data} onAct={act} />
      ) : (
        <ExportsTab data={data} range={range} onDone={() => setNonce((n) => n + 1)} />
      )}

      {rangeOpen ? (
        <Modal
          title="Date range"
          onClose={() => setRangeOpen(false)}
          footer={<Btn label="Close" kind="outline" onClick={() => setRangeOpen(false)} />}
        >
          {RANGES.map(([key, label]) => (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                checked={range === key}
                onChange={() => {
                  setRange(key);
                  // The bar granularity follows the range: 12 months of daily
                  // bars is 365 bars in a 130px box.
                  setGran(key === "7d" ? "day" : key === "30d" ? "week" : "month");
                  setRangeOpen(false);
                }}
                style={{ accentColor: "var(--accent)" }}
              />
              {label}
            </label>
          ))}
        </Modal>
      ) : null}
    </div>
  );
}

function Kpi({
  value,
  label,
  delta,
  up,
  error,
}: {
  value: string;
  label: string;
  delta?: string;
  up?: boolean;
  error?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--s1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        flex: 1,
        minWidth: 150,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: error ? "var(--error)" : "var(--ink1)" }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 2 }}>{label}</div>
      {delta ? (
        <div style={{ marginTop: 8 }}>
          {/* template 1155: accentSoft/accent when up, errorSoft/error when down */}
          <Badge
            bg={up ? "var(--accentSoft)" : "var(--errorSoft)"}
            fg={up ? "var(--accent)" : "var(--error)"}
            style={{ textTransform: "none", letterSpacing: 0 }}
          >
            {delta}
          </Badge>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────── template 1150 · revenue ─── */

function RevenueTab({
  data,
  gran,
  onGran,
}: {
  data: Record<string, unknown>;
  gran: string;
  onGran: (g: "day" | "week" | "month") => void;
}) {
  const k = data.kpis as Record<string, number>;
  const trend = (data.trend ?? []) as { bucket: string; plan: number; boost: number; topup: number; total: number }[];
  const byProduct = (data.byProduct ?? []) as {
    code: string;
    name: string;
    sales: number;
    revenue_paise: number;
    share: number;
  }[];
  const byCity = (data.byCity ?? []) as { name: string; revenue_paise: number; share: number }[];

  const max = Math.max(1, ...trend.map((t) => t.total));
  const bar = (v: number) => Math.round((v / max) * 100);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {/* template 1155 puts a delta badge on the FIRST card only, and the
            other three carry none. */}
        <Kpi
          value={rupees(k.revenue_paise)}
          label="Total revenue"
          delta={
            k.delta_pct === null || k.delta_pct === undefined
              ? undefined
              : `${Number(k.delta_pct) >= 0 ? "▲" : "▼"} ${Math.abs(Number(k.delta_pct))}% vs last period`
          }
          up={Number(k.delta_pct) >= 0}
        />
        <Kpi value={k.transactions.toLocaleString("en-IN")} label="Transactions" />
        <Kpi value={rupees(k.avg_order_paise)} label="Avg order value" />
        <Kpi value={rupees(k.refunds_paise)} label="Refunds" error />
      </div>

      <div
        style={{
          background: "var(--s1)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        {/* template 1158 — one row, no wrap: the title takes flex:1 and gives
            way to the three chips rather than pushing "Monthly" onto a second
            line. A minWidth here is what made it wrap at 390. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>Revenue trend</div>
          {(["day", "week", "month"] as const).map((g) => (
            <Chip
              key={g}
              label={g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
              active={gran === g}
              onClick={() => onGran(g)}
            />
          ))}
        </div>

        {trend.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink3)", padding: "24px 0" }}>
            No paid orders in this range.
          </div>
        ) : (
          <>
            <div
              className="gap-2 md:gap-4"
              style={{ display: "flex", alignItems: "flex-end", height: 130, overflowX: "auto" }}
            >
              {trend.map((t) => (
                <div
                  key={t.bucket}
                  style={{
                    flex: 1,
                    minWidth: 18,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    title={`${t.bucket} · ${rupees(t.total)}`}
                    style={{
                      width: "100%",
                      maxWidth: 32,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      height: 100,
                    }}
                  >
                    <div style={{ height: `${bar(t.plan)}%`, background: "var(--accent)", borderRadius: "3px 3px 0 0" }} />
                    <div style={{ height: `${bar(t.boost)}%`, background: "var(--info)" }} />
                    <div style={{ height: `${bar(t.topup)}%`, background: "var(--warning)", borderRadius: "0 0 3px 3px" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", whiteSpace: "nowrap" }}>
                    {t.bucket.length === 7 ? t.bucket.slice(5) : day(t.bucket)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              {(
                [
                  ["Plans", "var(--accent)"],
                  ["Boosts", "var(--info)"],
                  ["Top-ups", "var(--warning)"],
                ] as [string, string][]
              ).map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink2)" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                  {l}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* template 1165: `gridTemplateColumns: mobile?'1fr':'1.4fr 1fr'` — the
          second column starts at TABLET, not at desktop. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By product</div>
          {byProduct.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nothing sold in this range.</div>
          ) : (
            byProduct.map((b, i) => (
              <div key={b.code} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{b.name}</span>
                  <span>{rupees(b.revenue_paise)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                  {b.sales} sales · {b.share}%
                </div>
                <ShareBar pct={b.share} />
              </div>
            ))
          )}
        </div>

        <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>By city</div>
          {byCity.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink3)" }}>No city data in this range.</div>
          ) : (
            byCity.map((c, i) => (
              <div key={c.name} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span>{short(c.revenue_paise)}</span>
                </div>
                <ShareBar pct={c.share} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────── template 1152 · churn ─── */

function ChurnTab({
  data,
  onRemind,
}: {
  data: Record<string, unknown>;
  onRemind: (id: string) => void;
}) {
  const now = useNow();
  const { pushPanel } = usePanels();
  const k = data.kpis as Record<string, number>;
  const rows = (data.rows ?? []) as Record<string, string | number | boolean | null>[];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi value={String(k.expiring_7d)} label="Expiring in 7 days" />
        <Kpi
          value={`${k.renewal_rate}%`}
          label="Renewal rate"
          delta={`over ${k.renewal_basis} ended plans`}
        />
        <Kpi value={String(k.churned_last_month)} label="Churned last month" />
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)", padding: 24 }}>
          Nothing expires in the next 30 days.
        </div>
      ) : (
        <div
          style={{
            background: "var(--s1)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["User", "Plan", "Expires", "Renewed?", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink2)",
                      background: "var(--s2)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = r.expires_at
                  ? Math.ceil((new Date(String(r.expires_at)).getTime() - now) / 86_400_000)
                  : null;
                const soon = Boolean(r.expiring_soon);
                return (
                  <tr key={String(r.id)} style={{ borderTop: "1px solid var(--divider)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        onClick={() => pushPanel("user", { id: r.profile_id, name: r.user_name })}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}
                      >
                        <Avatar initials={String(r.user_name ?? "U").slice(0, 2).toUpperCase()} size={24} />
                        {String(r.user_name)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>
                      {String(r.plan_name)}
                      {r.is_trial ? (
                        <Badge bg="var(--s2)" fg="var(--ink3)" style={{ textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
                          trial
                        </Badge>
                      ) : null}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: 13,
                        color: soon ? "var(--warning)" : "var(--ink2)",
                        fontWeight: soon ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {day(r.expires_at)}
                      {days !== null ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>
                      {r.renewed ? (
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>Renewed ✓</span>
                      ) : (
                        <span style={{ color: "var(--ink3)" }}>Not yet</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Btn
                        label="Remind"
                        kind="outline"
                        style={{ height: 30, fontSize: 12 }}
                        onClick={() => onRemind(String(r.id))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────── template 1155 · reconciliation ─ */

function ReconTab({
  data,
  onAct,
}: {
  data: Record<string, unknown>;
  onAct: (body: Record<string, unknown>) => void;
}) {
  const counts = data.counts as Record<string, number>;
  const mismatches = (data.mismatches ?? []) as Record<string, unknown>[];
  const lastRun = data.lastRun as Record<string, unknown> | null;
  const configured = Boolean(data.gatewayConfigured);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const box = (value: number, label: string, bg: string, fg: string) => (
    <div style={{ flex: 1, minWidth: 140, background: bg, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: fg }}>{value.toLocaleString("en-IN")}</div>
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>{label}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--ink2)", flex: 1, minWidth: 200 }}>
          Razorpay settlements vs HomzList records ·{" "}
          {lastRun ? `last synced ${day(lastRun.ran_at)}` : "never synced"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {box(counts.matched, "Matched ✓", "var(--accentSoft)", "var(--accent)")}
        {box(counts.mismatched, "Mismatched ⚠", "var(--errorSoft)", "var(--error)")}
        {box(counts.pending, "Pending", "var(--infoSoft)", "var(--info)")}
      </div>

      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink3)",
          textTransform: "uppercase",
          letterSpacing: ".3px",
          marginBottom: 8,
        }}
      >
        Mismatches
      </div>

      {!configured ? (
        <div
          style={{
            background: "var(--warningSoft)",
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: "var(--ink2)",
            marginBottom: 10,
          }}
        >
          Razorpay is not configured on this environment, so &quot;Re-check&quot; has nothing to ask.
          The counts above are still real — they are our own records.
        </div>
      ) : null}

      {mismatches.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nothing is out of step.</div>
      ) : (
        mismatches.map((m) => {
          const pay = m.payment as Record<string, unknown> | null;
          return (
            <div
              key={String(m.id)}
              style={{
                background: "var(--errorSoft)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, fontWeight: 600 }}>
                  {String(pay?.razorpay_payment_id ?? m.gateway_ref ?? m.id)}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 4 }}>
                  Ours: {rupees(m.platform_paise)} · {String(pay?.status_key ?? "—")} &nbsp;·&nbsp;
                  Razorpay: {m.gateway_paise === null ? "not seen" : rupees(m.gateway_paise)}
                </div>
              </div>
              <Btn
                label="Re-check"
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                onClick={() => onAct({ action: "recheck", id: m.id })}
              />
              <Btn
                label="Mark resolved"
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                onClick={() => {
                  setResolving(String(m.id));
                  setNote("");
                }}
              />
            </div>
          );
        })
      )}

      {resolving ? (
        <Modal
          title="Mark this mismatch resolved?"
          onClose={() => setResolving(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setResolving(null)} />
              <Btn
                label="Mark resolved"
                kind="primary"
                onClick={() => {
                  if (!note.trim()) return;
                  onAct({ action: "resolve", id: resolving, note });
                  setResolving(null);
                }}
              />
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--ink2)" }}>
            It stops being counted as a mismatch. The reason is kept on the row.
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is it resolved? (required)"
            style={{
              width: "100%",
              height: 60,
              marginTop: 10,
              padding: 10,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--s2)",
              color: "var(--ink1)",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "none",
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────── template 1160 · exports ─── */

/**
 * The three exports the design lists (template 1160), each with the columns it
 * writes. They are declared here rather than "all of them" because an export
 * whose column set is implicit is one nobody notices growing a personal field.
 */
const FINANCE_EXPORTS: { resource: string; name: string; fields: string[] }[] = [
  {
    resource: "finance-invoices",
    name: "GST invoice list",
    fields: ["number", "issued", "gstin", "totals", "emailed"],
  },
  {
    resource: "finance-revenue",
    name: "Revenue summary",
    fields: ["date", "product", "base", "discount", "cgst", "sgst", "igst", "total", "status"],
  },
  {
    resource: "finance-refunds",
    name: "Refunds report",
    fields: ["payment", "user", "item", "amount", "refunded", "invoice"],
  },
];

function ExportsTab({
  data,
  onDone,
  range,
}: {
  data: Record<string, unknown>;
  onDone: () => void;
  /** the range the screen is already showing — the design's own header control */
  range: string;
}) {
  const toast = useToast();
  const rows = (data.rows ?? []) as Record<string, string | number>[];
  const [busy, setBusy] = useState<string | null>(null);

  async function generate(resource: string, name: string, fields: string[]) {
    setBusy(resource);
    // The export covers what the screen is showing. A "revenue summary" that
    // silently exported all time while the header said "Last 30 days" would be
    // a file nobody could reconcile with the number above it.
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "6m" ? 182 : 365;
    // The real clock, not a mount-time one: an export has to cover the window
    // ending when the button was pressed, not when the screen was opened.
    // eslint-disable-next-line react-hooks/purity -- see above
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const query = new URLSearchParams({ from }).toString();
    const res = await fetch("/api/v1/admin/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        resource,
        query,
        fields,
        format: "csv",
        name: `${name} · ${RANGES.find((r) => r[0] === range)?.[1] ?? range}`,
      }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { rowCount: number }; error?: { message?: string } }
      | null;
    setBusy(null);
    toast(
      json?.ok
        ? `${name} generated · ${json.data?.rowCount ?? 0} rows · logged`
        : (json?.error?.message ?? "That export didn't run"),
    );
    if (json?.ok) onDone();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {FINANCE_EXPORTS.map((e) => (
          <Btn
            key={e.resource}
            label={busy === e.resource ? "Generating…" : `+ ${e.name}`}
            kind="primary"
            style={{ height: 36, fontSize: 13 }}
            onClick={() => generate(e.resource, e.name, e.fields)}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>
          No finance export has been generated yet.
        </div>
      ) : (
        rows.map((e) => (
          <div
            key={String(e.id)}
            style={{
              background: "var(--s1)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--ink3)" }}>
              <AdminIcon name="file" size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{String(e.name)}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                {String(e.status)} · {day(e.created_at)} · {String(e.row_count)} rows ·{" "}
                {String(e.requested_by_name)}
              </div>
            </div>
            {e.status === "ready" ? (
              <Btn
                label="Download"
                kind="outline"
                style={{ height: 34, fontSize: 13 }}
                onClick={() => window.open(`/api/v1/admin/export/${e.id}`, "_blank", "noopener")}
              />
            ) : (
              <Badge bg="var(--errorSoft)" fg="var(--error)" style={{ textTransform: "none", letterSpacing: 0 }}>
                {String(e.status)}
              </Badge>
            )}
          </div>
        ))
      )}
    </div>
  );
}
