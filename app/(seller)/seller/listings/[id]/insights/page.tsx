import { ListingInsights } from "@/components/listings/ListingInsights";

/** P9 S5 — Listing insights (owner-only; the API 404s anything else). */
export const metadata = { title: "Listing insights" };
export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ListingInsights id={params.id} />;
}
