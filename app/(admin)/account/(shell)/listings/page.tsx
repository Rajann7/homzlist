import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { publicEnv } from "@/lib/env";
import { listingFilterOptions, listingsMasterPage, readListingFilters } from "@/lib/admin/listingsMaster";
import { ListingsMaster } from "@/components/admin/ListingsMaster";

/**
 * A12 — Listings master (Doc5 A12).
 *
 * Every listing in every state, including the trash. A3 stays what it is — the
 * review queue — and a row here that IS in a review state links across to A4
 * rather than growing a second way to approve things.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ListingsMasterPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await currentStaff();
  if (!session.ok) redirect("/login");
  if (!can(session.staff.level, "listings.edit")) redirect("/");

  const filters = readListingFilters(searchParams);
  const pageNo = Math.max(1, Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) || 1);

  const [page, options] = await Promise.all([listingsMasterPage(filters, pageNo), listingFilterOptions()]);

  return (
    <ListingsMaster
      rows={page.rows}
      total={page.total}
      counts={page.counts}
      page={page.page}
      pageSize={page.pageSize}
      filters={filters}
      options={options}
      canEdit={can(session.staff.level, "listings.edit")}
      siteUrl={publicEnv.appUrl || "http://localhost:3000"}
    />
  );
}
