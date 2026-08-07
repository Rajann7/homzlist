import { VerificationsQueue } from "@/components/admin/queues/VerificationsQueue";
import { screenGate } from "@/lib/admin/screen-gate";
import { queueFilterOptions } from "@/lib/admin/filter-options";

/** A7 — Verification queue (Doc5 A7, template 868-892). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function VerificationsQueuePage() {
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;
  const { roles } = await queueFilterOptions();
  return <VerificationsQueue options={{ roles }} />;
}
