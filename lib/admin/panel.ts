import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { initialsOf } from "./identity";
import type { AdminIdentity } from "./guard";
import { maskIpForDisplay, shortDevice } from "./display";

/**
 * Everything the SHELL needs, as opposed to what a screen needs.
 *
 * P0 built the shell to take its badge counts, its maintenance banner and its
 * online cluster as required props with no defaults — no placeholder number
 * anywhere. This is the server side of that contract, and it is read fresh on
 * every request: the badge on "Listings 12" is the same query the dashboard
 * tile runs, so the two cannot drift apart.
 */

export type OnlineStaff = { initials: string; color: string };

/** template 439 — the overlapping avatars are colour-coded per admin. */
const AVATAR_COLORS = [
  "var(--accent)",
  "var(--info)",
  "var(--warning)",
  "#8E44AD",
  "#E67E22",
];

/** Presence is a heartbeat, not a flag: `requireAdmin` stamps last_seen_at. */
const ONLINE_WINDOW_MS = 5 * 60_000;

export async function onlineStaff(): Promise<OnlineStaff[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("staff_sessions")
    .select("staff_id, last_seen_at, staff(display_name, email)")
    .is("ended_at", null)
    .gte("last_seen_at", new Date(Date.now() - ONLINE_WINDOW_MS).toISOString())
    .order("last_seen_at", { ascending: false });

  const seen = new Set<string>();
  const out: OnlineStaff[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.staff_id)) continue; // one avatar per admin, not per tab
    seen.add(row.staff_id);
    const staff = row.staff as unknown as { display_name: string | null; email: string | null };
    out.push({
      initials: initialsOf(staff?.display_name ?? staff?.email ?? ""),
      color: AVATAR_COLORS[out.length % AVATAR_COLORS.length],
    });
  }
  return out;
}

export type MaintenanceState = { on: boolean; since: string } | null;

export async function maintenanceState(): Promise<MaintenanceState> {
  const db = createServiceClient();
  const { data } = await db
    .from("maintenance_settings")
    .select("enabled, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (!data?.enabled) return null;
  return {
    on: true,
    since: new Date(data.updated_at).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }),
  };
}

export type AdminProfile = {
  name: string;
  email: string;
  phone: string;
  role: "staff" | "admin" | "super";
  initials: string;
  notifyEscalations: boolean;
  dailyDigest: boolean;
  /** "today 9:04 AM · 103.21.xx.xx · Chrome/Mac" — template 1595 */
  lastLogin: string;
};

/**
 * The My-profile sheet's contents. The last-login line is the real previous
 * session, masked the way Doc9 §19 requires — an IP that identifies a person
 * does not need to be legible on a screen whose only job is "was that me?".
 */
export async function adminProfile(me: AdminIdentity): Promise<AdminProfile> {
  const db = createServiceClient();
  const [{ data: staff }, { data: session }] = await Promise.all([
    db
      .from("staff")
      .select("display_name, email, phone, level, last_login_at, notify_escalations, daily_digest")
      .eq("profile_id", me.id)
      .maybeSingle(),
    db
      .from("staff_sessions")
      .select("started_at, ip, device")
      .eq("staff_id", me.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const when = staff?.last_login_at ?? session?.started_at ?? null;
  const lastLogin = when
    ? [
        formatWhen(when),
        session?.ip ? maskIpForDisplay(session.ip) : null,
        session?.device ? shortDevice(session.device) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "First session";

  return {
    name: staff?.display_name ?? me.name,
    email: staff?.email ?? me.email,
    phone: staff?.phone ?? "",
    role: me.role,
    initials: initialsOf(staff?.display_name ?? me.name),
    notifyEscalations: staff?.notify_escalations ?? true,
    dailyDigest: staff?.daily_digest ?? true,
    lastLogin,
  };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const tz = "Asia/Kolkata";
  const dayOf = (x: Date) => x.toLocaleDateString("en-IN", { timeZone: tz });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  const today = dayOf(new Date()) === dayOf(d);
  return today
    ? `today ${time}`
    : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: tz })} ${time}`;
}
