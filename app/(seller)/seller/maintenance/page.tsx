import { MaintenancePage } from "@/components/system/MaintenancePage";
import { maintenanceState } from "@/lib/system/maintenance";

/**
 * P12 S8 — the maintenance page, reachable directly so it can be reviewed
 * without taking the platform down. When maintenance IS on, MaintenanceGate in
 * the layout renders the same component in front of every other screen.
 */
export const metadata = { title: "Maintenance", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerMaintenancePage() {
  const s = await maintenanceState();
  return <MaintenancePage message={s.message} etaLabel={s.etaLabel} startedAt={s.startedAt ?? new Date().toISOString()} />;
}
