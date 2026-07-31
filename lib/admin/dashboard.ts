import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A2 Dashboard — every number the screen shows, computed here.
 *
 * The rule this file exists to keep: the dashboard renders what the server
 * returns and derives nothing. Deltas, ages, tones, uptime, "all 8 jobs
 * healthy" — all of it is decided against real rows, so a screenshot of this
 * screen is a statement about the database rather than about the component.
 *
 * The heavy aggregates are the three SQL functions in migration 0094; the rest
 * are small, indexed reads. Everything is service-role behind requireAdmin —
 * these cross every user's data and RLS is not the gate, the grant is.
 */

const IST = "Asia/Kolkata";

/* ─────────────────────────────────────────────────────────── row 1 · tiles ── */

/** template 495-503 — the seven queues, in the design's order. */
const TILES = [
  { key: "listings", icon: "list", label: "Listings", screen: "listings" },
  { key: "requirements", icon: "msg", label: "Requirements", screen: "requirements" },
  { key: "boosts", icon: "rocket", label: "Boosts", screen: "boosts" },
  { key: "verifications", icon: "badge", label: "Verifications", screen: "verifications" },
  { key: "appeals", icon: "gavel", label: "Appeals", screen: "appeals" },
  { key: "reports", icon: "shieldAlert", label: "Reports", screen: "reports" },
  { key: "tickets", icon: "buoy", label: "Tickets", screen: "tickets" },
] as const;

export type QueueTile = {
  icon: string;
  label: string;
  screen: string;
  count: number;
  /** "oldest 26h" — empty when the queue is empty, which is what the design omits */
  age: string;
  tone: "error" | "warning" | "ink3";
};

/**
 * The design colours an age red at 26h and 2d, amber at 12h, grey at 1h/3h/4h/8h
 * (template 496-502). That is one rule, not seven values: a day old is late,
 * half a day is getting there.
 */
function ageTone(hours: number): QueueTile["tone"] {
  if (hours >= 24) return "error";
  if (hours >= 12) return "warning";
  return "ink3";
}

/** "26h" up to two days, then "2d" — the design uses both forms. */
export function shortAge(from: Date, now = new Date()): string {
  const hours = Math.floor((now.getTime() - from.getTime()) / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export async function queueTiles(): Promise<{ tiles: QueueTile[]; counts: Record<string, number> }> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("hz_admin_queue_tiles");
  if (error) throw new Error(`queue tiles: ${error.message}`);

  const rows = (data ?? []) as { queue: string; pending: number; oldest: string | null }[];
  const byQueue = new Map(rows.map((r) => [r.queue, r]));
  const now = new Date();

  const tiles = TILES.map((t) => {
    const row = byQueue.get(t.key);
    const count = Number(row?.pending ?? 0);
    const oldest = row?.oldest ? new Date(row.oldest) : null;
    const hours = oldest ? (now.getTime() - oldest.getTime()) / 3_600_000 : 0;
    return {
      icon: t.icon,
      label: t.label,
      screen: t.screen,
      count,
      age: oldest && count > 0 ? `oldest ${shortAge(oldest, now)}` : "",
      tone: oldest && count > 0 ? ageTone(hours) : ("ink3" as const),
    };
  });

  // The sidebar's badges are the same counts — one query, so a badge can never
  // disagree with the tile it links to.
  const counts = Object.fromEntries(tiles.map((t) => [t.screen, t.count]));
  return { tiles, counts };
}

/* ─────────────────────────────────────────────────────────── row 2 · stats ── */

export type StatCard = {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  /** 7 bar heights in px, oldest first — the same metric as `value` */
  bars: number[];
};

const rupees = (paise: number) =>
  `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/**
 * The design's bars are 4-9 units tall at 3px each inside a 28px box
 * (template 539). Real data has no such range, so it is scaled into the same
 * box: the tallest bar in the window fills it, and a non-zero day is never
 * invisible.
 */
function bars(series: number[]): number[] {
  const max = Math.max(...series, 0);
  return series.map((v) => (max <= 0 ? 3 : Math.max(v > 0 ? 6 : 3, Math.round((v / max) * 27))));
}

/**
 * "▲ 12% vs last Thu" — today against the SAME WEEKDAY a week ago.
 *
 * When last week's figure is zero there is no percentage to state (everything
 * over zero is an infinite rise), so the same badge carries the absolute
 * change instead. It is the one place the design's exact string cannot be
 * produced from real data, and inventing a "100%" there would be a number the
 * database does not support.
 */
function delta(today: number, prior: number, weekday: string): { delta: string; up: boolean } {
  if (prior === 0) {
    if (today === 0) return { delta: `0% vs last ${weekday}`, up: true };
    return { delta: `▲ ${today.toLocaleString("en-IN")} vs last ${weekday}`, up: true };
  }
  const pct = Math.round(((today - prior) / prior) * 100);
  const up = pct >= 0;
  return { delta: `${up ? "▲" : "▼"} ${Math.abs(pct)}% vs last ${weekday}`, up };
}

type DailyRow = {
  day: string;
  signups: number;
  listings_created: number;
  inquiries: number;
  revenue_paise: number;
};

export async function statCards(): Promise<StatCard[]> {
  const db = createServiceClient();
  // 8 days: the 7 the sparkline draws, plus the same weekday last week to
  // compare against. One query, so the comparison and the bars agree.
  const { data, error } = await db.rpc("hz_admin_daily_metrics", { p_days: 8 });
  if (error) throw new Error(`daily metrics: ${error.message}`);

  const rows = ((data ?? []) as DailyRow[]).map((r) => ({
    ...r,
    signups: Number(r.signups),
    listings_created: Number(r.listings_created),
    inquiries: Number(r.inquiries),
    revenue_paise: Number(r.revenue_paise),
  }));
  const window7 = rows.slice(-7);
  const today = rows[rows.length - 1];
  const lastWeek = rows[0];
  const weekday = new Date().toLocaleDateString("en-IN", { weekday: "short", timeZone: IST });

  const card = (
    label: string,
    pick: (r: DailyRow) => number,
    format: (n: number) => string,
  ): StatCard => {
    const d = delta(pick(today), pick(lastWeek), weekday);
    return {
      label,
      value: format(pick(today)),
      ...d,
      bars: bars(window7.map(pick)),
    };
  };

  // template 505-508 — Signups · Revenue · New listings · Inquiries.
  return [
    card("Signups", (r) => r.signups, (n) => n.toLocaleString("en-IN")),
    card("Revenue", (r) => r.revenue_paise, rupees),
    card("New listings", (r) => r.listings_created, (n) => n.toLocaleString("en-IN")),
    card("Inquiries", (r) => r.inquiries, (n) => n.toLocaleString("en-IN")),
  ];
}

/* ──────────────────────────────────────────────────────── row 3 · banners ── */

export type AnomalyBanner = {
  id: string;
  severity: "error" | "warning";
  text: string;
  linkLabel: string;
  screen: string;
};

/** template 511-513 — each banner's link is worded for the screen it opens. */
const BANNER_LINKS: Record<string, string> = {
  payments: "Open payments",
  settings: "View rate limits",
  reports: "Open reports",
  listings: "Open listings",
  cron: "Open system status",
  users: "Open users",
};

export async function anomalyBanners(): Promise<AnomalyBanner[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("anomaly_events")
    .select("id, severity, message, link_screen")
    .is("dismissed_at", null)
    .order("detected_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`anomalies: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    severity: string;
    message: string;
    link_screen: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    severity: (r.severity === "error" ? "error" : "warning") as AnomalyBanner["severity"],
    text: r.message,
    screen: r.link_screen ?? "dashboard",
    linkLabel: BANNER_LINKS[r.link_screen ?? ""] ?? "Open",
  }));
}

