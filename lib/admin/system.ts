import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "./audit";
import type { AdminIdentity } from "./guard";

/**
 * A27 — System status · A28 — Analytics · A29 — Trash. Template 2602-2718.
 *
 * A27 is the screen an admin opens when something is wrong, so the one thing it
 * must never do is report health it has not measured. Every card here is a
 * query or a live probe; where a signal genuinely has no source on this
 * environment the screen says so instead of drawing a green dot.
 */

const db = () => createServiceClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export interface ActionResult {
  ok: boolean;
  label?: string;
  summary?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/* ══════════════════════════════════════════════ A27 · system status ══════ */

export async function systemStatus() {
  const [{ data: health }, { data: queues }, { data: backups }, { data: crons }] = await Promise.all([
    db()
      .from("health_checks")
      .select("component, status, detail, latency_ms, checked_at")
      .order("checked_at", { ascending: false })
      .limit(40),
    db()
      .from("queue_depths")
      .select("queue, depth, workers, oldest_age_seconds, checked_at")
      .order("checked_at", { ascending: false })
      .limit(40),
    db()
      .from("backups")
      .select("id, kind, status, size_bytes, started_at, finished_at, restore_drill_at, note")
      .order("started_at", { ascending: false })
      .limit(10),
    db().from("admin_cron_list").select("*").order("code"),
  ]);

  // The tables hold a HISTORY; the screen wants the latest per component and
  // per queue. Taking the first row per key here rather than in SQL keeps the
  // query one round-trip and the ordering explicit.
  const latest = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => {
    const seen = new Map<unknown, T>();
    for (const r of rows) if (!seen.has(r[key])) seen.set(r[key], r);
    return [...seen.values()];
  };

  const components = latest((health ?? []) as Record<string, unknown>[], "component");
  const queueRows = latest((queues ?? []) as Record<string, unknown>[], "queue");
  const cronRows = (crons ?? []) as Record<string, unknown>[];

  // A "healthy" reading from three days ago is not a healthy system, it is a
  // monitor that stopped. Anything older than 10 minutes reads as stale.
  const STALE_MS = 10 * 60_000;
  const withFreshness = components.map((c) => ({
    ...c,
    stale: Date.now() - new Date(String(c.checked_at)).getTime() > STALE_MS,
  }));

  return {
    components: withFreshness,
    queues: queueRows,
    crons: cronRows,
    backups: backups ?? [],
    failing_crons: cronRows.filter((c) => c.last_status === "failed").length,
    // The design's uptime strip is 24 hourly buckets over the API component.
    uptime: uptimeBuckets((health ?? []) as { component: string; status: string; checked_at: string }[]),
  };
}

function uptimeBuckets(rows: { component: string; status: string; checked_at: string }[]) {
  const api = rows.filter((r) => r.component === "api");
  const now = Date.now();
  return [...Array(24)].map((_, i) => {
    const from = now - (24 - i) * 3_600_000;
    const to = from + 3_600_000;
    const inBucket = api.filter((r) => {
      const t = new Date(r.checked_at).getTime();
      return t >= from && t < to;
    });
    if (!inBucket.length) return "unknown";
    return inBucket.some((r) => r.status !== "healthy") ? "degraded" : "healthy";
  });
}

export async function runCronJob(code: string, me: AdminIdentity): Promise<ActionResult> {
  const { data } = await db()
    .from("cron_jobs")
    .select("code, name, enabled, last_status")
    .eq("code", code)
    .maybeSingle();
  const job = data as { code: string; name: string; enabled: boolean } | null;
  if (!job) return { ok: false, message: "Not found" };
  if (!job.enabled) return { ok: false, message: `${job.name} is disabled — enable it first` };

  // Two runs of the same job at once is how a nightly expiry sweep double-bills
  // somebody. A run already in flight is refused rather than queued behind it.
  const { data: running } = await db()
    .from("cron_runs")
    .select("id")
    .eq("job_code", code)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (running) return { ok: false, message: `${job.name} is already running` };

  const { error } = await db().from("cron_runs").insert({
    job_code: code,
    status: "queued",
    triggered_by: me.id,
    started_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: "cron_run",
    entityType: "cron_job",
    entityLabel: job.name,
    summary: `${job.name} triggered by hand`,
    sensitive: true,
  });
  return { ok: true, label: job.name, summary: `${job.name} queued` };
}

export async function toggleCronJob(
  code: string,
  enabled: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db().from("cron_jobs").select("code, name").eq("code", code).maybeSingle();
  const job = data as { name: string } | null;
  if (!job) return { ok: false, message: "Not found" };

  await db().from("cron_jobs").update({ enabled }).eq("code", code);
  await writeAudit(me, {
    action: "cron_toggle",
    entityType: "cron_job",
    entityLabel: job.name,
    summary: `${job.name} ${enabled ? "enabled" : "DISABLED"}`,
    diff: { enabled },
    sensitive: true,
  });
  return { ok: true, label: job.name, summary: `${job.name} ${enabled ? "enabled" : "disabled"}` };
}

export async function cronRuns(code: string) {
  const { data } = await db()
    .from("cron_runs")
    .select("id, started_at, finished_at, status, duration_ms, processed, error, triggered_by")
    .eq("job_code", code)
    .order("started_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

/* ══════════════════════════════════════════════════ A28 · analytics ══════ */

/** The design's five stages (template 2646) and the event that produces each. */
const FUNNEL_STAGES: [key: string, label: string, event: string][] = [
  ["signups", "Signups", "signup_completed"],
  ["plan_bought", "Plan purchased", "plan_purchased"],
  ["listing_posted", "Listing submitted", "listing_created"],
  ["listing_approved", "Listing approved", "listing_approved"],
  ["lead_received", "Lead received", "inquiry_sent"],
];

/**
 * The design's segment chips (template 2645): All · Owner · Broker · Builder,
 * then CITIES. The roles are fixed; the cities are whatever is launched, so a
 * new city gets a chip by being launched rather than by someone editing this.
 */
async function funnelSegments(): Promise<{ list: string[]; topCity: string | null }> {
  // The design draws SIX chips: the three roles, then ONE city and an "Other
  // cities" bucket — not one chip per launched city, which would wrap to three
  // rows the moment a fifth city launches.
  //
  // The city it names is the busiest one, resolved from real activity, so the
  // chip follows the market rather than an alphabetical accident.
  const { data } = await db()
    .from("city_daily_stats")
    .select("city_id, signups")
    .gte("day", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const by = new Map<string, number>();
  for (const r of (data ?? []) as { city_id: string; signups: number }[]) {
    by.set(r.city_id, (by.get(r.city_id) ?? 0) + Number(r.signups ?? 0));
  }
  const topId = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  let topCity: string | null = null;
  if (topId) {
    const { data: c } = await db().from("locations").select("name").eq("id", topId).maybeSingle();
    topCity = (c as { name: string } | null)?.name ?? null;
  }
  const list = ["All", "Owner", "Broker", "Builder"];
  if (topCity) list.push(topCity, "Other cities");
  return { list, topCity };
}

/**
 * A28's funnel — from `analytics_events`, not `funnel_daily`.
 *
 * `funnel_daily` is a pre-aggregated four-column roll-up with no role or city
 * on it, and the design draws FIVE stages and six segment chips. Reading it
 * would mean a funnel permanently missing "Listing approved" and segment chips
 * that could not narrow anything — a control that renders and controls nothing,
 * which §3 forbids.
 *
 * The events table carries all five stages AND `profile_id` / `city_id`, so one
 * source answers both. It is a bigger scan; the range keeps it bounded, and the
 * alternative is a screen that cannot answer the question it asks.
 */
export async function analyticsFunnel(days: number, segment: string | null) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const seg = segment && segment !== "All" ? segment : null;

  const { list: segments, topCity } = await funnelSegments();

  // A role or city segment needs the profiles that hold it. Resolved once, up
  // front, rather than joining per stage.
  let allowed: Set<string> | null = null;
  if (seg) {
    const role = seg.toLowerCase();
    if (["owner", "broker", "builder"].includes(role)) {
      const { data } = await db().from("profiles").select("id").eq("role", role);
      allowed = new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
    } else if (seg === "Other cities" && topCity) {
      // Everyone who is NOT in the named city — including users with no city
      // set, who are otherwise invisible on this screen entirely.
      const { data: city } = await db()
        .from("locations")
        .select("id")
        .eq("level", "city")
        .ilike("name", topCity)
        .maybeSingle();
      const { data } = await db().from("profiles").select("id, city_id");
      const topId = (city as { id: string } | null)?.id;
      allowed = new Set(
        ((data ?? []) as { id: string; city_id: string | null }[])
          .filter((p) => p.city_id !== topId)
          .map((p) => p.id),
      );
    } else {
      const { data: city } = await db()
        .from("locations")
        .select("id")
        .eq("level", "city")
        .ilike("name", seg)
        .maybeSingle();
      if (city) {
        const { data } = await db()
          .from("profiles")
          .select("id")
          .eq("city_id", (city as { id: string }).id);
        allowed = new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
      } else {
        allowed = new Set();
      }
    }
  }

  const { data: events } = await db()
    .from("analytics_events")
    .select("name, profile_id")
    .in("name", FUNNEL_STAGES.map((s) => s[2]))
    .gte("created_at", since)
    .limit(100_000);

  const counts = new Map<string, number>();
  for (const e of (events ?? []) as { name: string; profile_id: string | null }[]) {
    if (allowed && (!e.profile_id || !allowed.has(e.profile_id))) continue;
    counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  }

  const stages = FUNNEL_STAGES.map(([key, label, event]) => ({
    key,
    label,
    n: counts.get(event) ?? 0,
  }));

  // Visitors stays on `funnel_daily`: an anonymous visit produces no
  // `analytics_events` row with a profile, so the events table cannot answer it.
  const { data: daily } = await db()
    .from("funnel_daily")
    .select("visitors")
    .gte("day", since.slice(0, 10));
  const visitors = ((daily ?? []) as { visitors: number }[]).reduce(
    (s, r) => s + Number(r.visitors ?? 0),
    0,
  );

  // Each stage's percentage is of the stage BEFORE it, which is what makes a
  // funnel readable — a percentage of the top would say 33% and 30% for two
  // stages that lose almost nobody between them.
  return {
    segment: segment ?? "All",
    segments,
    days,
    // A segmented funnel cannot claim the whole site's visitor count.
    visitors: seg ? null : visitors,
    stages: stages.map((s, i) => ({
      ...s,
      pct: i === 0 ? 100 : stages[i - 1].n ? Math.round((s.n / stages[i - 1].n) * 100) : null,
      lost: i === 0 ? 0 : stages[i - 1].n - s.n,
    })),
  };
}

export async function analyticsEvents() {
  const { data } = await db()
    .from("admin_event_summary")
    .select("*")
    .order("count_30d", { ascending: false });
  return ((data ?? []) as Record<string, number | string>[]).map((row) => {
    const now = Number(row.count_30d ?? 0);
    const prev = Number(row.count_prev_30d ?? 0);
    return {
      ...row,
      // Undefined rather than 100% when there is nothing to compare against —
      // the same rule A16's revenue delta follows.
      trend_pct: prev > 0 ? Math.round(((now - prev) / prev) * 100) : null,
    };
  });
}

export async function analyticsContent() {
  const [{ count: live }, { count: reqs }, { count: projects }, { data: areas }] = await Promise.all([
    db().from("listings").select("id", { count: "exact", head: true }).eq("status", "live").is("deleted_at", null),
    db().from("requirements").select("id", { count: "exact", head: true }).eq("status", "live"),
    db().from("projects").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db()
      .from("listings")
      .select("area_id, area_label")
      .eq("status", "live")
      .is("deleted_at", null)
      .not("area_id", "is", null)
      .limit(5000),
  ]);

  const byArea = new Map<string, { name: string; n: number }>();
  for (const l of (areas ?? []) as { area_id: string; area_label: string | null }[]) {
    const cur = byArea.get(l.area_id) ?? { name: l.area_label ?? "—", n: 0 };
    cur.n++;
    byArea.set(l.area_id, cur);
  }

  // The design shows "24h story impressions". `story_aggregates` is where that
  // lives; if the table is empty the number is null and the card says so,
  // rather than printing 0 as though nobody looked.
  const { data: stories } = await db()
    .from("story_aggregates")
    .select("impressions")
    .gte("day", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
  const impressions = (stories ?? []).length
    ? ((stories ?? []) as { impressions: number }[]).reduce((s, r) => s + Number(r.impressions ?? 0), 0)
    : null;

  return {
    live_listings: live ?? 0,
    requirements: reqs ?? 0,
    projects: projects ?? 0,
    story_impressions_24h: impressions,
    top_areas: [...byArea.entries()]
      .map(([id, v]) => ({ id, name: v.name, listings: v.n }))
      .sort((a, b) => b.listings - a.listings)
      .slice(0, 10),
  };
}

export async function analyticsCities() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: stats }, { data: cities }, { data: interest }] = await Promise.all([
    db().from("city_daily_stats").select("city_id, signups, listings, inquiries, revenue_paise").gte("day", since),
    db().from("locations").select("id, name").eq("level", "city").eq("is_launched", true),
    db().from("city_interest_requests").select("city_id, city_name, created_at"),
  ]);

  const byCity = new Map<string, { signups: number; listings: number; inquiries: number; revenue: number }>();
  for (const s of (stats ?? []) as Record<string, string | number>[]) {
    const id = String(s.city_id);
    const cur = byCity.get(id) ?? { signups: 0, listings: 0, inquiries: 0, revenue: 0 };
    cur.signups += Number(s.signups ?? 0);
    cur.listings += Number(s.listings ?? 0);
    cur.inquiries += Number(s.inquiries ?? 0);
    cur.revenue += Number(s.revenue_paise ?? 0);
    byCity.set(id, cur);
  }
  const nameOf = new Map(((cities ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  // "Expansion signals" — cities people asked for that are not launched, with a
  // real count of how many asked and when the first one did.
  const signals = new Map<string, { name: string; n: number; first: string }>();
  for (const r of (interest ?? []) as { city_id: string | null; city_name: string; created_at: string }[]) {
    if (r.city_id && nameOf.has(r.city_id)) continue; // already launched
    const key = r.city_name.toLowerCase();
    const cur = signals.get(key) ?? { name: r.city_name, n: 0, first: r.created_at };
    cur.n++;
    if (r.created_at < cur.first) cur.first = r.created_at;
    signals.set(key, cur);
  }

  return {
    cities: [...byCity.entries()]
      .map(([id, v]) => ({ id, name: nameOf.get(id) ?? "—", ...v }))
      .filter((c) => c.name !== "—")
      .sort((a, b) => b.revenue - a.revenue),
    expansion: [...signals.values()].sort((a, b) => b.n - a.n).slice(0, 10),
  };
}

export async function analyticsDefinitions() {
  const { data } = await db().from("metric_definitions").select("key, label, definition").order("key");
  return data ?? [];
}

/* ══════════════════════════════════════════════════════ A29 · trash ══════ */

/**
 * Restore. The trash row is the RECORD of a deletion; undoing it means undoing
 * the deletion on the real table, which is why this switches on entity type
 * rather than just clearing a flag here.
 */
export async function restoreTrashItem(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("trash_items").select("*").eq("id", id).maybeSingle();
  const item = data as
    | { id: string; entity_type: string; entity_id: string; label: string; restored_at: string | null }
    | null;
  if (!item) return { ok: false, message: "Not found" };
  if (item.restored_at) return { ok: false, message: "That item has already been restored" };

  const TABLE_FOR: Record<string, string> = {
    listing: "listings",
    project: "projects",
    requirement: "requirements",
    user: "profiles",
    photo: "listing_photos",
    coupon: "coupons",
  };
  const table = TABLE_FOR[item.entity_type];
  if (!table)
    return {
      ok: false,
      // A chat has no soft-delete column to clear — saying so beats a success
      // toast over an item that stays gone.
      message: `A ${item.entity_type} cannot be restored from here`,
    };

  const { error } = await db().from(table).update({ deleted_at: null }).eq("id", item.entity_id);
  if (error) return { ok: false, message: `Could not restore it: ${error.message}` };

  // Read the error. The first version did not, and `purge_at` was NOT NULL —
  // so this update was refused, the trash row never moved, and the endpoint
  // reported success (migration 0111).
  const { error: markErr } = await db()
    .from("trash_items")
    .update({ restored_at: new Date().toISOString(), restored_by: me.id, purge_at: null })
    .eq("id", id);
  if (markErr) return { ok: false, message: `Restored, but the trash row did not clear: ${markErr.message}` };

  await writeAudit(me, {
    action: "trash_restore",
    entityType: item.entity_type,
    entityId: item.entity_id,
    entityLabel: item.label,
    summary: `Restored from trash — ${item.label}`,
    sensitive: true,
  });
  return { ok: true, label: item.label, summary: `${item.label} restored` };
}

/**
 * Purge. Super-only in the design (template 2712), and irreversible, so it
 * takes a typed confirmation the same way A11's delete does.
 */
export async function purgeTrashItem(
  id: string,
  confirm: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  if (confirm !== "PURGE") return { ok: false, message: 'Type PURGE to confirm' };

  const { data } = await db().from("trash_items").select("*").eq("id", id).maybeSingle();
  const item = data as
    | { id: string; entity_type: string; entity_id: string; label: string; purge_at: string | null }
    | null;
  if (!item) return { ok: false, message: "Not found" };

  // A held item is one a dispute is preserving evidence for (A24). Purging it
  // would destroy the evidence our safe harbour depends on.
  if (item.purge_at === null) {
    const { data: held } = await db()
      .from("disputes")
      .select("number")
      .or(`listing_id.eq.${item.entity_id},thread_id.eq.${item.entity_id}`)
      .eq("evidence_preserved", true)
      .maybeSingle();
    if (held)
      return {
        ok: false,
        message: `Held as evidence for dispute ${(held as { number: string }).number} — it cannot be purged`,
      };
  }

  const TABLE_FOR: Record<string, string> = {
    listing: "listings",
    project: "projects",
    requirement: "requirements",
    photo: "listing_photos",
    coupon: "coupons",
  };
  const table = TABLE_FOR[item.entity_type];
  if (table) await db().from(table).delete().eq("id", item.entity_id);
  await db().from("trash_items").delete().eq("id", id);

  await writeAudit(me, {
    action: "trash_purge",
    entityType: item.entity_type,
    entityId: item.entity_id,
    entityLabel: item.label,
    summary: `PURGED permanently — ${item.label}`,
    sensitive: true,
  });
  return { ok: true, label: item.label, summary: `${item.label} purged permanently` };
}
