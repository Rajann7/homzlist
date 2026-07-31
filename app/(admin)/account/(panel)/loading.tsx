import { Shimmer } from "@/components/admin/ds";

/**
 * template 519-527 — the dashboard's own skeleton, which the design reaches via
 * `appState === 'skeleton'`. Here it is Next's loading boundary, so it is what
 * genuinely renders while the seven queries run rather than a state someone has
 * to remember to switch on.
 *
 * The shapes are the design's: a 32×220 title, seven 96px tiles in the same
 * responsive columns as the real ones, four 110px stat cards, then a 240px
 * block for the chart row.
 */
export default function DashboardLoading() {
  return (
    <div>
      <Shimmer h={32} w={220} />
      <div style={{ height: 20 }} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 desktop:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Shimmer key={i} h={96} />
        ))}
      </div>
      <div style={{ height: 24 }} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} h={110} />
        ))}
      </div>
      <div style={{ height: 24 }} />
      <Shimmer h={240} />
    </div>
  );
}
