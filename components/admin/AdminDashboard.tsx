"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Anomaly, ChartRange, OverdueItem, RevenuePoint, StatCard, SystemStrips, Tile, TileKey } from "@/lib/admin/dashboard";

/**
 * A2's five rows, exactly as P13 lays them out:
 *   1 — 7 pending tiles (count 24/700 + label + oldest-age line, red past 24h)
 *   2 — 4 today-stat cards with a prior-period delta chip and a 7-bar sparkline
 *   3 — dismissible anomaly banners
 *   4 — revenue chart (7d/30d/6m + legend + tooltip) beside the SLA overdue list
 *   5 — cron / backups / uptime strips
 *
 * Every number arrives as a prop from a real query. The design's sample values
 * ("Listings 12 · oldest 26h") are the SHAPE — the count and the age are counted
 * (CLAUDE.md rule 12), which is why an age can read 5,692h on seeded data instead
 * of the tidy 26h the mock drew.
 */

const TILE_ICON: Record<TileKey, IconName> = {
  listings: "list",
  requirements: "search",
  boosts: "rocket",
  verifications: "verified",
  appeals: "flag",
  reports: "alert",
  tickets: "headset",
};

const money = (paise: number) =>
  `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/** P13: "under 12h = ink3 · 12–24h = warning · over 24h = error". */
function ageColor(hours: number | null): string {
  if (hours === null) return "var(--ink-tertiary)";
  if (hours > 24) return "var(--error)";
  if (hours >= 12) return "var(--warning)";
  return "var(--ink-tertiary)";
}

function ageLabel(hours: number | null): string {
  if (hours === null) return "queue is clear";
  if (hours < 48) return `oldest ${hours}h`;
  return `oldest ${Math.floor(hours / 24)}d`;
}

const BANNER_BG: Record<string, string> = {
  error: "var(--error-soft)",
  warning: "var(--warning-soft)",
  info: "var(--info-soft)",
};
const BANNER_FG: Record<string, string> = {
  error: "var(--error)",
  warning: "var(--warning)",
  info: "var(--info)",
};

interface Props {
  tiles: Tile[];
  stats: StatCard[];
  anomalies: Anomaly[];
  revenue: { range: ChartRange; points: RevenuePoint[] };
  overdue: OverdueItem[];
  system: SystemStrips;
}

export function AdminDashboard({ tiles, stats, anomalies, revenue, overdue, system }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [range, setRange] = useState<ChartRange>(revenue.range);
  const [points, setPoints] = useState<RevenuePoint[]>(revenue.points);
  const [banners, setBanners] = useState(anomalies);
  const [chartBusy, setChartBusy] = useState(false);

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const changeRange = async (next: ChartRange) => {
    setRange(next);
    setChartBusy(true);
    try {
      const r = await fetch(`/api/v1/admin/dashboard?range=${next}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setPoints(j.data.revenue.points);
    } finally {
      setChartBusy(false);
    }
  };

  /** Dismissal writes anomaly_events.dismissed_at — it must survive a reload. */
  const dismiss = async (id: string) => {
    setBanners((b) => b.filter((x) => x.id !== id));
    await fetch(`/api/v1/admin/anomalies/${id}/dismiss`, { method: "POST", cache: "no-store" });
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page title + date chip + refresh */}
      <div className="flex items-center gap-3">
        <h1 className="text-[24px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Dashboard
        </h1>
        <span
          className="rounded-full px-[10px] py-[3px] text-[11px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          Today · {today}
        </span>
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          className="ml-auto grid h-10 w-10 place-items-center rounded-8"
          style={{ color: "var(--ink-secondary)" }}
          aria-label="Refresh"
        >
          <span className={pending ? "animate-spin" : undefined}>
            <Icon name="refresh" size={20} />
          </span>
        </button>
      </div>

      {/* Row 1 — pending tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={t.screen}
            className="rounded-12 border p-4 transition-transform active:scale-[.99]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}
          >
            <span style={{ color: "var(--accent)" }}>
              <Icon name={TILE_ICON[t.key]} size={20} />
            </span>
            <p className="mt-2 text-[24px] font-bold leading-none" style={{ color: "var(--ink-primary)" }}>
              {t.count}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
              {t.label}
            </p>
            <p className="mt-[2px] text-[11px]" style={{ color: ageColor(t.oldestHours) }}>
              {ageLabel(t.oldestHours)}
            </p>
          </Link>
        ))}
      </div>

      {/* Row 2 — today stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s) => {
          const up = (s.deltaPct ?? 0) >= 0;
          const peak = Math.max(1, ...s.spark);
          return (
            <div
              key={s.key}
              className="rounded-12 border p-4"
              style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}
            >
              <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                {s.label}
              </p>
              <p className="mt-1 text-[24px] font-bold leading-none" style={{ color: "var(--ink-primary)" }}>
                {s.isMoney ? money(s.value) : s.value.toLocaleString("en-IN")}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {s.deltaPct === null ? (
                  <span className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    no prior week
                  </span>
                ) : (
                  <span
                    className="rounded-4 px-[5px] py-[2px] text-[11px] font-semibold"
                    style={{
                      background: up ? "var(--accent-soft)" : "var(--error-soft)",
                      color: up ? "var(--accent)" : "var(--error)",
                    }}
                  >
                    {up ? "▲" : "▼"} {Math.abs(s.deltaPct)}% vs last week
                  </span>
                )}
                <span className="ml-auto flex h-6 items-end gap-[2px]" aria-hidden>
                  {s.spark.map((v, i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-[2px]"
                      style={{ height: `${Math.max(2, (v / peak) * 24)}px`, background: i === s.spark.length - 1 ? "var(--accent)" : "var(--surface-3)" }}
                    />
                  ))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 3 — anomaly banners */}
      {banners.length > 0 && (
        <div className="flex flex-col gap-2">
          {banners.map((b) => (
            <div key={b.id} className="flex items-center gap-[10px] rounded-8 px-[14px] py-3" style={{ background: BANNER_BG[b.severity] ?? "var(--surface-2)" }}>
              <span style={{ color: BANNER_FG[b.severity] ?? "var(--ink-secondary)" }}>
                <Icon name="alert" size={20} />
              </span>
              <p className="min-w-0 flex-1 text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                {b.message}
              </p>
              {b.linkScreen && (
                <Link href={b.linkScreen} className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
                  Open
                </Link>
              )}
              <button type="button" onClick={() => dismiss(b.id)} aria-label="Dismiss" style={{ color: "var(--ink-tertiary)" }}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Row 4 — revenue chart + SLA overdue */}
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-12 border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              Revenue · {range === "7d" ? "last 7 days" : range === "30d" ? "last 30 days" : "last 6 months"}
            </h2>
            <div className="ml-auto flex gap-1">
              {(["7d", "30d", "6m"] as ChartRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => changeRange(r)}
                  className="rounded-full px-[10px] py-[3px] text-[11px] font-semibold"
                  style={{
                    background: r === range ? "var(--accent-soft)" : "var(--surface-2)",
                    color: r === range ? "var(--accent)" : "var(--ink-secondary)",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <RevenueChart points={points} busy={chartBusy} />

          <div className="mt-3 flex flex-wrap gap-3">
            {[
              ["Plans", "var(--accent)"],
              ["Boosts", "var(--info)"],
              ["Top-ups", "var(--warning)"],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-[6px] text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                <span className="h-[8px] w-[8px] rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-12 border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              Overdue (&gt;24h)
            </h2>
            {overdue.length > 0 && (
              <span className="rounded-4 px-[6px] py-[2px] text-[11px] font-semibold" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
                {overdue.length}
              </span>
            )}
          </div>
          {overdue.length === 0 ? (
            <p className="mt-3 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
              Nothing has been waiting more than a day.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {overdue.map((o) => (
                <li key={`${o.kind}-${o.id}`}>
                  <Link href={o.kind === "listing" ? `/queues/listings/${o.id}` : `/queues/requirements/${o.id}`} className="flex h-12 items-center gap-2">
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-4" style={{ background: "var(--surface-3)" }}>
                      {o.coverUrl ? <img src={o.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                        {o.title}
                      </span>
                      <span className="block text-[11px]" style={{ color: "var(--error)" }}>
                        {o.hours < 48 ? `${o.hours}h in queue` : `${Math.floor(o.hours / 24)}d in queue`}
                      </span>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Row 5 — system strips */}
      <div className="grid gap-3 md:grid-cols-3">
        <Strip
          ok={system.cron.failing.length === 0}
          title={
            system.cron.failing.length === 0
              ? `All ${system.cron.total} jobs healthy`
              : `${system.cron.failing.length} of ${system.cron.total} jobs failing`
          }
          detail={system.cron.failing.length ? system.cron.failing.join(", ") : `last run ${when(system.cron.lastRunAt)}`}
          href="/system/cron"
        />
        <Strip
          ok={Boolean(system.backup.lastSuccessAt)}
          title={system.backup.lastSuccessAt ? `Last backup ${when(system.backup.lastSuccessAt)}` : "No successful backup"}
          detail={
            system.backup.restoreDrillAt
              ? `restore drill ${new Date(system.backup.restoreDrillAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
              : "no restore drill on record"
          }
          href="/system/cron"
        />
        <Strip
          ok={(system.uptime.pct ?? 0) >= 99}
          title={system.uptime.pct === null ? "No health data" : `${system.uptime.pct}% uptime`}
          detail={`${system.uptime.windowDays} days · ${system.uptime.components} components`}
          href="/system/cron"
        />
      </div>
    </div>
  );
}

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Strip({ ok, title, detail, href }: { ok: boolean; title: string; detail: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-2 rounded-12 border p-4"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}
    >
      <span style={{ color: ok ? "var(--accent)" : "var(--error)" }}>
        <Icon name={ok ? "check" : "alert"} size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
          {title}
        </span>
        <span className="block text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
          {detail}
        </span>
      </span>
    </Link>
  );
}

/** Stacked bars, accent/info/warning per P13's legend, with a ₹ hover tooltip. */
function RevenueChart({ points, busy }: { points: RevenuePoint[]; busy: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = points.map((p) => p.plans + p.boosts + p.topups);
  const peak = Math.max(1, ...totals);

  return (
    <div className="relative mt-4">
      <div className="flex h-[160px] items-end gap-[6px]" style={{ opacity: busy ? 0.5 : 1, transition: "opacity .15s" }}>
        {points.map((p, i) => {
          const total = totals[i];
          const h = (v: number) => (v / peak) * 150;
          return (
            <div
              key={`${p.label}-${i}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-[2px]"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div
                  className="absolute z-10 -translate-y-2 rounded-8 border px-2 py-1 text-[11px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--ink-primary)", boxShadow: "0 4px 12px rgba(0,0,0,.10)" }}
                >
                  <strong>{money(total)}</strong> · plans {money(p.plans)} · boosts {money(p.boosts)} · top-ups {money(p.topups)}
                </div>
              )}
              <span className="w-full rounded-t-[2px]" style={{ height: h(p.topups), background: "var(--warning)" }} />
              <span className="w-full" style={{ height: h(p.boosts), background: "var(--info)" }} />
              <span className="w-full" style={{ height: h(p.plans), background: "var(--accent)" }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[6px]">
        {points.map((p, i) => (
          <span key={`${p.label}-l-${i}`} className="min-w-0 flex-1 truncate text-center text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
