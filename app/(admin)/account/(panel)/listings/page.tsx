import { ListingsMaster } from "@/components/admin/listings/ListingsMaster";
import { AdminPanels } from "@/components/admin/panels/registry";
import { requireAdmin } from "@/lib/admin/guard";
import { masterFilterOptions, listingMasterCount } from "@/lib/admin/filter-options";

/** A12 — Listings master (Doc5 A12, template 1056-1105). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ListingsMasterPage() {
  await requireAdmin("admin");
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
