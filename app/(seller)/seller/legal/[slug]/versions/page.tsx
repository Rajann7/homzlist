import { notFound } from "next/navigation";
import { LegalVersions } from "@/components/legal/LegalVersions";
import { getLegalVersions } from "@/lib/legal/service";

/** Version history of a legal document, inside the app. */
export const metadata = { title: "Previous versions" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerLegalVersionsPage({ params }: { params: { slug: string } }) {
  const data = await getLegalVersions(params.slug);
  if (!data) notFound();
  return <LegalVersions slug={params.slug} title={data.title} versions={data.versions} guest={false} />;
}
