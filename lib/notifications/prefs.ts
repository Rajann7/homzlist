import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Notification preferences — the state behind designs/P10 S7 (Doc4 §63) and the
 * gate the delivery engine checks (Doc2 §14).
 *
 * Shape follows the design, not the other way round: 18 named toggles grouped
 * into sections, one of them locked ("Payment updates · Can't be turned off"),
 * one default-off ("Status changes on saved"), a SEPARATE marketing consent,
 * and a quiet-hours window. All of it is config + rows, so the screen renders
 * whatever the DB says and adding a toggle is a migration.
 *
 * Two hard rules:
 *  1. Marketing is an explicit, opt-IN, separately-recorded consent (DPDP).
 *     It is never implied by a transactional toggle and never defaults on.
 *  2. A LOCKED group cannot be turned off through any path, including a
 *     hand-crafted PATCH. The server drops the write; it does not trust that
 *     the UI disabled the switch.
 */

const db = () => createServiceClient();

export interface PrefGroup {
  code: string;
  section: string;
  label: string;
  sublabel: string | null;
  enabled: boolean;
  locked: boolean;
}

export interface Prefs {
  groups: PrefGroup[];
  /** group code → effective boolean, for fast lookups in the engine. */
  enabled: Record<string, boolean>;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  /** Legacy single toggle on the My Plan screen (Module 3) — still real. */
  expiryReminders: boolean;
}

export interface GlobalSettings {
  retentionDays: number;
  quietStart: string;
  quietEnd: string;
  timezone: string;
  batchWindowMinutes: number;
}

const PREF_COLS =
  "expiry_reminders,push_enabled,email_enabled,whatsapp_enabled," +
  "marketing_consent,marketing_consent_at,quiet_hours,quiet_start,quiet_end";

const hhmm = (t: string | null | undefined, fallback: string) => (t ? String(t).slice(0, 5) : fallback);

export async function getPrefs(profileId: string): Promise<Prefs> {
  const [row, groups, values, settings] = await Promise.all([
    prefRow(profileId),
    db().from("notification_pref_groups").select("code,section,label,sublabel,default_on,is_locked,sort_order").eq("is_active", true).order("sort_order"),
    db().from("notification_pref_values").select("group_code,enabled").eq("profile_id", profileId),
    globalSettings(),
  ]);

  const chosen = new Map<string, boolean>();
  for (const v of ((values.data ?? []) as any[])) chosen.set(v.group_code, v.enabled);

  const list: PrefGroup[] = ((groups.data ?? []) as any[]).map((g) => ({
    code: g.code,
    section: g.section,
    label: g.label,
    sublabel: g.sublabel,
    // Locked groups read as ON no matter what any stored row says.
    enabled: g.is_locked ? true : (chosen.get(g.code) ?? g.default_on),
    locked: !!g.is_locked,
  }));

  const enabled: Record<string, boolean> = {};
  for (const g of list) enabled[g.code] = g.enabled;

  return {
    groups: list,
    enabled,
    push: !!row.push_enabled,
    email: !!row.email_enabled,
    whatsapp: !!row.whatsapp_enabled,
    marketingConsent: !!row.marketing_consent,
    marketingConsentAt: row.marketing_consent_at ?? null,
    quietHours: !!row.quiet_hours,
    quietStart: hhmm(row.quiet_start, settings.quietStart),
    quietEnd: hhmm(row.quiet_end, settings.quietEnd),
    expiryReminders: !!row.expiry_reminders,
  };
}

async function prefRow(profileId: string): Promise<any> {
  const { data } = await db().from("notification_prefs").select(PREF_COLS).eq("profile_id", profileId).maybeSingle();
  if (data) return data;
  const { data: made } = await db()
    .from("notification_prefs")
    .upsert({ profile_id: profileId }, { onConflict: "profile_id" })
    .select(PREF_COLS)
    .maybeSingle();
  return made ?? {};
}

