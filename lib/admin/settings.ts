import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { invalidateRateRules } from "@/lib/auth/rate-limit";
import { invalidateFlags } from "@/lib/system/flags";
import { invalidateDurations } from "@/lib/system/config";
import { writeAudit } from "./audit";
import type { AdminIdentity } from "./guard";

/**
 * A22 — Settings & flags. Template 2323-2426.
 *
 * Seven tabs, and this is the most dangerous screen in the panel: a flag turns
 * a feature off for everyone, a rate limit governs the front door, maintenance
 * mode takes the site down, and the retention schedule decides what is deleted
 * forever. Three rules follow from that:
 *
 *  · EVERYTHING IS SUPER-ONLY. `SCREEN_MIN_ROLE.settings = 'super'` in the
 *    design (template 248), and the endpoint enforces it — the screen's own
 *    lock gate is the UI half, never the whole of it.
 *  · A LEGAL MINIMUM CANNOT BE LOWERED. `retention_settings.is_locked` is not
 *    a disabled input; the save path refuses, so a crafted POST cannot set the
 *    audit retention to a day.
 *  · MAINTENANCE MODE CANNOT LOCK ADMINS OUT. Staff bypass is not optional,
 *    and the endpoint that turns it on is on the admin host, which is exempt.
 */

const db = () => createServiceClient();

