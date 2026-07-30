import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A2's data (Doc5 A2 / Doc3 §1.2). Every number here is a real query — the
 * design draws "Listings 12 · oldest 26h" and CLAUDE.md rule 12 means the 12 and
 * the 26h are both counted, never typed in.
 *
 * The tile definitions live here rather than in the component because A3–A9 and
 * the sidebar badges must agree with them: one place decides what "pending"
 * means for each queue, so a tile can never disagree with the queue it links to.
 */

export type TileKey =
  | "listings"
  | "requirements"
  | "boosts"
  | "verifications"
  | "appeals"
  | "reports"
  | "tickets";

interface TileSpec {
  key: TileKey;
  label: string;
  /** The queue screen the tile deep-links to (Doc5 A2: "tap→queue"). */
  screen: string;
  table: string;
  /** The status(es) that mean "waiting for an admin". */
  statuses: string[];
  /** The column that says when it started waiting — drives the oldest-age line. */
  since: string;
  /**
   * Extra predicate so the tile counts EXACTLY what its queue's landing tab
   * shows. In the design A2's "Listings 12" and A3's "Pending 12" are the same
   * number, and "Updated after edit 2" is its own tab that the tile excludes —
   * without this, a tile reading 70 deep-linked to a queue showing 69.
   */
  notEdited?: boolean;
}

export const TILE_SPECS: readonly TileSpec[] = [
  { key: "listings", label: "Listings", screen: "/queues/listings", table: "listings", statuses: ["pending_review"], since: "submitted_at", notEdited: true },
  { key: "requirements", label: "Requirements", screen: "/queues/requirements", table: "requirements", statuses: ["pending_review"], since: "submitted_at", notEdited: true },
  { key: "boosts", label: "Boosts", screen: "/queues/boosts", table: "boosts", statuses: ["pending_approval"], since: "created_at" },
  { key: "verifications", label: "Verifications", screen: "/queues/verifications", table: "verifications", statuses: ["pending"], since: "submitted_at" },
  { key: "appeals", label: "Appeals", screen: "/queues/appeals", table: "moderation_appeals", statuses: ["open"], since: "created_at" },
  { key: "reports", label: "Reports", screen: "/queues/reports", table: "reports", statuses: ["open", "reviewing"], since: "created_at" },
  { key: "tickets", label: "Tickets", screen: "/support/tickets", table: "support_tickets", statuses: ["open", "replied"], since: "created_at" },
] as const;

export interface Tile {
  key: TileKey;
  label: string;
  screen: string;
  count: number;
  /** Hours the oldest waiting item has been waiting; null when the queue is clear. */
  oldestHours: number | null;
}

async function tile(spec: TileSpec): Promise<Tile> {
  const db = createServiceClient();
  const scope = <T extends { eq: (c: string, v: unknown) => T }>(q: T): T =>
    spec.notEdited ? q.eq("edited_since_approval", false) : q;

  const [{ count }, { data: oldest }] = await Promise.all([
    scope(db.from(spec.table).select("id", { count: "exact", head: true }).in("status", spec.statuses) as any),
    scope(
      db
        .from(spec.table)
        .select(spec.since)
        .in("status", spec.statuses)
        .order(spec.since, { ascending: true, nullsFirst: false })
        .limit(1) as any,
    ).maybeSingle(),
  ]);

  const stamp = oldest ? (oldest as Record<string, string | null>)[spec.since] : null;
  return {
    key: spec.key,
    label: spec.label,
    screen: spec.screen,
    count: count ?? 0,
    oldestHours: stamp ? Math.floor((Date.now() - new Date(stamp).getTime()) / 3_600_000) : null,
  };
}

export async function pendingTiles(): Promise<Tile[]> {
  return Promise.all(TILE_SPECS.map(tile));
}

// --------------------------------------------------------------- today's stats