export interface PrefsPatch {
  /** group code → on/off, e.g. { n_drop: false }. Locked groups are ignored. */
  groups?: Record<string, boolean>;
  marketingConsent?: boolean;
  quietHours?: boolean;
  quietStart?: string;
  quietEnd?: string;
  expiryReminders?: boolean;
  push?: boolean;
  email?: boolean;
  whatsapp?: boolean;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function setPrefs(profileId: string, patch: PrefsPatch): Promise<Prefs> {
  if (patch.groups && Object.keys(patch.groups).length) {
    const { data: defs } = await db().from("notification_pref_groups").select("code,is_locked");
    const locked = new Set(((defs ?? []) as any[]).filter((g) => g.is_locked).map((g) => g.code));
    const known = new Set(((defs ?? []) as any[]).map((g) => g.code));
    const rows = Object.entries(patch.groups)
      // Unknown group → ignored (no invented preferences).
      // Locked group → ignored, whatever the client sent.
      .filter(([code]) => known.has(code) && !locked.has(code))
      .map(([code, enabled]) => ({ profile_id: profileId, group_code: code, enabled: !!enabled, updated_at: new Date().toISOString() }));
    if (rows.length) await db().from("notification_pref_values").upsert(rows, { onConflict: "profile_id,group_code" });
  }

  const row: Record<string, unknown> = { profile_id: profileId, updated_at: new Date().toISOString() };
  if (patch.marketingConsent !== undefined) {
    // DPDP: the moment of consent (and of withdrawal) has to be provable.
    row.marketing_consent = patch.marketingConsent;
    row.marketing_consent_at = patch.marketingConsent ? new Date().toISOString() : null;
  }
  if (patch.quietHours !== undefined) row.quiet_hours = patch.quietHours;
  if (patch.quietStart !== undefined && TIME_RE.test(patch.quietStart)) row.quiet_start = patch.quietStart;
  if (patch.quietEnd !== undefined && TIME_RE.test(patch.quietEnd)) row.quiet_end = patch.quietEnd;
  if (patch.expiryReminders !== undefined) row.expiry_reminders = patch.expiryReminders;
  if (patch.push !== undefined) row.push_enabled = patch.push;
  if (patch.email !== undefined) row.email_enabled = patch.email;
  if (patch.whatsapp !== undefined) row.whatsapp_enabled = patch.whatsapp;

  if (Object.keys(row).length > 2) await db().from("notification_prefs").upsert(row, { onConflict: "profile_id" });
  return getPrefs(profileId);
}

let settingsCache: { at: number; value: GlobalSettings } | null = null;

export async function globalSettings(): Promise<GlobalSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.value;
  const { data } = await db()
    .from("notification_settings")
    .select("retention_days,quiet_start,quiet_end,timezone,batch_window_minutes")
    .eq("id", true)
    .maybeSingle();
  const r = (data ?? {}) as any;
  const value: GlobalSettings = {
    retentionDays: r.retention_days ?? 90,
    quietStart: hhmm(r.quiet_start, "23:00"),
    quietEnd: hhmm(r.quiet_end, "08:00"),
    timezone: r.timezone ?? "Asia/Kolkata",
    batchWindowMinutes: r.batch_window_minutes ?? 1440,
  };
  settingsCache = { at: Date.now(), value };
  return value;
}

/**
 * Quiet hours (Doc2 §14: "non-urgent ≥11PM held").
 *
 * Returns the instant a held notification may be DELIVERED, or null when it may
 * go out now. Evaluated in the display timezone (IST), not UTC — "11 PM" means
 * 11 PM to the user, and every timestamp we store is UTC.
 *
 * Only the CHANNELS (push/email) are held. The in-app row is written
 * immediately either way — the notifications screen is pull, not interrupt.
 */
export function quietHold(now: Date, startHHMM: string, endHHMM: string, tz: string): Date | null {
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = local.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();

  const mins = local.getHours() * 60 + local.getMinutes();
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;

  // A window crossing midnight (23:00 → 08:00) is "at/after start OR before
  // end"; one that does not is the plain between.
  const inWindow = start > end ? mins >= start || mins < end : mins >= start && mins < end;
  if (!inWindow) return null;

  const release = new Date(local);
  release.setHours(eh, em, 0, 0);
  if (release.getTime() <= local.getTime()) release.setDate(release.getDate() + 1);
  return new Date(release.getTime() - offsetMs);
}
