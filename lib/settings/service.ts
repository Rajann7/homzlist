import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getProfileById, getVerifications, getCityName, getAccountStatus } from "@/lib/profile/service";
import { listSessions } from "@/lib/auth/session";
import { listDrafts } from "@/lib/listings/service";
import { getActivePlans } from "@/lib/billing/service";

/**
 * P10 S6 — Settings home overview (Doc4 §60). Every value the Settings list
 * shows is computed here from the database (or the live session store), never
 * hardcoded: the identity card, verification badges, account-status label, and
 * the row counts (Saved, Drafts, Login devices, Blocked users). The frontend
 * only renders what this returns.
 */

export interface SettingsOverview {
  identity: {
    name: string | null;
    username: string | null;
    role: "owner" | "broker" | "builder" | null;
    phone: string;
    email: string | null;
    cityName: string | null;
    photoUrl: string | null;
  };
  verification: { id: boolean; rera: boolean };
  accountStatus: { label: string; inGoodStanding: boolean };
  language: string;
  plan: string | null;
  counts: {
    saved: number;
    drafts: number;
    devices: number;
    blocked: number;
  };
}

export const LOCALE_LABELS: Record<string, string> = { en: "English", hi: "हिन्दी (Hindi)", gu: "ગુજરાતી (Gujarati)" };

export interface UserPrefs {
  locale: "en" | "hi" | "gu";
  showNumberDefault: boolean;
  showLastSeen: boolean;
  showActivity: boolean;
  findableByPhone: boolean;
}

const PREF_DEFAULTS: UserPrefs = {
  locale: "en",
  showNumberDefault: false,
  showLastSeen: true,
  showActivity: true,
  findableByPhone: true,
};

function mapPrefs(row: Record<string, unknown> | null): UserPrefs {
  if (!row) return { ...PREF_DEFAULTS };
  return {
    locale: (row.locale as UserPrefs["locale"]) ?? "en",
    showNumberDefault: Boolean(row.show_number_default),
    showLastSeen: Boolean(row.show_last_seen),
    showActivity: Boolean(row.show_activity),
    findableByPhone: Boolean(row.findable_by_phone),
  };
}

/** The user's settings prefs (locale + privacy). Missing row ⇒ design defaults. */
export async function getUserPrefs(profileId: string): Promise<UserPrefs> {
  const db = createServiceClient();
  const { data } = await db.from("user_settings").select("*").eq("profile_id", profileId).maybeSingle();
  return mapPrefs(data);
}

/** Upsert a subset of prefs; returns the full, stored prefs (never a client echo). */
export async function updateUserPrefs(profileId: string, patch: Partial<UserPrefs>): Promise<UserPrefs> {
  const db = createServiceClient();
  const row: Record<string, unknown> = { profile_id: profileId };
  if (patch.locale !== undefined) row.locale = patch.locale;
  if (patch.showNumberDefault !== undefined) row.show_number_default = patch.showNumberDefault;
  if (patch.showLastSeen !== undefined) row.show_last_seen = patch.showLastSeen;
  if (patch.showActivity !== undefined) row.show_activity = patch.showActivity;
  if (patch.findableByPhone !== undefined) row.findable_by_phone = patch.findableByPhone;
  const { data } = await db.from("user_settings").upsert(row, { onConflict: "profile_id" }).select("*").maybeSingle();
  return mapPrefs(data);
}

export async function getSettingsOverview(profileId: string): Promise<SettingsOverview | null> {
  const profile = await getProfileById(profileId);
  if (!profile) return null;
  const db = createServiceClient();

  const [verifs, statusEvents, sessions, drafts, plans, savedCount, blockedCount, prefs] = await Promise.all([
    getVerifications(profileId),
    getAccountStatus(profileId),
    listSessions(profileId),
    listDrafts(profileId),
    getActivePlans(profileId),
    db.from("saves").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
    db.from("user_blocks").select("blocked_id", { count: "exact", head: true }).eq("blocker_id", profileId),
    getUserPrefs(profileId),
  ]);

  const approved = (level: "id" | "rera") => verifs.some((v) => v.level === level && v.status === "approved");
  // "In good standing" mirrors the account-status screen: only real rejections /
  // warnings count against it, not the informational bio flag (Doc7 §25).
  const activeIssues = statusEvents.filter((e: { kind: string }) => e.kind !== "bio_flag").length;
  // The current, non-expired plan's name if the user holds one — else Free.
  const active = plans.find((p) => p.status === "active");

  const cityName = await getCityName(profile.city_id);

  return {
    identity: {
      name: profile.name,
      username: profile.username,
      role: profile.role,
      phone: profile.phone,
      email: profile.email,
      cityName,
      photoUrl: profile.photo_url,
    },
    verification: { id: approved("id"), rera: approved("rera") },
    accountStatus: { label: activeIssues === 0 ? "Active" : "Needs attention", inGoodStanding: activeIssues === 0 },
    language: LOCALE_LABELS[prefs.locale] ?? "English",
    plan: active?.name ?? null,
    counts: {
      saved: savedCount.count ?? 0,
      drafts: drafts.length,
      devices: sessions.length,
      blocked: blockedCount.count ?? 0,
    },
  };
}
