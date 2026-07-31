import { Dashboard } from "@/components/admin/dashboard/Dashboard";
import { requireAdmin } from "@/lib/admin/guard";
import {
  anomalyBanners,
  overdueReviews,
  queueTiles,
  revenueSeries,
  statCards,
  systemStrips,
  todayLabel,
} from "@/lib/admin/dashboard";

/**
 * A2 — Dashboard (Doc5 A2, template 491-595).
 *
 * Seven reads, all in parallel, all real. The screen receives them already
 * computed; there is no client-side derivation of a count, a delta or a status
 * anywhere below this line.
 *
 * `force-dynamic` + `fetchCache: "force-no-store"` because a dashboard that
 * serves a cached queue depth is worse than no dashboard — and because the Data
 * cache otherwise pins Supabase reads on SSR pages indefinitely.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminDashboardPage() {
  await requireAdmin("staff");

  const [tiles, stats, banners, revenue, overdue, strips] = await Promise.all([
    queueTiles(),
    statCards(),
    anomalyBanners(),
    revenueSeries("7d"),
    overdueReviews(),
    systemStrips(),
  ]);

  return (
    <Dashboard
      today={todayLabel()}
      tiles={tiles.tiles}
      stats={stats}
      banners={banners}
      revenue={revenue}
      overdue={overdue}
      strips={strips}
    />
  );
}
