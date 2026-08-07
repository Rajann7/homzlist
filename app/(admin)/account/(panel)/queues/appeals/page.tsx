import { AppealsQueue } from "@/components/admin/queues/AppealsQueue";
import { screenGate } from "@/lib/admin/screen-gate";

/** A8 — Appeals queue (Doc5 A8, template 894-917). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AppealsQueuePage() {
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;
  return <AppealsQueue />;
}
