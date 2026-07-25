import { ListingDetail } from "@/components/listings/ListingDetail";

/**
 * P4 — public property detail (homzlist.com/property/:id).
 * Guests may view LIVE listings; anything else 404s via the server's
 * state-access matrix (Doc2 §5.4).
 */
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  // The public host is the guest surface — middleware strips any session before
  // this renders, so every viewer here is a guest. Actions gate to login.
  return <ListingDetail id={params.id} isGuest />;
}
