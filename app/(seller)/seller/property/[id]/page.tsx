import { ListingDetail } from "@/components/listings/ListingDetail";

/**
 * seller.homzlist.com/property/:id — P4 detail, seller-host alias.
 *
 * The feed, suggested strip, similar-properties rail and search all link to
 * `/property/:id`, and every one of those surfaces renders on the seller host
 * too. Only the public group had this route, so a property card tapped by a
 * logged-in user rewrote to `/seller/property/:id` and 404'd. Same component as
 * the public detail — the server's state-access matrix + number sealing decide
 * what the payload contains, not the host.
 */
export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 return <ListingDetail id={params.id} />;
}
