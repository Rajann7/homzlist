import { ListingInsights } from "@/components/listings/ListingInsights";

/** P9 S5 — Listing insights (owner-only; the API 404s anything else). */
export const metadata = { title: "Listing insights" };
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <ListingInsights id={params.id} />;
}
