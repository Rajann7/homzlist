import { MaintenanceView } from "./MaintenanceView";
import { getMaintenance } from "@/lib/system/maintenance";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Maintenance mode, enforced (Doc7 §13 #190).
 *
 * Without this the maintenance page would be a screen nobody ever reaches — a
 * design with no job behind it. Wrapping the two user-facing layouts means the
 * toggle in maintenance_settings actually takes the site down, on the next
 * request, for everyone except the roles listed in `bypass_roles`.
 *
 * The bypass is checked against the `staff` table, not a client flag, so it
 * cannot be granted by anything the browser sends.
 */
export async function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const state = await getMaintenance();
  if (!state.enabled) return <>{children}</>;

  const claims = await getCurrentUser();
  if (claims) {
    const db = createServiceClient();
    const { data: staff } = await db
      .from("staff")
      .select("level, state, is_active")
      .eq("profile_id", claims.sub)
      .maybeSingle();
    const level = (staff?.level as string) ?? null;
    const usable = staff?.is_active === true && staff?.state === "active";
    if (level && usable && state.bypassRoles.includes(level)) return <>{children}</>;
  }

  return <MaintenanceView message={state.message} minutesLeft={state.minutesLeft} startedAt={state.startedAt} />;
}
