import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can, tooltipFor } from "@/lib/admin/permissions";
import { appealCounts, autoFlagAppeals, rejectLockAppeals } from "@/lib/admin/appeals";
import { AppealsQueue } from "@/components/admin/AppealsQueue";

/**
 * A8 — Appeals queue (Doc5 A8).
 *
 * Both tabs' counts are read regardless of which one is open, because the strip
 * shows both numbers — and the second tab's number is the one nobody would think
 * to check: it counts sellers whose listing is locked and who have nowhere else
 * to go.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AppealsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "queues.view")) redirect("/");

  const tab = searchParams.tab === "reopen" ? "reopen" : "flag";
  const [counts, flag, reopen] = await Promise.all([
    appealCounts(),
    tab === "flag" ? autoFlagAppeals() : Promise.resolve([]),
    tab === "reopen" ? rejectLockAppeals() : Promise.resolve([]),
  ]);

  return (
    <AppealsQueue
      tab={tab}
      counts={counts}
      flagAppeals={flag}
      reopenAppeals={reopen}
      canDecide={can(session.staff.level, "queues.decide")}
      decideTooltip={tooltipFor("queues.decide") || "Admin only"}
    />
  );
}
