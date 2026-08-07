import { RequirementsQueue } from "@/components/admin/queues/RequirementsQueue";
import { screenGate } from "@/lib/admin/screen-gate";
import { queueFilterOptions } from "@/lib/admin/filter-options";

/** A5 — Requirements queue (Doc5 A5, template 829-847). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function RequirementsQueuePage() {
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;
  return <RequirementsQueue options={await queueFilterOptions()} />;
}
