import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can, tooltipFor } from "@/lib/admin/permissions";
import { actionOptions } from "@/lib/admin/reviewConfig";
import { boostQueue } from "@/lib/billing/boost";
import { BoostQueue } from "@/components/admin/BoostQueue";

/**
 * A6 — Boost queue (Doc5 A6).
 *
 * Reads `boostQueue()`, the same function the older /admin/queue/boost endpoint
 * uses, so the eligibility checks an admin acts on are the ones the rest of the
 * system computes — not a second opinion assembled for this screen.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function BoostQueuePage() {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "queues.view")) redirect("/");

  const [rows, refundReasons] = await Promise.all([boostQueue(), actionOptions("boost_refund")]);

  return (
    <BoostQueue
      rows={rows}
      canDecide={can(session.staff.level, "queues.decide")}
      decideTooltip={tooltipFor("queues.decide") || "Admin only"}
      refundReasons={refundReasons}
    />
  );
}