/* ────────────────────────────────────────────────────────── row 4 · chart ── */

export type RevenueRange = "7d" | "30d" | "6m";

export type RevenueSeries = {
  range: RevenueRange;
  title: string;
  bars: { label: string; plan: number; boost: number; topup: number; total: number }[];
};

/**
 * The design's 7d/30d/6m chips. The range changes the BUCKET, not just the
 * window — 30 daily bars would not fit the design's chart at any of the three
 * device widths, and six months of days is not a shape anyone can read.
 * Seven days, five weeks, six months: the same chart, a real query each.
 */
const RANGES: Record<RevenueRange, { bucket: "day" | "week" | "month"; count: number; title: string }> =
  {
    "7d": { bucket: "day", count: 7, title: "Revenue · last 7 days" },
    "30d": { bucket: "week", count: 5, title: "Revenue · last 30 days" },
    "6m": { bucket: "month", count: 6, title: "Revenue · last 6 months" },
  };

export function isRevenueRange(value: string | null | undefined): value is RevenueRange {
  return value === "7d" || value === "30d" || value === "6m";
}

export async function revenueSeries(range: RevenueRange): Promise<RevenueSeries> {
  const spec = RANGES[range];
  const db = createServiceClient();
  const { data, error } = await db.rpc("hz_admin_revenue_series", {
    p_bucket: spec.bucket,
    p_buckets: spec.count,
  });
  if (error) throw new Error(`revenue series: ${error.message}`);

  const rows = (data ?? []) as {
    bucket_start: string;
    plan_paise: number;
    boost_paise: number;
    topup_paise: number;
  }[];

  const label = (iso: string) => {
    const d = new Date(`${iso}T00:00:00+05:30`);
    if (spec.bucket === "month") {
      return d.toLocaleDateString("en-IN", { month: "short", timeZone: IST });
    }
    if (spec.bucket === "week") {
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
    }
    return d.toLocaleDateString("en-IN", { weekday: "short", timeZone: IST });
  };

  return {
    range,
    title: spec.title,
    bars: rows.map((r) => {
      const plan = Number(r.plan_paise);
      const boost = Number(r.boost_paise);
      const topup = Number(r.topup_paise);
      return { label: label(r.bucket_start), plan, boost, topup, total: plan + boost + topup };
    }),
  };
}

