import { AppShell, Header, Wordmark, EmptyState } from "@/components";

/**
 * Seller home (seller.homzlist.com/).
 *
 * This is the FEED and stays a home page. Seller destinations — My Listings,
 * My plan, Payments, Boosts — live in the profile ⋯ menu (Doc4 §62), not here:
 * putting a management dashboard on home was wrong and has been moved.
 *
 * The feed itself lands with the feed module (P2).
 */
export default function SellerHomePage() {
  return (
    <AppShell header={<Header left={<Wordmark />} />}>
      <EmptyState
        title="Your feed is coming"
        subtitle="Properties from your city will appear here. Post one with +, or find your listings under Profile → ⋯"
      />
    </AppShell>
  );
}
