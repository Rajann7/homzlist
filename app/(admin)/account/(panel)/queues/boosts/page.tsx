import { BoostsQueue } from "@/components/admin/queues/BoostsQueue";
import { screenGate } from "@/lib/admin/screen-gate";

/**
 * A6 — Boost queue (Doc5 A6, template 849-866).
 *
 * No filter-option fetch: a boost's filters are its own enums (targeting,
 * subject kind), not config rows, so there is nothing to read.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function BoostsQueuePage() {
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;
  return <BoostsQueue />;
}
