import { redirect } from "next/navigation";
import { PanelChrome } from "@/components/admin/panel/PanelChrome";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminAuthError } from "@/lib/admin/guard";
import { initialsOf } from "@/lib/admin/identity";
import { isStagingEnv } from "@/lib/admin/environment";
import { queueTiles } from "@/lib/admin/dashboard";
import { bellFeed } from "@/lib/admin/notifications";
import { adminProfile, maintenanceState, onlineStaff } from "@/lib/admin/panel";

/**
 * Every screen inside the panel, behind one gate.
 *
 * `requireAdmin` here is not the authorization — each endpoint re-checks for
 * itself — but it is what stops an unauthenticated request from ever rendering
 * the shell, and what gives every screen below a role that came from the
 * database on THIS request rather than from a token minted half an hour ago.
 *
 * The shell's data is read here rather than in each page: the badges, the bell
 * and the online cluster are the same on every screen, and a screen that
 * forgets to fetch them would otherwise render a shell with none.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  let me;
  try {
    me = await requireAdmin("staff");
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    throw e;
  }

  const [{ counts }, notifications, maintenance, online, profile] = await Promise.all([
    queueTiles(),
    bellFeed(),
    maintenanceState(),
    onlineStaff(),
    adminProfile(me),
  ]);

  return (
    <PanelChrome
      me={{
        id: me.id,
        name: me.name,
        email: me.email,
        role: me.role,
        initials: initialsOf(me.name),
      }}
      staging={isStagingEnv()}
      navCounts={counts}
      notifications={notifications}
      maintenance={maintenance}
      onlineStaff={online}
      profile={profile}
    >
      {children}
    </PanelChrome>
  );
}
