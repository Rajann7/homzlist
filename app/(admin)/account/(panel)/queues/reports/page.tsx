import { ReportsQueue } from "@/components/admin/queues/ReportsQueue";
import { screenGate } from "@/lib/admin/screen-gate";

/** A9 — Reports queue (Doc5 A9, template 919-949). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ReportsQueuePage() {
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;
  return <ReportsQueue />;
}
