import { ListingDetail } from "@/components/listings/ListingDetail";

/** P4 — listing detail (seller view; owner sees manage actions). */
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <ListingDetail id={params.id} />;
}
