import { RequirementsQueue } from "@/components/admin/queues/RequirementsQueue";
import { requireAdmin } from "@/lib/admin/guard";
import { queueFilterOptions } from "@/lib/admin/filter-options";

/** A5 — Requirements queue (Doc5 A5, template 829-847). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function RequirementsQueuePage() {
  await requireAdmin("staff");
  return <RequirementsQueue options={await queueFilterOptions()} />;
}
