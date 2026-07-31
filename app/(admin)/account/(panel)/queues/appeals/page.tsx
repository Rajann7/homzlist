import { AppealsQueue } from "@/components/admin/queues/AppealsQueue";
import { requireAdmin } from "@/lib/admin/guard";

/** A8 — Appeals queue (Doc5 A8, template 894-917). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AppealsQueuePage() {
  await requireAdmin("staff");
  return <AppealsQueue />;
}
