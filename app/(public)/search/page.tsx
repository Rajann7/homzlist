import { SearchHome } from "@/components/search/SearchHome";

/**
 * P3 S1 on the PUBLIC host. The public host is the guest surface (middleware
 * strips any session on it — Doc6 §4), so this is always the logged-out view:
 * no recents, and gated actions bounce to login on the seller subdomain.
 */
export const metadata = {
  title: "Search",
  description: "Search flats, plots, shops and projects by area, city or society.",
  // The search UI itself has nothing to index — the LANDING pages are the
  // indexable surface (Doc3 §4). Follow, so crawlers still traverse to them.
  robots: { index: false, follow: true },
};

export default function PublicSearchPage() {
  return <SearchHome isGuest />;
}
