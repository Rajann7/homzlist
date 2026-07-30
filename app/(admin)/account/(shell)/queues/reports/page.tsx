import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { reportsScreen, type ReportFilter } from "@/lib/admin/reports";
import { actionOptions } from "@/lib/admin/reviewConfig";
import { ReportsQueue } from "@/components/admin/ReportsQueue";

/**
 * A9 — Reports queue (Doc5 A9).
 *
 * The capability flags are passed down so the buttons a seat cannot use are
 * disabled with the right tooltip — and every one of them is re-checked in
 * /api/v1/admin/reports/action, because a hidden button is a courtesy and the
 * endpoint is the control (Doc3 §1.1).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const FILTERS: ReportFilter[] = ["all", "listings", "users", "messages", "high"];

export default async function ReportsPage({ searchParams }: { searchParams: { f?: string } }) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "queues.view")) redirect("/");

  const filter = (FILTERS.includes(searchParams.f as ReportFilter) ? searchParams.f : "all") as ReportFilter;

  const [{ groups, counts }, warnTemplates, suspendDurations] = await Promise.all([
    reportsScreen(filter),
    actionOptions("warn_template"),
    actionOptions("suspend_duration"),
  ]);

  return (
    <ReportsQueue
      filter={filter}
      counts={counts}
      groups={groups}
      can={{
        hide: can(session.staff.level, "listings.edit"),
        users: can(session.staff.level, "users.edit"),
        ban: can(session.staff.level, "devicebans"),
      }}
      warnTemplates={warnTemplates}
      suspendDurations={suspendDurations}
    />
  );
}