export interface StatCard {
  key: "signups" | "revenue" | "listings" | "inquiries";
  label: string;
  /** Paise for revenue, a plain count otherwise — the client formats. */
  value: number;
  isMoney: boolean;
  /** Percent change vs the same weekday last week; null when there is no basis. */
  deltaPct: number | null;
  /** Last 7 days including today, oldest first — A2's tiny sparkline. */
  spark: number[];
}

const STAT_COLUMNS = {
  signups: "signups",
  revenue: "revenue_paise",
  listings: "listings_created",
  inquiries: "inquiries",
} as const;

/**
 * Doc5 A2 wants "prior-period %" — compared against the SAME WEEKDAY last week
 * ("▲ 12% vs last Thu"), not against yesterday. Property traffic is weekly-
 * seasonal, so Monday-vs-Sunday would report a spike that is just the calendar.
 */
export async function todayStats(): Promise<StatCard[]> {
  const db = createServiceClient();
  const today = new Date();
  const since = new Date(today.getTime() - 13 * 86_400_000).toISOString().slice(0, 10);

  const { data } = await db
    .from("platform_daily_stats")
    .select("day, signups, revenue_paise, listings_created, inquiries")
    .gte("day", since)
    .order("day", { ascending: true });

  const rows = (data ?? []) as Array<Record<string, number | string>>;
  const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
  const dayKey = (offset: number) =>
    new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);

  const read = (offset: number, col: string) => Number(byDay.get(dayKey(offset))?.[col] ?? 0);

  return (Object.keys(STAT_COLUMNS) as Array<keyof typeof STAT_COLUMNS>).map((key) => {
    const col = STAT_COLUMNS[key];
    const now = read(0, col);
    const lastWeek = read(7, col);
    const spark: number[] = [];
    for (let i = 6; i >= 0; i--) spark.push(read(i, col));
    return {
      key,
      label: key === "listings" ? "New listings" : key[0].toUpperCase() + key.slice(1),
      value: now,
      isMoney: key === "revenue",
      deltaPct: lastWeek > 0 ? Math.round(((now - lastWeek) / lastWeek) * 100) : null,
      spark,
    };
  });
}

// -------------------------------------------------------------------- anomalies

export interface Anomaly {
  id: string;
  kind: string;
  severity: string;
  message: string;
  linkScreen: string | null;
  /** The banner's own call-to-action words ("Open payments"), from the row. */
  linkLabel: string | null;
  detectedAt: string;
}

/** Row 3's dismissible banners. Dismissal is persisted, so it survives reload. */
export async function anomalies(): Promise<Anomaly[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("anomaly_events")
    .select("id, kind, severity, message, link_screen, link_label, detected_at")
    .is("dismissed_at", null)
    .order("detected_at", { ascending: false })
    .limit(5);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    kind: r.kind as string,
    severity: r.severity as string,
    message: r.message as string,
    linkScreen: (r.link_screen as string) ?? null,
    linkLabel: (r.link_label as string) ?? null,
    detectedAt: r.detected_at as string,
  }));
}

// ---------------------------------------------------------------- revenue chart

export type ChartRange = "7d" | "30d" | "6m";

export interface RevenuePoint {
  label: string;
  plans: number;
  boosts: number;
  topups: number;
}

