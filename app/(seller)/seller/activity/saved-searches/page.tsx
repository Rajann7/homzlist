import { SavedSearches } from "@/components";

/** P10 S2b — Saved searches. Reached from Your activity → Searches. */
export const metadata = { title: "Saved searches" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerSavedSearchesPage() {
  return <SavedSearches />;
}
