import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { queuePage, LISTING_TABS } from "@/lib/admin/queues";
import { QueueScreen } from "@/components/admin/QueueScreen";

/**
 * A3 — Listings queue (Doc5 A3 / P13).
 *
 * Server-rendered: an admin opening the queue should see the real rows and the
 * real lock state on first paint, not a skeleton that resolves into someone
 * else's item being already taken.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ListingsQueuePage({
  searchParams,
}: {
  searchParams: { tab?: string; risk?: string; type?: string; city?: string };
}) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "queues.view")) redirect("/");

  const tab = LISTING_TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "pending";
  const risk = searchParams.risk;

  const page = await queuePage("listing", {
    tab,
    staff: session.staff,
    filters: {
      type: searchParams.type ?? null,
      cityId: searchParams.city ?? null,
      risk: risk === "low" || risk === "medium" || risk === "high" ? risk : null,
      role: null,
      since: null,
    },
  });

  const rows = risk ? page.rows.filter((r) => r.risk.band === risk) : page.rows;

  return (
    <QueueScreen
      title="Listings queue"
      subject="listing"
      basePath="/queues/listings"
      tabs={LISTING_TABS}
      tab={tab}
      counts={page.counts}
      rows={rows}
      canDecide={can(session.staff.level, "queues.decide")}
      queueKey="listings"
    />
  );
}
