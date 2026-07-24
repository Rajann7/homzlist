import { FeedHome } from "@/components/feed/FeedHome";

/**
 * Seller home (seller.homzlist.com/) — the P2 feed. Owner/broker see the
 * Property/Requirement feed; a builder sees their dashboard (own project stats +
 * matched requirements, no foreign listings). Server-decided by role.
 */
export const dynamic = "force-dynamic";

export default function SellerHomePage() {
  return <FeedHome />;
}
