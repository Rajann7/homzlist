"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Anomaly, ChartRange, OverdueItem, RevenuePoint, StatCard, SystemStrips, Tile, TileKey } from "@/lib/admin/dashboard";

/**
 * A2's five rows, measured off the design's `dashboardEl` rather than off what
 * looked reasonable:
 *   1 — 7 pending tiles (icon 20 accent · count 24/700 · label 13 · age 11)
 *   2 — 4 today-stat cards: value and sparkline share a row, delta chip below
 *   3 — dismissible anomaly banners, each with its own link label
 *   4 — revenue chart (stacked, 140 tall) beside the SLA overdue list, 1.6fr:1fr
 *   5 — cron / backups / uptime strips, padding 14, one row of three
 *
 * Grid columns follow the ADMIN breakpoints, not the user-side ones: mobile
 * <768 · tablet 768–1439 (`md:`) · desktop ≥1440 (`desktop:`). The design's
 * tileCols is 2/3/4 and its stat grid is 2 on mobile and 4 everywhere else.
 *
 * Every number arrives as a prop from a real query. The design's sample values
 * ("Listings 12 · oldest 26h") are the SHAPE — the count and the age are counted
 * (CLAUDE.md rule 12), which is why an age can read 237d on seeded data instead
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
function ageTone(hours: number | null): "ink3" | "warning" | "error" {
  if (hours === null) return "ink3";
  if (hours > 24) return "error";
  if (hours >= 12) return "warning";
  return "ink3";
}

const TONE_COLOR = {
  ink3: "var(--ink-tertiary)",
  warning: "var(--warning)",
  error: "var(--error)",
} as const;

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

/** The design's card: surface1 + hairline + r12 + L1. Dark drops the shadow. */
const CARD = "rounded-12 border shadow-l1 dark:shadow-none";
const CARD_STYLE = { background: "var(--surface-1)", borderColor: "var(--border)" };

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
    <div>
      {/* pageHead(hero): gap 12, flex-wrap, margin-bottom 20 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-bold" style={{ color: "var(--ink-primary)" }}>
          Dashboard
        </h1>
        <span
          className="rounded-full px-[10px] py-[6px] text-[13px]"
          style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
        >
          Today · {today}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          className="grid h-10 w-10 place-items-center rounded-8 border"
          style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--ink-secondary)" }}
          aria-label="Refresh"
        >
          <span className={pending ? "animate-spin" : undefined}>
            <Icon name="refresh" size={20} />
          </span>
        </button>
      </div>

      {/* Row 1 — pending tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 desktop:grid-cols-4">
        {tiles.map((t) => {
          const tone = ageTone(t.oldestHours);
          return (
            <Link
              key={t.key}
              href={t.screen}
              className={`${CARD} p-4 transition-transform active:scale-[.99]`}
              style={CARD_STYLE}
            >
              <span className="block" style={{ color: "var(--accent)" }}>
                <Icon name={TILE_ICON[t.key]} size={20} />
              </span>
              <p className="mt-2 text-[24px] font-bold leading-none" style={{ color: "var(--ink-primary)" }}>
                {t.count}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                {t.label}
              </p>
              <p
                className="mt-[6px] text-[11px]"
                style={{ color: TONE_COLOR[tone], fontWeight: tone === "ink3" ? 400 : 600 }}
              >
                {ageLabel(t.oldestHours)}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="h-6" />

      {/* Row 2 — today stats. Value and sparkline share one row; the delta chip
          sits under them, which is the design's order. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => {
          const up = (s.deltaPct ?? 0) >= 0;
          const peak = Math.max(1, ...s.spark);
          return (
            <div key={s.key} className={`${CARD} p-4`} style={CARD_STYLE}>
              <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                {s.label}
              </p>
              {/* flex-wrap is the only addition to the design's row: at 768 the
                  content column is 513px, and four cards of ~123px cannot hold a
                  24px "₹30,131" AND the 47px sparkline on one line — the number
                  was being cut off. Wrapping drops the sparkline under the value
                  instead of clipping the figure the card exists to show. Nothing
                  moves at any width where both already fit. */}
              <div className="mt-[6px] flex flex-wrap items-end justify-between gap-2">
                <p className="shrink-0 text-[24px] font-bold" style={{ color: "var(--ink-primary)" }}>
                  {s.isMoney ? money(s.value) : s.value.toLocaleString("en-IN")}
                </p>
                <span className="flex h-7 shrink-0 items-end gap-[2px]" aria-hidden>
                  {s.spark.map((v, i) => (
                    <span
                      key={i}
                      className="w-[5px] rounded-[2px]"
                      style={{
                        height: `${Math.max(2, (v / peak) * 28)}px`,
                        background: "var(--accent)",
                        opacity: 0.35 + i * 0.09,
                      }}
                    />
                  ))}
                </span>
              </div>
              <div className="mt-2">
                {s.deltaPct === null ? (
                  <span className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    no prior week
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center rounded-4 px-[7px] py-[3px] text-[11px] font-semibold"
                    style={{
                      background: up ? "var(--accent-soft)" : "var(--error-soft)",
                      color: up ? "var(--accent)" : "var(--error)",
                    }}
                  >
                    {up ? "▲" : "▼"} {Math.abs(s.deltaPct)}% vs last week
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-5" />

      {/* Row 3 — anomaly banners */}
      {banners.map((b) => (
        <div
          key={b.id}
          className="mb-2 flex items-center gap-[10px] rounded-8 px-[14px] py-3"
          style={{ background: BANNER_BG[b.severity] ?? "var(--surface-2)" }}
        >
          <span className="flex-none" style={{ color: BANNER_FG[b.severity] ?? "var(--ink-secondary)" }}>
            <Icon name="alert" size={20} />
          </span>
          <p className="min-w-0 flex-1 text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
            {b.message}
          </p>
          {b.linkScreen && b.linkLabel && (
            <Link href={b.linkScreen} className="shrink-0 whitespace-nowrap text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              {b.linkLabel}
            </Link>
          )}
          <button type="button" onClick={() => dismiss(b.id)} aria-label="Dismiss" className="flex flex-none" style={{ color: "var(--ink-tertiary)" }}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}

      <div className="h-2" />

      {/* Row 4 — revenue chart + SLA overdue */}
      {/* minmax(0,…) rather than a bare 1fr: a grid track's default minimum is
          min-content, so at 768 the overdue card's longest title pushed the row
          8px past `main` and put a horizontal scrollbar under the whole page.
          Same 1.6:1 ratio, same look — the track is just allowed to shrink. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className={`${CARD} p-4`} style={CARD_STYLE}>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="flex-1 text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              Revenue · {range === "7d" ? "last 7 days" : range === "30d" ? "last 30 days" : "last 6 months"}
            </h2>
            {(["7d", "30d", "6m"] as ChartRange[]).map((r) => (
              <Chip key={r} label={r} active={r === range} onClick={() => changeRange(r)} />
            ))}
          </div>

          <RevenueChart points={points} busy={chartBusy} />

          <div className="mt-[14px] flex flex-wrap gap-[14px]">
            {[
              ["Plans", "var(--accent)"],
              ["Boosts", "var(--info)"],
              ["Top-ups", "var(--warning)"],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-[6px] text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className={`${CARD} p-4`} style={CARD_STYLE}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
              Overdue (&gt;24h)
            </h2>
            {overdue.length > 0 && (
              <span
                className="inline-flex items-center rounded-4 px-[7px] py-[3px] text-[11px] font-semibold tracking-[0.3px]"
                style={{ background: "var(--error-soft)", color: "var(--error)" }}
              >
                {overdue.length}
              </span>
            )}
          </div>
          {overdue.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
              Nothing has been waiting more than a day.
            </p>
          ) : (
            <ul>
              {overdue.map((o, i) => (
                <li key={`${o.kind}-${o.id}`} style={{ borderTop: i ? "1px solid var(--divider)" : "none" }}>
                  <Link
                    href={o.kind === "listing" ? `/queues/listings/${o.id}` : `/queues/requirements/${o.id}`}
                    className="flex items-center gap-[10px] py-2"
                  >
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-8 border" style={{ borderColor: "var(--border)", background: "var(--surface-3)" }}>
                      {o.coverUrl ? <img src={o.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                        {o.title}
                      </span>
                      <span className="block text-[11px] font-semibold" style={{ color: "var(--error)" }}>
                        {o.hours < 48 ? `${o.hours}h in queue` : `${Math.floor(o.hours / 24)}d in queue`}
                      </span>
                    </span>
                    <span style={{ color: "var(--ink-tertiary)" }}>
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="h-4" />

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

/** The design's `chip()` — h32, r999, accent border + accentSoft when active. */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px]"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "var(--accent-soft)" : "var(--surface-1)",
        color: active ? "var(--accent)" : "var(--ink-secondary)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function Strip({ ok, title, detail, href }: { ok: boolean; title: string; detail: string; href: string }) {
  return (
    <Link href={href} className={`${CARD} flex items-center gap-[10px] p-[14px]`} style={CARD_STYLE}>
      <span className="flex-none" style={{ color: ok ? "var(--accent)" : "var(--error)" }}>
        <Icon name={ok ? "check" : "alert"} size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
          {title}
        </span>
        <span className="mt-[2px] block text-[12px]" style={{ color: "var(--ink-secondary)" }}>
          {detail}
        </span>
      </span>
    </Link>
  );
}

/**
 * Stacked bars — plans on top, boosts, top-ups at the bottom, matching the
 * design's stack order and its legend. The ₹ breakdown rides on the column's
 * `title`, which is the tooltip the design itself uses.
 */
function RevenueChart({ points, busy }: { points: RevenuePoint[]; busy: boolean }) {
  const totals = points.map((p) => p.plans + p.boosts + p.topups);
  const peak = Math.max(1, ...totals);
  const h = (v: number) => (v / peak) * 110;

  return (
    <div
      className="flex h-[140px] items-end gap-2 px-1 md:gap-4"
      style={{ opacity: busy ? 0.5 : 1, transition: "opacity .15s" }}
    >
      {points.map((p, i) => (
        <div key={`${p.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-[6px]">
          <div
            title={`${money(totals[i])} · plans ${money(p.plans)} · boosts ${money(p.boosts)} · top-ups ${money(p.topups)}`}
            className="flex w-full max-w-[34px] cursor-pointer flex-col justify-end"
            style={{ height: 110 }}
          >
            <span style={{ height: h(p.plans), background: "var(--accent)", borderRadius: "3px 3px 0 0" }} />
            <span style={{ height: h(p.boosts), background: "var(--info)" }} />
            <span style={{ height: h(p.topups), background: "var(--warning)", borderRadius: "0 0 3px 3px" }} />
          </div>
          <span className="w-full truncate text-center text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}
