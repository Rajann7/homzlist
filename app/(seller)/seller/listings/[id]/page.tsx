import { ListingDetail } from "@/components/listings/ListingDetail";

/** P4 — listing detail (seller view; owner sees manage actions). */
export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ListingDetail id={params.id} />;
}
