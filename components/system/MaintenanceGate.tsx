import { maintenanceState } from "@/lib/system/maintenance";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/server";
import { MaintenancePage } from "./MaintenancePage";

/**
 * The thing that makes A20's maintenance switch mean something.
 *
 * It cannot live in middleware.ts: that runs on the Edge, where Supabase and
 * Redis are unreachable (the file says so itself). So the gate is a server
 * component wrapped around the (public) and (seller) trees — one place each,
 * evaluated per request because both layouts are already force-dynamic.
 *
 * STAFF BYPASS. Doc4 §74 says the admin bypass is invisible: a staff member
 * browsing the site during maintenance sees the site. The admin session cookie
 * is host-only to account.*, so it is never present here; the bypass is decided
 * by looking the signed-in profile up in `staff`. A guest is never exempt.
 *
 * /legal/* and /help/* are NOT exempted among the PAGES — if the platform is
 * down it is down.
 *
 * WHAT THIS DOES NOT COVER, stated plainly: /api/v1/**. This gate is a server
 * component in the page tree, so an already-loaded tab, or anything calling the
 * API directly, keeps working during a maintenance window. Those endpoints
 * still enforce their own auth and ownership, so it is not an exposure — but it
 * is not the write-freeze the word "maintenance" implies either. Freezing the
 * API needs a shared wrapper on ~120 route files (the Edge middleware cannot do
 * it: Supabase is unreachable there), which is a change of its own rather than
 * something to half-do here. Recorded in docs/PENDING-INTEGRATIONS.md.
 */
export async function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const state = await maintenanceState();
  if (!state.enabled) return <>{children}</>;

  const claims = await getCurrentUser();
  if (claims) {
    const { data } = await createServiceClient()
      .from("staff")
      .select("level")
      .eq("profile_id", claims.sub)
      // A suspended or never-accepted staff row is not a bypass. `is_active`
      // and `state` are what A29 flips when someone leaves.
      .eq("is_active", true)
      .eq("state", "active")
      .maybeSingle();
    const level = (data as { level: string } | null)?.level;
    if (level && state.bypassRoles.includes(level)) return <>{children}</>;
  }

  return (
    <MaintenancePage message={state.message} etaLabel={state.etaLabel} startedAt={state.startedAt} />
  );
}
