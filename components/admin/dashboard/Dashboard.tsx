"use client";

/**
 * A2 — Dashboard. Template 491-595, reproduced row for row:
 *
 *   1  seven queue tiles      2 cols mobile · 3 tablet · 4 desktop
 *   2  four stat cards        2 cols mobile · 4 otherwise
 *   3  anomaly banners        conditional, dismissible
 *   4  revenue chart + overdue list   1 col mobile · 1.6fr/1fr otherwise
 *   5  cron / backup / uptime strips  1 col mobile · 3 otherwise
 *
 * The device column counts are the design's own `mobile`/`tablet` branches
 * (template 515-516). The prototype reads them off its viewport STATE; here
 * they are CSS breakpoints, which is the same three bands (390 / 768 / 1440)
 * arrived at the way a real browser does it.
 *
 * Nothing on this screen computes a business value. Counts, ages, deltas,
 * tones, uptime and the chart all arrive computed from lib/admin/dashboard.ts.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AdminIcon,
  Badge,
  Card,
  Chip,
  PageHead,
  Thumb,
  useToast,
  SCREEN_ROUTES,
  type AdminIconName,
} from "@/components/admin/ds";
import type {
  AnomalyBanner,
  OverdueItem,
  QueueTile,
  RevenueSeries,
  StatCard,
  SystemStrip,
} from "@/lib/admin/dashboard";

export type DashboardProps = {
  today: string;
  tiles: QueueTile[];
  stats: StatCard[];
  banners: AnomalyBanner[];
  revenue: RevenueSeries;
  overdue: { total: number; items: OverdueItem[] };
  strips: SystemStrip[];
};

const GRID = {
  /* template 516 — tileCols = mobile 2 · tablet 3 · desktop 4 */
  tiles: "grid grid-cols-2 gap-3 md:grid-cols-3 desktop:grid-cols-4",
  /* template 586 — stats are 2 on mobile, 4 everywhere else */
  stats: "grid grid-cols-2 gap-3 md:grid-cols-4",
  /* template 590 */
  charts: "grid grid-cols-1 gap-4 md:grid-cols-[1.6fr_1fr]",
  /* template 592 */
  strips: "grid grid-cols-1 gap-3 md:grid-cols-3",
};

