import { ReportsQueue } from "@/components/admin/queues/ReportsQueue";
import { requireAdmin } from "@/lib/admin/guard";

/** A9 — Reports queue (Doc5 A9, template 919-949). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ReportsQueuePage() {
  await requireAdmin("staff");
  return <ReportsQueue />;
}
