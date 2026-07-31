import { VerificationsQueue } from "@/components/admin/queues/VerificationsQueue";
import { requireAdmin } from "@/lib/admin/guard";
import { queueFilterOptions } from "@/lib/admin/filter-options";

/** A7 — Verification queue (Doc5 A7, template 868-892). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function VerificationsQueuePage() {
  await requireAdmin("staff");
  const { roles } = await queueFilterOptions();
  return <VerificationsQueue options={{ roles }} />;
}
