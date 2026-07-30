import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { currentStaff } from "@/lib/admin/auth";
import { can, LEVEL_LABEL } from "@/lib/admin/permissions";
import { navFor } from "@/lib/admin/nav";
import { pendingTiles } from "@/lib/admin/dashboard";
import { createServiceClient } from "@/lib/supabase/server";
import type { BellItem } from "@/components/admin/AdminBell";
import type { TileKey } from "@/lib/admin/dashboard";

/**
 * (admin) — account.homzlist.com. Fully isolated: its own host-only cookie, its
 * own whitelist, and a seat re-read from the database on every request
 * (Doc6 §4 / Doc9 §21). Middleware rewrites "/*" → "/account/*" internally.
 *
 * The gate lives here rather than in each page so a new admin screen cannot ship
 * unprotected by forgetting a check — every route in the (shell) group is behind
 * it, and each endpoint checks again on its own. A1 (login) sits outside the
 * group precisely because it is the one screen that must render signed out.
 *
 * Admin ships its own 3-device layout (P13-14-15) — do NOT re-viewport it.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const session = await currentStaff();
  if (!session.ok) {
    redirect(session.reason === "no_session" ? "/login" : `/login?error=${session.reason}`);
  }

  const { staff } = session;
  const db = createServiceClient();

  const [tiles, onlineRows, bellRows, maintRow] = await Promise.all([
    pendingTiles(),
    staff.level === "super"
      ? db.from("staff").select("display_name, level").eq("is_online", true).eq("is_active", true)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    db
      .from("admin_notifications")
      .select("id, kind, severity, title, body, link_screen, read_at, created_at")
      // Same scope as /api/v1/admin/notifications: panel-wide notices plus the ones
      // addressed to this seat. Without it this second reader put another admin's
      // review assignment in everybody's bell — the API was fixed for `staff_id`
      // (migration 0101) and this surface was missed.
      .or(`staff_id.is.null,staff_id.eq.${staff.id}`)
      .order("created_at", { ascending: false })
      .limit(20),
    // The design's shell draws a maintenance banner; this is the real flag behind it.
    db.from("maintenance_settings").select("enabled, updated_at").eq("id", true).maybeSingle(),
  ]);

  const badges: Partial<Record<TileKey, number>> = {};
  for (const t of tiles) badges[t.key] = t.count;

  // "since 2:00 PM" in the design — the real timestamp the flag was last flipped.
  const maintSettings = maintRow.data as { enabled: boolean; updated_at: string | null } | null;
  const maintenance = maintSettings?.enabled
    ? {
        enabled: true,
        since: maintSettings.updated_at
          ? new Date(maintSettings.updated_at).toLocaleTimeString("en-IN", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "Asia/Kolkata",
            })
          : null,
      }
    : null;

  const bell: BellItem[] = ((bellRows.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    severity: r.severity as string,
    title: r.title as string,
    body: (r.body as string) ?? null,
    linkScreen: (r.link_screen as string) ?? null,
    read: Boolean(r.read_at),
    createdAt: r.created_at as string,
  }));

  return (
    <AdminShell
      staff={{ id: staff.id, name: staff.name, email: staff.email, level: staff.level, levelLabel: LEVEL_LABEL[staff.level] }}
      nav={navFor(staff.level)}
      badges={badges}
      online={((onlineRows.data ?? []) as Record<string, unknown>[]).map((r) => ({
        name: (r.display_name as string) ?? "Staff",
        level: (r.level as string) ?? "staff",
      }))}
      bell={bell}
      env={process.env.NODE_ENV === "production" ? null : "STAGING"}
      maintenance={maintenance}
      canLiftMaintenance={can(staff.level, "flags")}
    >
      {children}
    </AdminShell>
  );
}
