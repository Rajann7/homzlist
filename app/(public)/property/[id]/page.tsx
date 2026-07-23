import { ListingDetail } from "@/components/listings/ListingDetail";

/**
 * P4 — public property detail (homzlist.com/property/:id).
 * Guests may view LIVE listings; anything else 404s via the server's
 * state-access matrix (Doc2 §5.4).
 */
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <ListingDetail id={params.id} />;
}
