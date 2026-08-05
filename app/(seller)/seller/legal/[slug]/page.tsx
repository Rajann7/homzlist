import { notFound } from "next/navigation";
import { LegalReader } from "@/components/legal/LegalReader";
import { getLegalPage, getGrievanceOfficer } from "@/lib/legal/service";

/** A legal page inside the signed-in shell — same reader, seller header. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const page = await getLegalPage(params.slug);
  return { title: page?.title ?? "Legal" };
}

export default async function SellerLegalPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ version?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const page = await getLegalPage(params.slug, searchParams.version ?? null);
  if (!page) notFound();
  const officer = page.reader === "grievance" ? await getGrievanceOfficer() : null;
  return <LegalReader page={page} officer={officer} />;
}