export function Dashboard({
  today,
  tiles,
  stats,
  banners,
  revenue,
  overdue,
  strips,
}: DashboardProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [series, setSeries] = useState(revenue);
  const [chartBusy, setChartBusy] = useState(false);
  // Dismissal is persisted server-side; this only hides the row for the moment
  // between the click and the refresh, so the banner does not sit there looking
  // ignored while the request is in flight.
  const [dismissing, setDismissing] = useState<string[]>([]);

  function refresh() {
    startTransition(() => {
      router.refresh();
      toast("Dashboard refreshed");
    });
  }

  async function pickRange(range: RevenueSeries["range"]) {
    if (range === series.range || chartBusy) return;
    setChartBusy(true);
    const res = await fetch(`/api/v1/admin/dashboard/revenue?range=${range}`, {
      cache: "no-store",
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as
      | { ok: boolean; data?: RevenueSeries }
      | null;
    setChartBusy(false);
    if (!body?.ok || !body.data) {
      toast("Could not load that range");
      return;
    }
    setSeries(body.data);
  }

  async function dismiss(id: string) {
    setDismissing((d) => [...d, id]);
    const res = await fetch(`/api/v1/admin/anomalies/${id}/dismiss`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { ok?: boolean } | null;
    if (!body?.ok) {
      setDismissing((d) => d.filter((x) => x !== id));
      toast("Could not dismiss that alert");
      return;
    }
    startTransition(() => router.refresh());
  }

  const go = (screen: string) => {
    const href = SCREEN_ROUTES[screen];
    if (href) router.push(href);
  };

  const maxTotal = Math.max(...series.bars.map((b) => b.total), 1);

  return (
    <div>
      <PageHead
        hero
        title="Dashboard"
        sub={
          <Badge
            bg="var(--s2)"
            fg="var(--ink2)"
            style={{
              textTransform: "none",
              letterSpacing: 0,
              fontWeight: 400,
              fontSize: 13,
              padding: "6px 10px",
              borderRadius: 999,
            }}
          >
            {today}
          </Badge>
        }
        right={
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh dashboard"
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--s1)",
              color: "var(--ink2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: pending ? 0.6 : 1,
            }}
          >
            <AdminIcon name="refresh" size={20} />
          </button>
        }
      />

      {/* ── row 1 · queue tiles (template 529-533) ───────────────────────── */}
      <div className={GRID.tiles}>
        {tiles.map((t) => (
          <div
            key={t.label}
            onClick={() => go(t.screen)}
            style={{
              background: "var(--s1)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--L1)",
              padding: 16,
              cursor: "pointer",
              transition: "transform .1s",
            }}
          >
            <div style={{ color: "var(--accent)", marginBottom: 8 }}>
              <AdminIcon name={t.icon as AdminIconName} size={20} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink1)", lineHeight: 1 }}>
              {t.count}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 4 }}>{t.label}</div>
            <div
              style={{
                fontSize: 11,
                color: `var(--${t.tone})`,
                marginTop: 6,
                fontWeight: t.tone === "ink3" ? 400 : 600,
                minHeight: 14,
              }}
            >
              {t.age}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 24 }} />

      {/* ── row 2 · today's stats (template 535-540) ─────────────────────── */}
      <div className={GRID.stats}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--s1)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--L1)",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>{s.label}</div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 8,
                marginTop: 6,
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink1)" }}>{s.value}</div>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 28 }}>
                {s.bars.map((h, j) => (
                  <div
                    key={j}
                    style={{
                      width: 5,
                      height: h,
                      borderRadius: 2,
                      background: "var(--accent)",
                      opacity: 0.35 + j * 0.09,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <Badge
                bg={s.up ? "var(--accentSoft)" : "var(--errorSoft)"}
                fg={s.up ? "var(--accent)" : "var(--error)"}
                style={{ textTransform: "none", letterSpacing: 0 }}
              >
                {s.delta}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 20 }} />

      {/* ── row 3 · anomaly banners (template 542-546) ───────────────────── */}
      {banners
        .filter((b) => !dismissing.includes(b.id))
        .map((b) => (
          <div
            key={b.id}
            style={{
              background: b.severity === "error" ? "var(--errorSoft)" : "var(--warningSoft)",
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                color: b.severity === "error" ? "var(--error)" : "var(--warning)",
                flex: "none",
                display: "flex",
              }}
            >
              <AdminIcon name="alert" size={20} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)", flex: 1 }}>
              {b.text}
            </span>
            <span
              onClick={() => go(b.screen)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {b.linkLabel}
            </span>
            <span
              onClick={() => dismiss(b.id)}
              role="button"
              aria-label="Dismiss"
              style={{ color: "var(--ink3)", cursor: "pointer", flex: "none", display: "flex" }}
            >
              <AdminIcon name="x" size={16} />
            </span>
          </div>
        ))}

      <div style={{ height: 8 }} />

      {/* ── row 4 · revenue chart + overdue (template 551-574) ───────────── */}
      <div className={GRID.charts}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink1)", flex: 1 }}>
              {series.title}
            </div>
            {(["7d", "30d", "6m"] as const).map((r) => (
              <Chip key={r} label={r} active={series.range === r} onClick={() => pickRange(r)} />
            ))}
          </div>

          <div
            className="flex h-[140px] items-end gap-2 px-1 md:gap-4"
            style={{ opacity: chartBusy ? 0.5 : 1 }}
          >
            {series.bars.map((b, i) => {
              // 110px is the design's plot height; every segment is drawn to
              // scale against the tallest bucket in the range.
              const px = (value: number) => Math.round((value / maxTotal) * 110);
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    title={`₹${Math.round(b.total / 100).toLocaleString("en-IN")}`}
                    style={{
                      width: "100%",
                      maxWidth: 34,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      height: 110,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        height: px(b.plan),
                        background: "var(--accent)",
                        borderRadius: "3px 3px 0 0",
                      }}
                    />
                    <div style={{ height: px(b.boost), background: "var(--info)" }} />
                    <div
                      style={{
                        height: px(b.topup),
                        background: "var(--warning)",
                        borderRadius: "0 0 3px 3px",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink3)" }}>{b.label}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
            {[
              ["Plans", "var(--accent)"],
              ["Boosts", "var(--info)"],
              ["Top-ups", "var(--warning)"],
            ].map(([label, color]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--ink2)",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                {label}
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink1)", flex: 1 }}>
              Overdue (&gt;24h)
            </div>
            <Badge bg="var(--errorSoft)" fg="var(--error)">
              {overdue.total}
            </Badge>
          </div>
          {overdue.items.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink3)", padding: "8px 0" }}>
              Nothing has been waiting more than 24 hours.
            </div>
          ) : (
            overdue.items.map((o, i) => (
              <div
                key={o.id}
                onClick={() => router.push(`${SCREEN_ROUTES.listings}/${o.id}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: i ? "1px solid var(--divider)" : "none",
                  cursor: "pointer",
                }}
              >
                <Thumb size={36} src={o.photoUrl} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--error)", fontWeight: 600 }}>
                    {o.age}
                  </div>
                </div>
                <span style={{ color: "var(--ink3)" }}>
                  <AdminIcon name="chevR" size={16} />
                </span>
              </div>
            ))
          )}
        </Card>
      </div>

      <div style={{ height: 16 }} />

      {/* ── row 5 · system strips (template 592-594) ─────────────────────── */}
      <div className={GRID.strips}>
        {strips.map((st) => (
          <div
            key={st.title}
            onClick={() => go("cron")}
            style={{
              background: "var(--s1)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--L1)",
              padding: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
            }}
          >
            <span style={{ color: st.tone, flex: "none", display: "flex" }}>
              <AdminIcon name={st.icon} size={20} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)" }}>
                {st.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 2 }}>{st.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