export async function revenueSeries(range: ChartRange): Promise<RevenuePoint[]> {
  const db = createServiceClient();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 183;
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  const { data } = await db
    .from("platform_daily_stats")
    .select("day, plan_revenue_paise, boost_revenue_paise, topup_revenue_paise")
    .gte("day", since)
    .order("day", { ascending: true });

  const rows = (data ?? []).map((r: Record<string, unknown>) => ({
    day: String(r.day).slice(0, 10),
    plans: Number(r.plan_revenue_paise ?? 0),
    boosts: Number(r.boost_revenue_paise ?? 0),
    topups: Number(r.topup_revenue_paise ?? 0),
  }));

  // 6m is drawn as months — 183 daily bars would be unreadable at the card's width.
  if (range !== "6m") {
    return rows.map((r: { day: string; plans: number; boosts: number; topups: number }) => ({
      label: new Date(r.day + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
      plans: r.plans,
      boosts: r.boosts,
      topups: r.topups,
    }));
  }

  const byMonth = new Map<string, RevenuePoint>();
  for (const r of rows) {
    const key = r.day.slice(0, 7);
    const label = new Date(r.day + "T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
    const cur = byMonth.get(key) ?? { label, plans: 0, boosts: 0, topups: 0 };
    cur.plans += r.plans;
    cur.boosts += r.boosts;
    cur.topups += r.topups;
    byMonth.set(key, cur);
  }
  return [...byMonth.values()];
}

// ------------------------------------------------------------------ SLA overdue

export interface OverdueItem {
  id: string;
  kind: "listing" | "requirement";
  title: string;
  coverUrl: string | null;
  hours: number;
}

/** Doc3 §1.2: "SLA timers (queue items >24h = red)". */
export async function slaOverdue(limit = 6): Promise<OverdueItem[]> {
  const db = createServiceClient();
  const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const [listings, requirements] = await Promise.all([
    db
      .from("listings")
      .select("id, title, cover_url, submitted_at")
      .eq("status", "pending_review")
      .lt("submitted_at", cutoff)
      .order("submitted_at", { ascending: true })
      .limit(limit),
    db
      .from("requirements")
      .select("id, area_label, submitted_at")
      .eq("status", "pending_review")
      .lt("submitted_at", cutoff)
      .order("submitted_at", { ascending: true })
      .limit(limit),
  ]);

  const age = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 3_600_000);
  const out: OverdueItem[] = [
    ...(listings.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      kind: "listing" as const,
      title: (r.title as string) ?? "Untitled listing",
      coverUrl: (r.cover_url as string) ?? null,
      hours: age(r.submitted_at as string),
    })),
    ...(requirements.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      kind: "requirement" as const,
      title: (r.area_label as string) ?? "Requirement",
      coverUrl: null,
      hours: age(r.submitted_at as string),
    })),
  ];

  return out.sort((a, b) => b.hours - a.hours).slice(0, limit);
}

// --------------------------------------------------------------- system strips

export interface SystemStrips {
  cron: { healthy: number; total: number; failing: string[]; lastRunAt: string | null };
  backup: { lastSuccessAt: string | null; restoreDrillAt: string | null; sizeBytes: number | null };
  uptime: { pct: number | null; windowDays: number; components: number; degraded: number };
}

export async function systemStrips(): Promise<SystemStrips> {
  const db = createServiceClient();
  const [jobs, backup, health] = await Promise.all([
    db.from("cron_jobs").select("name, last_status, last_run_at, enabled").eq("enabled", true),
    db
      .from("backups")
      .select("finished_at, restore_drill_at, size_bytes")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("health_checks")
      .select("component, status, checked_at")
      .gte("checked_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);

  const jobRows = jobs.data ?? [];
  type Job = Record<string, unknown>;
  const failing = jobRows.filter((j: Job) => j.last_status === "failed").map((j: Job) => j.name as string);
  const lastRun = jobRows
    .map((j: Job) => j.last_run_at as string | null)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const checks = health.data ?? [];
  type Check = Record<string, unknown>;
  const degraded = checks.filter((c: Check) => c.status !== "healthy").length;
  const components = new Set(checks.map((c: Check) => c.component)).size;

  return {
    cron: {
      healthy: jobRows.length - failing.length,
      total: jobRows.length,
      failing,
      lastRunAt: lastRun,
    },
    backup: {
      lastSuccessAt: (backup.data?.finished_at as string) ?? null,
      restoreDrillAt: (backup.data?.restore_drill_at as string) ?? null,
      sizeBytes: (backup.data?.size_bytes as number) ?? null,
    },
    uptime: {
      pct: checks.length ? Math.round(((checks.length - degraded) / checks.length) * 10000) / 100 : null,
      windowDays: 30,
      components,
      degraded,
    },
  };
}
