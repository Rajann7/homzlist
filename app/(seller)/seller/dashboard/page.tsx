import { DashboardHub } from "@/components/dashboard/DashboardHub";

/**
 * Seller Dashboard hub (seller.homzlist.com/dashboard) — the feed header's grid
 * icon lands here. A real route rather than a sheet so it is linkable, the
 * hardware back button dismisses it, and the header's close falls back to the
 * feed.
 */
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardHub />;
}
