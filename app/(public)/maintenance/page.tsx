import type { Metadata } from "next";
import { MaintenanceView } from "@/components/system/MaintenanceView";
import { getMaintenance } from "@/lib/system/maintenance";

/**
 * P12 S8 — the maintenance page. Never indexed: it is a temporary state of the
 * site, not a page anyone should land on from search.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = { title: "Maintenance", robots: { index: false, follow: false } };

export default async function MaintenancePage() {
  const m = await getMaintenance();
  return <MaintenanceView message={m.message} minutesLeft={m.minutesLeft} startedAt={m.startedAt} />;
}
