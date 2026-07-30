import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalVersions } from "@/components/legal/LegalVersions";
import { getLegalVersions } from "@/lib/legal/service";

/**
 * Version history of a legal document. Not indexed — the live policy is the
 * canonical text and superseded versions must not compete with it in search.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = { title: "Previous versions", robots: { index: false, follow: true } };

export default async function PublicLegalVersionsPage({ params }: { params: { slug: string } }) {
  const data = await getLegalVersions(params.slug);
  if (!data) notFound();
  return <LegalVersions slug={params.slug} title={data.title} versions={data.versions} guest />;
}
