import { Suspense } from "react";
import { SearchResults } from "@/components/search/SearchResults";

export const metadata = { title: "Search results", robots: { index: false, follow: false } };

export default function SellerSearchResultsPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults />
    </Suspense>
  );
}