export interface ActionResult {
  ok: boolean;
  label?: string;
  summary?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/* ═══════════════════════════════════════════════ tab 1 · feature flags ════ */

export async function toggleFlag(
  key: string,
  enabled: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db()
    .from("feature_flags")
    .select("key, label, enabled, scope")
    .eq("key", key)
    .maybeSingle();
  const flag = data as { key: string; label: string; enabled: boolean; scope: string } | null;
  if (!flag) return { ok: false, message: "Not found" };

  const { error } = await db()
    .from("feature_flags")
    .update({ enabled, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) return { ok: false, message: error.message };
  invalidateFlags();

  // The design's own toast, and it is not an exaggeration: the public site
  // reads these on every render.
  await writeAudit(me, {
    action: "flag_change",
    entityType: "feature_flag",
    entityLabel: flag.label,
    summary: `${flag.label} turned ${enabled ? "on" : "off"}`,
    diff: { before: flag.enabled, after: enabled },
    sensitive: true,
  });
  return { ok: true, label: flag.label, summary: `${flag.label} turned ${enabled ? "on" : "off"} · logged` };
}

export async function setFlagScope(
  key: string,
  scope: string,
  scopeValue: string | null,
  me: AdminIdentity,
): Promise<ActionResult> {
  const ALLOWED = ["all", "role", "city", "percent", "staff"];
  if (!ALLOWED.includes(scope)) return { ok: false, message: "That is not a scope" };
  if (scope === "percent") {
    const pct = Number(scopeValue);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      return { ok: false, message: "A rollout percentage has to be between 0 and 100" };
  }

  const { data } = await db()
    .from("feature_flags")
    .select("key, label, scope, scope_value")
    .eq("key", key)
    .maybeSingle();
  if (!data) return { ok: false, message: "Not found" };

  await db()
    .from("feature_flags")
    .update({ scope, scope_value: scopeValue, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq("key", key);
  invalidateFlags();

  await writeAudit(me, {
    action: "flag_change",
    entityType: "feature_flag",
    entityLabel: (data as { label: string }).label,
    summary: `Scope → ${scope}${scopeValue ? ` (${scopeValue})` : ""}`,
    diff: { before: data, after: { scope, scope_value: scopeValue } },
    sensitive: true,
  });
  return { ok: true, label: (data as { label: string }).label, summary: "Scope updated · logged" };
}

/* ═══════════════════════════════════════════════════ tab 2 · branding ════ */

export async function brandingSettings() {
  const { data } = await db().from("branding_settings").select("key, value");
  return Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
}

export async function saveBranding(
  values: Record<string, unknown>,
  reason: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  const ALLOWED = ["app_name", "tagline", "primary_color", "logo_url", "logo_dark_url", "icon_url", "og_image_url"];
  const patch = Object.entries(values).filter(([k, v]) => ALLOWED.includes(k) && typeof v === "string");
  if (!patch.length) return { ok: false, message: "Nothing to save" };

  const colour = patch.find(([k]) => k === "primary_color")?.[1] as string | undefined;
  // A malformed colour does not fail loudly — it silently makes every accent on
  // the site fall back to the browser default.
  if (colour !== undefined && !/^#[0-9a-fA-F]{6}$/.test(colour))
    return { ok: false, message: "The primary colour must be a 6-digit hex like #0F9D58" };

  const { data: before } = await db().from("branding_settings").select("key, value");
  for (const [key, value] of patch) {
    await db()
      .from("branding_settings")
      .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
  }

  await writeAudit(me, {
    action: "branding_change",
    entityType: "settings",
    entityLabel: "Branding",
    summary: reason ? `Branding updated — ${reason}` : "Branding updated",
    diff: { before, after: Object.fromEntries(patch), reason },
    sensitive: true,
  });
  return { ok: true, label: "Branding", summary: "Branding saved · logged" };
}

/* ═════════════════════════════════════════════ tab 3 · boost & pricing ═══ */

export async function saveBoostRate(
  code: string,
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  // Boost prices live in plan_catalog (kind='boost': boost7/boost30) — the rows
  // the buyer and checkout actually use. (Was `boost_rates`, which nothing read.)
  const { data } = await db()
    .from("plan_catalog")
    .select("code, name, price_paise, is_active")
    .eq("code", code)
    .eq("kind", "boost")
    .maybeSingle();
  const rate = data as { code: string; name: string; price_paise: number; is_active: boolean } | null;
  if (!rate) return { ok: false, message: "Not found" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.price_paise === "number") {
    if (body.price_paise < 0) return { ok: false, message: "A price cannot be negative" };
    patch.price_paise = Math.trunc(body.price_paise);
  }
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  await db().from("plan_catalog").update(patch).eq("code", code).eq("kind", "boost");
  await writeAudit(me, {
    action: "pricing_change",
    entityType: "boost_rate",
    entityLabel: rate.name,
    // The design's note says price changes apply to new purchases only. That is
    // true because a purchase copies its price onto the order at checkout, so
    // this update cannot reach a boost someone already bought.
    summary: `${rate.name} updated — applies to new purchases only`,
    diff: { before: rate, after: patch },
    sensitive: true,
  });
  return { ok: true, label: rate.name, summary: `${rate.name} updated` };
}

export async function saveCityCap(
  cityId: string,
  cap: number,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!Number.isFinite(cap) || cap < 0) return { ok: false, message: "A cap cannot be negative" };
  const { data: city } = await db().from("locations").select("id, name").eq("id", cityId).maybeSingle();
  if (!city) return { ok: false, message: "Not found" };

  // Lowering a cap below what is CURRENTLY live does not un-boost anyone — the
  // boosts already paid for keep running and the cap applies to the next
  // approval. Saying so is the difference between a setting and a surprise.
  const { count: active } = await db()
    .from("boosts")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("target_city_id", cityId);

  await db()
    .from("city_caps")
    .upsert(
      { city_id: cityId, max_active_boosts: Math.trunc(cap), updated_at: new Date().toISOString() },
      { onConflict: "city_id" },
    );

  await writeAudit(me, {
    action: "pricing_change",
    entityType: "city_cap",
    entityId: cityId,
    entityLabel: (city as { name: string }).name,
    summary: `Boost cap for ${(city as { name: string }).name} set to ${cap} (${active ?? 0} live now)`,
    diff: { cap, active_now: active ?? 0 },
    sensitive: true,
  });
  return {
    ok: true,
    label: (city as { name: string }).name,
    summary:
      (active ?? 0) > cap
        ? `Cap set to ${cap} · ${active} already live keep running until they expire`
        : `Cap set to ${cap}`,
  };
}

/* ═══════════════════════════════════════════ tab 4 · limits & velocity ═══ */

export async function saveRateLimit(
  key: string,
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db().from("rate_limits").select("*").eq("key", key).maybeSingle();
  const rule = data as
    | { key: string; label: string; max_requests: number; window_seconds: number; is_active: boolean }
    | null;
  if (!rule) return { ok: false, message: "Not found" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.max_requests === "number") {
    // Zero would block every request to that endpoint for everyone, which no
    // admin means and which no UI would explain afterwards.
    if (body.max_requests < 1) return { ok: false, message: "A limit of 0 would block everyone" };
    patch.max_requests = Math.trunc(body.max_requests);
  }
  if (typeof body.window_seconds === "number") {
    if (body.window_seconds < 1) return { ok: false, message: "The window must be at least a second" };
    patch.window_seconds = Math.trunc(body.window_seconds);
  }
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  const { error } = await db().from("rate_limits").update(patch).eq("key", key);
  if (error) return { ok: false, message: error.message };

  // Without this the edit does nothing for up to a minute, which reads exactly
  // like the bug this part exists to fix.
  invalidateRateRules();
  await writeAudit(me, {
    action: "limit_change",
    entityType: "rate_limit",
    entityLabel: rule.label,
    summary: `${rule.label} → ${patch.max_requests ?? rule.max_requests} per ${
      (Number(patch.window_seconds ?? rule.window_seconds) / 60) | 0
    } min`,
    diff: { before: rule, after: patch },
    sensitive: true,
  });
  return { ok: true, label: rule.label, summary: `${rule.label} updated · logged` };
}

export async function saveVelocityRule(
  key: string,
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db().from("velocity_rules").select("*").eq("key", key).maybeSingle();
  const rule = data as { key: string; label: string; threshold: number; action: string } | null;
  if (!rule) return { ok: false, message: "Not found" };

  const patch: Record<string, unknown> = {};
  if (typeof body.threshold === "number") {
    if (body.threshold < 1) return { ok: false, message: "A threshold of 0 would catch everyone" };
    patch.threshold = Math.trunc(body.threshold);
  }
  if (typeof body.action === "string" && ["flag", "throttle", "block"].includes(body.action))
    patch.action = body.action;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  await db().from("velocity_rules").update(patch).eq("key", key);
  await writeAudit(me, {
    action: "limit_change",
    entityType: "velocity_rule",
    entityLabel: rule.label,
    summary: `${rule.label} updated`,
    diff: { before: rule, after: patch },
    sensitive: true,
  });
  return { ok: true, label: rule.label, summary: `${rule.label} updated · logged` };
}

/* ═══════════════════════════════════════════════════ tab 5 · retention ═══ */

export async function saveRetention(
  key: string,
  days: number,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db().from("retention_settings").select("*").eq("key", key).maybeSingle();
  const row = data as
    | { key: string; label: string; days: number; is_locked: boolean; note: string | null }
    | null;
  if (!row) return { ok: false, message: "Not found" };

  // The design draws a padlock on these. A padlock is a picture; this is the
  // control. Audit logs and payment records have statutory minimums, and a
  // crafted POST must not be able to set them to a day.
  if (row.is_locked)
    return {
      ok: false,
      message: row.note ? `${row.label} is locked — ${row.note}` : `${row.label} is a legal minimum`,
    };
  if (!Number.isFinite(days) || days < 1) return { ok: false, message: "Keep for at least one day" };

  await db()
    .from("retention_settings")
    .update({ days: Math.trunc(days), updated_at: new Date().toISOString() })
    .eq("key", key);

  await writeAudit(me, {
    action: "retention_change",
    entityType: "retention",
    entityLabel: row.label,
    summary: `${row.label} retention ${row.days} → ${days} days`,
    diff: { before: row.days, after: days },
    sensitive: true,
  });
  return { ok: true, label: row.label, summary: `${row.label} retention updated · logged` };
}

/* ═══════════════════════════════════════ tab · sessions & content (durations) */

/** "7 days" / "30 minutes" / "12 hours" — the largest whole unit that fits. */
function durationWords(seconds: number): string {
  const plural = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  if (seconds % 86_400 === 0) return plural(seconds / 86_400, "day");
  if (seconds % 3_600 === 0) return plural(seconds / 3_600, "hour");
  if (seconds % 60 === 0) return plural(seconds / 60, "minute");
  return plural(seconds, "second");
}

export async function durationsList() {
  const { data } = await db()
    .from("system_durations")
    .select("key, label, seconds, min_seconds, max_seconds, note, updated_at")
    .order("label");
  return data ?? [];
}

export async function saveDuration(
  key: string,
  seconds: number,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db()
    .from("system_durations")
    .select("key, label, seconds, min_seconds, max_seconds")
    .eq("key", key)
    .maybeSingle();
  const row = data as
    | { key: string; label: string; seconds: number; min_seconds: number; max_seconds: number }
    | null;
  if (!row) return { ok: false, message: "Not found" };

  if (!Number.isFinite(seconds)) return { ok: false, message: "Enter a valid duration" };
  const s = Math.trunc(seconds);
  // The band is the control, not the padlock the UI draws — a crafted POST can
  // set neither a one-second session nor an unbounded one.
  if (s < row.min_seconds)
    return { ok: false, message: `${row.label} can't be shorter than ${durationWords(row.min_seconds)}` };
  if (s > row.max_seconds)
    return { ok: false, message: `${row.label} can't be longer than ${durationWords(row.max_seconds)}` };

  await db()
    .from("system_durations")
    .update({ seconds: s, updated_at: new Date().toISOString() })
    .eq("key", key);
  // Without this the edit does nothing for up to 30s (the config cache), which
  // reads exactly like the setting not working.
  invalidateDurations();

  await writeAudit(me, {
    action: "limit_change",
    entityType: "settings",
    entityLabel: row.label,
    summary: `${row.label} set to ${durationWords(s)} (was ${durationWords(row.seconds)})`,
    diff: { before: row.seconds, after: s },
    sensitive: true,
  });
  return { ok: true, label: row.label, summary: `${row.label} → ${durationWords(s)} · logged` };
}

/* ═════════════════════════════════════════════════ tab 6 · maintenance ═══ */

export async function maintenanceState() {
  const { data } = await db()
    .from("maintenance_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? { enabled: false, message: null, eta: null, bypass_roles: [] };
}

export async function setMaintenance(
  on: boolean,
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, 300)
      : "HomzList is under maintenance. We'll be right back.";
  // `maintenance_settings.eta` is a TIMESTAMP, not the phrase the design shows.
  // The screen asks "expected duration" because that is what an operator knows
  // ("about 30 minutes"), so the minutes are converted to the moment we expect
  // to be back — which is also what lets the user-facing page count down
  // instead of saying "30 minutes" forever.
  const minutes = Number(body.eta_minutes);
  const eta =
    Number.isFinite(minutes) && minutes > 0
      ? new Date(Date.now() + Math.min(24 * 60, minutes) * 60_000).toISOString()
      : null;

  const { data: existing } = await db()
    .from("maintenance_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Staff bypass is NOT a setting an admin can clear. Turning maintenance on
  // without it locks the panel's own operators out of the panel that turns it
  // off — recoverable only from the database.
  const payload = {
    enabled: on,
    message,
    eta,
    bypass_roles: ["super", "admin", "staff"],
    updated_by: me.id,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db().from("maintenance_settings").update(payload).eq("id", (existing as { id: string }).id)
    : await db().from("maintenance_settings").insert(payload);
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: "maintenance_change",
    entityType: "settings",
    entityLabel: "Maintenance mode",
    summary: on
      ? `Maintenance mode ON${eta ? ` · expected back ${new Date(eta).toLocaleTimeString("en-IN")}` : ""}`
      : "Maintenance mode off",
    diff: { enabled: on, message, eta },
    sensitive: true,
  });
  return {
    ok: true,
    label: "Maintenance mode",
    summary: on ? "Maintenance mode on · users see the maintenance page" : "Maintenance mode off",
  };
}

/* ═══════════════════════════════════════════════ tab 7 · system actions ══ */

/**
 * The design lists six one-click operations (template 2418). Each one is real
 * or it is not offered:
 *
 * `resend` and `clear_blocks` genuinely run here. The three that rebuild
 * external artefacts (CDN purge, sitemaps, search index) are queued as CRON
 * RUNS rather than executed inline, because they are minutes-long jobs and an
 * HTTP request that waits for one times out — A27 is where their result shows
 * up, which is also where an admin would look for it.
 */
export async function runSystemAction(action: string, me: AdminIdentity): Promise<ActionResult> {
  const QUEUEABLE: Record<string, string> = {
    // Only `sitemap` has a registered worker today. The other three are the
    // design's buttons over jobs nobody has written; the lookup below reports
    // that honestly instead of showing a success toast over nothing, and
    // docs/PENDING-INTEGRATIONS.md tracks them.
    purge_cdn: "cdn_purge",
    sitemaps: "sitemap",
    reindex: "search_reindex",
    area_stats: "area_stats_recalc",
  };

  if (action === "resend_notifications") {
    // Real work: the failed sends are re-queued by clearing their failure so
    // the notification worker picks them up on its next pass.
    const { data, error } = await db()
      .from("notification_deliveries")
      .update({ status: "pending", reason: null })
      .eq("status", "failed")
      .select("id");
    if (error) return { ok: false, message: error.message };
    const n = (data ?? []).length;
    await writeAudit(me, {
      action: "system_action",
      entityType: "system",
      entityLabel: "Resend failed notifications",
      summary: `${n} failed notification(s) re-queued`,
      sensitive: true,
    });
    return { ok: true, label: "Resend", summary: `${n} notification(s) re-queued` };
  }

  if (action === "clear_rate_blocks") {
    // The blocks live in Redis, so this clears the counters rather than a table.
    const { kv } = await import("@/lib/kv");
    let cleared = 0;
    try {
      const keys = await kv.scanKeys("rl:*");
      for (const k of keys) {
        await kv.del(k);
        cleared++;
      }
    } catch (e) {
      return { ok: false, message: `Could not reach the cache: ${(e as Error).message}` };
    }
    await writeAudit(me, {
      action: "system_action",
      entityType: "system",
      entityLabel: "Clear rate-limit blocks",
      summary: `${cleared} rate-limit counter(s) cleared`,
      sensitive: true,
    });
    return { ok: true, label: "Clear blocks", summary: `${cleared} counter(s) cleared` };
  }

  const jobCode = QUEUEABLE[action];
  if (!jobCode) return { ok: false, message: "That is not a system action" };

  const { data: job } = await db().from("cron_jobs").select("code, name").eq("code", jobCode).maybeSingle();
  if (!job)
    return {
      ok: false,
      // Honest rather than a success toast over nothing.
      message: `No job named "${jobCode}" is registered — it cannot be triggered yet`,
    };

  const { error } = await db().from("cron_runs").insert({
    job_code: jobCode,
    status: "queued",
    triggered_by: me.id,
    started_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: "system_action",
    entityType: "system",
    entityLabel: (job as { name: string }).name,
    summary: `${(job as { name: string }).name} queued by hand`,
    sensitive: true,
  });
  return {
    ok: true,
    label: (job as { name: string }).name,
    summary: `${(job as { name: string }).name} queued — watch it on System status`,
  };
}
