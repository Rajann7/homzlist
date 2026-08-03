import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * P12 S8 — maintenance mode, from the user's side.
 *
 * A20 (Module 11) already gave an admin the switch, the message and the ETA.
 * What did not exist was anything that READ it: `maintenance_settings.enabled`
 * could be flipped to true all day and homzlist.com carried on serving. This is
 * the reader, and `middleware.ts` is where it bites.
 *
 * Staff bypass is not decided here — 0088 stores `bypass_roles` and the admin
 * settings code refuses to clear it, because maintenance that locks the
 * operators out of the panel that turns maintenance off is only recoverable
 * from psql.
 */

const db = () => createServiceClient();

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  /** When we expect to be back; null when the admin gave no duration. */
  eta: string | null;
  /** "Estimated: 30 minutes" — computed from `eta`, never stored as a phrase. */
  etaLabel: string | null;
  startedAt: string | null;
  bypassRoles: string[];
}

const FALLBACK: MaintenanceState = {
  enabled: false,
  message: "HomzList is under maintenance. We'll be right back.",
  eta: null,
  etaLabel: null,
  startedAt: null,
  bypassRoles: ["super", "admin", "staff"],
};

function etaLabel(eta: string | null): string | null {
  if (!eta) return null;
  const mins = Math.round((new Date(eta).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "Any moment now";
  if (mins < 60) return `Estimated: ${mins} minute${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `Estimated: ${h}h ${m}m` : `Estimated: ${h} hour${h === 1 ? "" : "s"}`;
}

export async function maintenanceState(): Promise<MaintenanceState> {
  try {
    const { data } = await db()
      .from("maintenance_settings")
      .select("enabled, message, eta, bypass_roles, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return FALLBACK;
    const r = data as {
      enabled: boolean; message: string | null; eta: string | null;
      bypass_roles: string[] | null; updated_at: string;
    };
    return {
      enabled: Boolean(r.enabled),
      message: r.message?.trim() || FALLBACK.message,
      eta: r.eta,
      etaLabel: etaLabel(r.eta),
      // The design prints "Started 2:00 PM IST" — that is when the switch was
      // last flipped, which is exactly what updated_at records.
      startedAt: r.enabled ? r.updated_at : null,
      bypassRoles: r.bypass_roles ?? FALLBACK.bypassRoles,
    };
  } catch {
    // A database that cannot be reached must not hard-fail the whole site into
    // a maintenance page nobody asked for. Fail OPEN.
    return FALLBACK;
  }
}

/** The subset safe to hand an unauthenticated client. */
export async function publicMaintenanceState(): Promise<Omit<MaintenanceState, "bypassRoles">> {
  const { bypassRoles: _ignored, ...rest } = await maintenanceState();
  return rest;
}
