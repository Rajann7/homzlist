import { notFound } from "next/navigation";
import { LegalReader } from "@/components/legal/LegalReader";
import { getLegalPage, getGrievanceOfficer } from "@/lib/legal/service";

/** A legal page inside the signed-in shell — same reader, seller header. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const page = await getLegalPage(params.slug);
  return { title: page?.title ?? "Legal" };
}

export default async function SellerLegalPage(
  { params, searchParams }: { params: { slug: string }; searchParams: { version?: string } },
) {
  const page = await getLegalPage(params.slug, searchParams.version ?? null);
  if (!page) notFound();
  const officer = page.reader === "grievance" ? await getGrievanceOfficer() : null;
  return <LegalReader page={page} officer={officer} />;
}
