"use client";

/**
 * The shell, mounted.
 *
 * P0 built `AdminShell` to take its three header surfaces as render props,
 * because each needs server data and each is a different surface type in the
 * design (right sheet · centred card · anchored dropdown). This is the
 * component that supplies them, and the only client state it owns is which one
 * is open — everything they display was read on the server for this request.
 *
 * The two sheets the avatar menu opens are rendered OUTSIDE the shell's own
 * overlay slot on purpose: picking "My profile" closes the menu, and a sheet
 * living inside the menu's slot would close with it.
 */

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AdminProvider, AdminShell, useToast, type AdminIdentity } from "@/components/admin/ds";
import type { NavCounts } from "@/components/admin/ds";
import { BellSheet } from "./BellSheet";
import { GlobalSearch } from "./GlobalSearch";
import { AvatarMenu } from "./AvatarMenu";
import { MyProfileSheet } from "./MyProfileSheet";
import { SwitchAccountSheet } from "./SwitchAccountSheet";
import type { AdminNotification } from "@/lib/admin/notifications";
import type { AdminProfile, MaintenanceState, OnlineStaff } from "@/lib/admin/panel";

export type PanelChromeProps = {
  me: AdminIdentity;
  staging: boolean;
  navCounts: NavCounts;
  notifications: { unread: number; items: AdminNotification[] };
  maintenance: MaintenanceState;
  onlineStaff: OnlineStaff[];
  profile: AdminProfile;
  children: ReactNode;
};

export function PanelChrome(props: PanelChromeProps) {
  return (
    <AdminProvider me={props.me} staging={props.staging}>
      <Chrome {...props} />
    </AdminProvider>
  );
}

/** Inside the provider, so the surfaces can reach the toast. */
function Chrome({
  navCounts,
  notifications,
  maintenance,
  onlineStaff,
  profile,
  children,
}: PanelChromeProps) {
  const router = useRouter();
  const toast = useToast();
  const [sheet, setSheet] = useState<"profile" | "switch" | null>(null);

  async function turnOffMaintenance() {
    const res = await fetch("/api/v1/admin/maintenance/off", {
      method: "POST",
      cache: "no-store",
    }).catch(() => null);
    if (res?.status === 403) {
      toast("Super Admin only");
      return;
    }
    const body = (await res?.json().catch(() => null)) as { ok?: boolean } | null;
    if (!body?.ok) {
      toast("Could not turn maintenance off");
      return;
    }
    toast("Maintenance mode off · logged");
    router.refresh();
  }

  return (
    <>
      <AdminShell
        navCounts={navCounts}
        unreadNotifications={notifications.unread}
        maintenance={maintenance}
        onlineStaff={onlineStaff}
        onTurnOffMaintenance={turnOffMaintenance}
        renderBell={(close) => <BellSheet items={notifications.items} onClose={close} />}
        renderSearch={(close) => <GlobalSearch onClose={close} />}
        renderAvatarMenu={(close) => (
          <AvatarMenu
            onClose={close}
            onMyProfile={() => {
              close();
              setSheet("profile");
            }}
            onSwitchAccount={() => {
              close();
              setSheet("switch");
            }}
          />
        )}
      >
        {children}
      </AdminShell>

      {sheet === "profile" ? (
        <MyProfileSheet profile={profile} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "switch" ? <SwitchAccountSheet onClose={() => setSheet(null)} /> : null}
    </>
  );
}
