import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Maintenance mode (Doc7 §13 #190) — the row behind P12 S8.
 *
 * The message and the ETA the page shows are admin-set, so the "Estimated: 30
 * minutes" chip is the real remaining time to the configured ETA rather than a
 * hardcoded reassurance. `bypass_roles` is why an admin can still work while the
 * site is down for everyone else.
 */
export interface MaintenanceState {
  enabled: boolean;
  message: string;
  eta: string | null;
  /** Whole minutes left until the ETA, or null when no ETA is set. */
  minutesLeft: number | null;
  startedAt: string | null;
  bypassRoles: string[];
}

export async function getMaintenance(): Promise<MaintenanceState> {
  const db = createServiceClient();
  const { data } = await db.from("maintenance_settings").select("*").eq("id", true).maybeSingle();

  const eta = (data?.eta as string) ?? null;
  const minutesLeft = eta
    ? Math.max(0, Math.round((new Date(eta).getTime() - Date.now()) / 60000))
    : null;

  return {
    enabled: Boolean(data?.enabled),
    message: (data?.message as string) ?? "HomzList is under maintenance. We will be back shortly.",
    eta,
    minutesLeft,
    // updated_at is when the toggle was flipped — the design's "Started 2:00 PM IST".
    startedAt: (data?.updated_at as string) ?? null,
    bypassRoles: (data?.bypass_roles as string[]) ?? ["super", "admin", "staff"],
  };
}
