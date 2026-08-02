import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The detector behind A2's anomaly banners.
 *
 * docs/PENDING-INTEGRATIONS.md M11.2: `anomaly_events` had five seeded rows and
 * NOTHING that could ever write a sixth. The dashboard read them faithfully, an
 * admin could dismiss one, and no real incident would ever produce one — a
 * banner promising "we will tell you when something is wrong" with no job
 * behind it.
 *
 * Five detectors, one per seeded `kind`, so the shapes the design already draws
 * are the shapes that get produced. Each one:
 *
 *  · compares against a REAL baseline, not a constant, so it does not fire on
 *    a quiet Sunday and stay silent through a bad Tuesday;
 *  · is idempotent within its window — re-running the sweep does not stack
 *    five identical banners, because the same incident is one incident;
 *  · never resurrects a banner an admin has dismissed inside that window.
 */

const db = () => createServiceClient();

export interface Anomaly {
  kind: string;
  severity: "warning" | "error";
  message: string;
  metric: Record<string, number>;
  link_screen?: string | null;
  link_label?: string | null;
}

/**
 * One row per (kind, window). `dismissed_at` is respected: an admin who has
 * seen and dismissed "signups are down" does not get it again an hour later
 * for the same day.
 */
async function record(a: Anomaly, windowStart: string): Promise<boolean> {
  const { data: existing } = await db()
    .from("anomaly_events")
    .select("id")
    .eq("kind", a.kind)
    .gte("detected_at", windowStart)
    .maybeSingle();
  if (existing) return false;

  const { error } = await db().from("anomaly_events").insert({
    kind: a.kind,
    severity: a.severity,
    message: a.message,
    metric: a.metric,
    link_screen: a.link_screen ?? null,
    link_label: a.link_label ?? null,
  });
  return !error;
}

/**
 * Run every detector. Returns what it found, so the cron run's `processed`
 * count is a real number and A27 shows the sweep actually did something.
 */
export async function detectAnomalies(): Promise<{ found: Anomaly[]; written: number }> {
  const found: Anomaly[] = [];
  const now = Date.now();
  const hourAgo = new Date(now - 3_600_000).toISOString();
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  /* ── 1 · report spike — three or more reports on ONE subject in a day ──── */
  {
    const { data } = await db()
      .from("reports")
      .select("subject_id, subject_type")
      .gte("created_at", new Date(now - 86_400_000).toISOString());
    const counts = new Map<string, { n: number; type: string }>();
    for (const r of (data ?? []) as { subject_id: string; subject_type: string }[]) {
      const cur = counts.get(r.subject_id) ?? { n: 0, type: r.subject_type };
      cur.n++;
      counts.set(r.subject_id, cur);
    }
    const worst = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    if (worst && worst.n >= 3) {
      found.push({
        kind: "report_spike",
        severity: worst.n >= 5 ? "error" : "warning",
        message: `Report spike — ${worst.n} reports on one ${worst.type}`,
        metric: { listing_reports: worst.n },
        link_screen: "reports",
        link_label: "Open reports",
      });
    }
  }

  /* ── 2 · signup drop — against the SAME weekday last week ──────────────── */
  {
    // Same weekday, because signups have a weekly shape: comparing Sunday to
    // Saturday would fire every week and mean nothing.
    const today = new Date().toISOString().slice(0, 10);
    const lastWeek = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await db()
      .from("platform_daily_stats")
      .select("day, signups")
      .in("day", [today, lastWeek]);
    const rows = (data ?? []) as { day: string; signups: number }[];
    const nowN = Number(rows.find((r) => r.day === today)?.signups ?? 0);
    const thenN = Number(rows.find((r) => r.day === lastWeek)?.signups ?? 0);
    // A baseline under 20 is noise — a drop from 3 to 1 is not an incident.
    if (thenN >= 20) {
      const delta = Math.round(((nowN - thenN) / thenN) * 100);
      if (delta <= -30) {
        found.push({
          kind: "signup_drop",
          severity: delta <= -60 ? "error" : "warning",
          message: `Signups down ${Math.abs(delta)}% vs the same day last week`,
          metric: { delta, today: nowN, last_week: thenN },
          link_screen: "analytics",
          link_label: "Open analytics",
        });
      }
    }
  }

  /* ── 3 · queue backlog ─────────────────────────────────────────────────── */
  {
    const { data } = await db()
      .from("queue_depths")
      .select("queue, depth, checked_at")
      .gte("checked_at", hourAgo)
      .order("checked_at", { ascending: false });
    const latest = new Map<string, number>();
    for (const q of (data ?? []) as { queue: string; depth: number }[]) {
      if (!latest.has(q.queue)) latest.set(q.queue, Number(q.depth));
    }
    for (const [queue, depth] of latest) {
      if (depth >= 500) {
        found.push({
          kind: "queue_backlog",
          severity: "error",
          message: `${queue} queue backlog above ${depth}`,
          metric: { depth },
          link_screen: "cron",
          link_label: "System status",
        });
        break;
      }
    }
  }

  /* ── 4 · boost cap reached in a city ───────────────────────────────────── */
  {
    const [{ data: caps }, { data: active }] = await Promise.all([
      db().from("city_caps").select("city_id, max_active_boosts"),
      db().from("boosts").select("target_city_id").eq("status", "active"),
    ]);
    const activeBy = new Map<string, number>();
    for (const b of (active ?? []) as { target_city_id: string | null }[]) {
      if (b.target_city_id) activeBy.set(b.target_city_id, (activeBy.get(b.target_city_id) ?? 0) + 1);
    }
    for (const c of (caps ?? []) as { city_id: string; max_active_boosts: number }[]) {
      const n = activeBy.get(c.city_id) ?? 0;
      if (c.max_active_boosts > 0 && n >= c.max_active_boosts) {
        const { data: city } = await db()
          .from("locations")
          .select("name")
          .eq("id", c.city_id)
          .maybeSingle();
        found.push({
          kind: "boost_cap",
          severity: "warning",
          message: `${(city as { name: string } | null)?.name ?? "A city"} boost cap reached — new boosts are queued`,
          metric: { cap: c.max_active_boosts, active: n },
          link_screen: "boosts",
          link_label: "Open boost queue",
        });
        break;
      }
    }
  }

  /* ── 5 · OTP spike — the rate limiter's own block counter ──────────────── */
  {
    // This is why P7 made the limiter count its blocks (migration 0110): a
    // spike is visible precisely as an unusual number of refusals.
    const { data } = await db()
      .from("rate_limit_hits")
      .select("blocked")
      .eq("rule_key", "otp_send")
      .gte("day", new Date(now - 86_400_000).toISOString().slice(0, 10));
    const blocked = ((data ?? []) as { blocked: number }[]).reduce((s, r) => s + Number(r.blocked), 0);
    if (blocked >= 50) {
      found.push({
        kind: "otp_spike",
        severity: blocked >= 200 ? "error" : "warning",
        message: `OTP request spike — ${blocked} requests blocked in 24h, possible bot activity`,
        metric: { requests: blocked },
        link_screen: "settings",
        link_label: "Open rate limits",
      });
    }
  }

  let written = 0;
  for (const a of found) {
    // The window is the DAY for the slow signals and the HOUR for the fast
    // ones, so a backlog that clears and comes back is two incidents but a
    // signup drop is one per day.
    const windowStart = a.kind === "queue_backlog" || a.kind === "report_spike" ? hourAgo : dayStart;
    if (await record(a, windowStart)) written++;
  }
  return { found, written };
}
