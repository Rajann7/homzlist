import { requireStaff, isDenial } from "@/lib/admin/auth";
import { anomalies, pendingTiles, revenueSeries, slaOverdue, systemStrips, todayStats } from "@/lib/admin/dashboard";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

/**
 * A2 — Dashboard (Doc5 A2 / Doc3 §1.2), the landing screen for all three levels.
 *
 * Server-rendered so the tiles are correct on first paint rather than flashing
 * zeros: an admin opening the panel at 2am to clear a queue should see the real
 * count immediately. The client half only owns the chart range, banner dismissal
 * and refresh.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminDashboardPage() {
  const gate = await requireStaff();
  if (isDenial(gate)) return null; // the (shell) layout has already redirected

  const [tiles, stats, banners, revenue, overdue, system] = await Promise.all([
    pendingTiles(),
    todayStats(),
    anomalies(),
    revenueSeries("7d"),
    slaOverdue(),
    systemStrips(),
  ]);

  return (
    <AdminDashboard
      tiles={tiles}
      stats={stats}
      anomalies={banners}
      revenue={{ range: "7d", points: revenue }}
      overdue={overdue}
      system={system}
    />
  );
}
