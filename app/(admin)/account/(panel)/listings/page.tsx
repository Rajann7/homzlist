import { ListingsMaster } from "@/components/admin/listings/ListingsMaster";
import { AdminPanels } from "@/components/admin/panels/registry";
import { screenGate } from "@/lib/admin/screen-gate";
import { masterFilterOptions, listingMasterCount } from "@/lib/admin/filter-options";

/** A12 — Listings master (Doc5 A12, template 1056-1105). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ListingsMasterPage() {
  const gate = await screenGate("admin");
  if (!gate.ok) return gate.lock;
  const [{ types, cities }, total] = await Promise.all([
    masterFilterOptions(),
    listingMasterCount(),
  ]);
  return (
    <AdminPanels screen="listingsMaster">
      <ListingsMaster options={{ types, cities }} total={total} />
    </AdminPanels>
  );
}
