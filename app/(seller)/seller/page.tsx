import { FeedHome } from "@/components/feed/FeedHome";
import { getFeedInitial } from "@/lib/feed/initial";

/**
 * Seller home (seller.homzlist.com/) — the P2 feed. Owner/broker see the
 * Property/Requirement feed; a builder sees their dashboard (own project stats +
 * matched requirements, no foreign listings). Server-decided by role.
 *
 * Same server-rendered first paint as the public feed (lib/feed/initial); it
 * returns nothing for a builder, whose screen is the dashboard, not the rails.
 */
export const dynamic = "force-dynamic";
// Doc8: force-dynamic alone still lets the Data cache serve one visitor's rows
// to everyone — an SSR page reading Supabase needs this too.
export const fetchCache = "force-no-store";

export default async function SellerHomePage() {
  return <FeedHome initial={await getFeedInitial()} />;
}
