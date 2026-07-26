import { Suspense } from "react";
import { SearchResults } from "@/components/search/SearchResults";

/**
 * P3 S2 on the public host (guest).
 *
 * Doc3 §4: "filter params = noindex,follow + canonical". A results URL is a
 * query permutation, not a landing page — indexing it would spawn thousands of
 * near-duplicates. `follow` keeps the crawler walking through to the canonical
 * landing pages the results link to.
 */
export const metadata = {
  title: "Search results",
  robots: { index: false, follow: true },
};

export default function PublicSearchResultsPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults isGuest />
    </Suspense>
  );
}
