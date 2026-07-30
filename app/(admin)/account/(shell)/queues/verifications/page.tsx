import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can, tooltipFor } from "@/lib/admin/permissions";
import { VERIFY_TABS, verificationCounts, verificationQueue, type VerifyTab } from "@/lib/admin/verifications";
import { VerificationQueue } from "@/components/admin/VerificationQueue";

/**
 * A7 — Verification queue (Doc5 A7).
 *
 * Server-rendered so the four tab counts and the rows come from one consistent
 * read; a badge decision is not something to make against a stale list.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function VerificationsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "queues.view")) redirect("/");

  const tab = (VERIFY_TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "pending") as VerifyTab;
  const [rows, counts] = await Promise.all([verificationQueue(tab), verificationCounts()]);

  return (
    <VerificationQueue
      tabs={VERIFY_TABS.map((t) => ({ key: t.key, label: t.label }))}
      tab={tab}
      counts={counts}
      rows={rows}
      canDecide={can(session.staff.level, "queues.decide")}
      decideTooltip={tooltipFor("queues.decide") || "Admin only"}
    />
  );
}
