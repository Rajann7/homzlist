import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can, tooltipFor } from "@/lib/admin/permissions";
import { queuePage, LISTING_TABS } from "@/lib/admin/queues";
import { RequirementsQueue } from "@/components/admin/RequirementsQueue";

/**
 * A5 — Requirements queue (Doc5 A5 / P13 `requirementsEl`).
 *
 * Reuses A3's queue reader with subject=requirement, so the risk scoring, the
 * SLA bands, the review locks and the sort rule (risk desc, then oldest) are the
 * same code — and the sidebar badge, A2's tile and this screen can never
 * disagree about what "pending" means.
 *
 * `payment` is dropped from the tab strip: a requirement is included in a plan,
 * never bought on its own, so it has no payment-pending state to review.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TABS = LISTING_TABS.filter((t) => t.key !== "payment");

export default async function RequirementsQueuePage({
  searchParams,
}: {
  searchParams: { tab?: string; risk?: string };
}) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "queues.view")) redirect("/");

  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "pending";
  const risk = searchParams.risk;

  const page = await queuePage("requirement", {
    tab,
    staff: session.staff,
    filters: {
      type: null,
      cityId: null,
      risk: risk === "low" || risk === "medium" || risk === "high" ? risk : null,
      role: null,
      since: null,
    },
  });

  // `queuePage` applies the risk band itself (and widens its read so a computed
  // filter searches the whole set, not just the first page) — see lib/admin/queues.
  const rows = page.rows;

  return (
    <RequirementsQueue
      tabs={TABS}
      tab={tab}
      counts={page.counts}
      rows={rows}
      canDecide={can(session.staff.level, "queues.decide")}
      decideTooltip={tooltipFor("queues.decide") || "Admin only"}
    />
  );
}
