import { SearchHome } from "@/components/search/SearchHome";

/**
 * P3 S1 on the SELLER host — the authenticated surface. Same screen as the
 * public one, but the session is real here, so recents persist, own listings
 * are excluded server-side and save/inquiry act instead of bouncing to login.
 */
export const metadata = { title: "Search", robots: { index: false, follow: false } };

export default function SellerSearchPage() {
  return <SearchHome />;
}
