import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalReader } from "@/components/legal/LegalReader";
import { getLegalPage, getLegalIndex, getGrievanceOfficer } from "@/lib/legal/service";
import { toPlainText } from "@/lib/content/markdown";
import { siteUrl } from "@/lib/seo/schema";

/**
 * /legal/:slug — a legal page, public and indexable. `?version=` opens an
 * archived version, which is noindex: the canonical page is the current one and
 * an old Terms must never outrank it.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateStaticParams() {
  return (await getLegalIndex()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params, searchParams }: { params: { slug: string }; searchParams: { version?: string } },
): Promise<Metadata> {
  const page = await getLegalPage(params.slug, searchParams.version ?? null);
  if (!page) return { title: "Not found", robots: { index: false, follow: false } };
  const url = `${siteUrl()}/legal/${page.slug}`;
  const archived = Boolean(page.isArchivedVersion);
  return {
    title: { absolute: page.seoTitle ?? `${page.title} — HomzList` },
    description: page.seoDescription ?? toPlainText(page.bodyMd, 155),
    alternates: { canonical: url },
    robots: archived ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title: page.title, description: page.seoDescription ?? undefined, url, type: "article", siteName: "HomzList" },
  };
}

export default async function PublicLegalPage(
  { params, searchParams }: { params: { slug: string }; searchParams: { version?: string } },
) {
  const page = await getLegalPage(params.slug, searchParams.version ?? null);
  if (!page) notFound();
  const officer = page.reader === "grievance" ? await getGrievanceOfficer() : null;
  return <LegalReader page={page} officer={officer} guest />;
}