/* ──────────────────────────────────────────────────────── row 4 · overdue ── */

export type OverdueItem = { id: string; title: string; age: string; photoUrl: string | null };

const SLA_HOURS = 24;

/**
 * "Overdue (>24h)" — listings that have been waiting for review longer than the
 * SLA. The badge is the TRUE count, the list is the three oldest, which is what
 * the design draws and what a person can act on from a dashboard.
 */
export async function overdueReviews(): Promise<{ total: number; items: OverdueItem[] }> {
  const db = createServiceClient();
  const cutoff = new Date(Date.now() - SLA_HOURS * 3_600_000).toISOString();

  const { count } = await db
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review")
    .is("deleted_at", null)
    .lt("created_at", cutoff);

  const { data, error } = await db
    .from("listings")
    .select("id, title, created_at, listing_photos(url, position)")
    .eq("status", "pending_review")
    .is("deleted_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(3);
  if (error) throw new Error(`overdue: ${error.message}`);

  const now = new Date();
  const rows = (data ?? []) as {
    id: string;
    title: string | null;
    created_at: string;
    listing_photos: { url: string; position: number }[] | null;
  }[];
  const items = rows.map((r) => {
    const photos = (r.listing_photos ?? []) as { url: string; position: number }[];
    const cover = [...photos].sort((a, b) => a.position - b.position)[0];
    return {
      id: r.id,
      title: r.title ?? "Untitled listing",
      age: `${shortAge(new Date(r.created_at), now)} in queue`,
      photoUrl: cover?.url ?? null,
    };
  });

  return { total: count ?? 0, items };
}

/* ──────────────────────────────────────────────────────── row 5 · strips ── */

export type SystemStrip = { icon: "check" | "alert"; tone: string; title: string; detail: string };

const timeIST = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST,
  });

const dateIST = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });

/**
 * Cron · Backups · Uptime (template 576-580). The design writes "All 8 jobs
 * healthy"; the 8 is a count, so it is counted, and a failing job turns the
 * strip red rather than quietly still saying healthy.
 */
export async function systemStrips(): Promise<SystemStrip[]> {
  const db = createServiceClient();

  const [{ data: jobs }, { data: backup }, { data: drill }, { data: checks }] = await Promise.all([
    db.from("cron_jobs").select("code, enabled, last_status, last_run_at").eq("enabled", true),
    db
      .from("backups")
      .select("status, finished_at, started_at")
      .eq("status", "success")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("backups")
      .select("restore_drill_at")
      .not("restore_drill_at", "is", null)
      .order("restore_drill_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("health_checks")
      .select("status, checked_at")
      .gte("checked_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);

  const enabled = (jobs ?? []) as {
    code: string;
    enabled: boolean;
    last_status: string | null;
    last_run_at: string | null;
  }[];
  const failing = enabled.filter((j) => j.last_status === "failed");
  const lastRun = enabled
    .map((j) => j.last_run_at)
    .filter(Boolean)
    .sort()
    .pop();

  const cron: SystemStrip = failing.length
    ? {
        icon: "alert",
        tone: "var(--error)",
        title: "Cron jobs",
        detail: `${failing.length} of ${enabled.length} jobs failing${lastRun ? ` · last run ${timeIST(lastRun)}` : ""}`,
      }
    : {
        icon: "check",
        tone: "var(--accent)",
        title: "Cron jobs",
        detail: `All ${enabled.length} jobs healthy${lastRun ? ` · last run ${timeIST(lastRun)}` : ""}`,
      };

  const backupDetail = backup
    ? `Last backup ${timeIST(backup.finished_at ?? backup.started_at)}${
        drill?.restore_drill_at ? ` · restore drill ${dateIST(drill.restore_drill_at)}` : ""
      }`
    : "No successful backup recorded";

  // Uptime over the retained health checks — the share that came back healthy.
  const checkRows = (checks ?? []) as { status: string; checked_at: string }[];
  const healthy = checkRows.filter((c) => c.status === "healthy").length;
  const pct = checkRows.length ? (healthy / checkRows.length) * 100 : null;

  return [
    cron,
    {
      icon: backup ? "check" : "alert",
      tone: backup ? "var(--accent)" : "var(--error)",
      title: "Backups",
      detail: backupDetail,
    },
    {
      icon: pct !== null && pct >= 99 ? "check" : "alert",
      tone: pct !== null && pct >= 99 ? "var(--accent)" : "var(--warning)",
      title: "Uptime",
      detail: pct === null ? "No health checks recorded" : `${pct.toFixed(2)}% · 30 days`,
    },
  ];
}

/* ──────────────────────────────────────────────────────────────── the head ── */

/** template 583 — "Today · 18 Jul 2026", which is today, not a fixed string. */
export function todayLabel(): string {
  return `Today · ${new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST,
  })}`;
}
