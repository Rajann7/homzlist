import { BoostsQueue } from "@/components/admin/queues/BoostsQueue";
import { requireAdmin } from "@/lib/admin/guard";

/**
 * A6 — Boost queue (Doc5 A6, template 849-866).
 *
 * No filter-option fetch: a boost's filters are its own enums (targeting,
 * subject kind), not config rows, so there is nothing to read.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function BoostsQueuePage() {
  await requireAdmin("staff");
  return <BoostsQueue />;
}
