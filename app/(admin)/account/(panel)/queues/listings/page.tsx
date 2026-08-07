import { ListingsQueue } from "@/components/admin/queues/ListingsQueue";
import { screenGate } from "@/lib/admin/screen-gate";
import { queueFilterOptions } from "@/lib/admin/filter-options";

/**
 * A3 — Listings queue (Doc5 A3, template 597-673).
 *
 * The rows are not fetched here: the list engine owns paging, filtering and
 * sorting, and it has to re-ask the server every time one of those changes, so
 * the table is a client component talking to /api/v1/admin/list/listings. What
 * IS fetched here is the set of options the filter sheet may offer, because
 * that is config, not a query result.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ListingsQueuePage() {
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;
  return <ListingsQueue options={await queueFilterOptions()} />;
}
