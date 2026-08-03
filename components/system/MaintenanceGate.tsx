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
 * /legal/* and /help/* are NOT exempted, deliberately — if the platform is down
 * it is down. The one thing that stays answerable is
 * GET /api/v1/system/maintenance, because the page needs it to retry.
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
      .maybeSingle();
    const level = (data as { level: string } | null)?.level;
    if (level && state.bypassRoles.includes(level)) return <>{children}</>;
  }

  return (
    <MaintenancePage message={state.message} etaLabel={state.etaLabel} startedAt={state.startedAt} />
  );
}
