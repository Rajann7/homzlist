import type { Metadata } from "next";
import { LegalPageView } from "@/components/legal/LegalPageView";
import { getLegalPage, getLegalIndex } from "@/lib/legal/service";
import { siteUrl } from "@/lib/seo/schema";

/**
 * P12 S3 — a legal document on the public host: SSR, guest-readable, indexable,
 * with a canonical that always points at the current version (an archived
 * ?version= read is noindex so old text can't outrank the live policy).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateStaticParams() {
  return (await getLegalIndex()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { version?: string };
}): Promise<Metadata> {
  const page = await getLegalPage(params.slug);
  if (!page) return { title: "Not found", robots: { index: false, follow: false } };
  const archived = Boolean(searchParams.version && searchParams.version !== page.version);
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? undefined,
    alternates: { canonical: `${siteUrl()}/legal/${page.slug}` },
    robots: archived ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: page.seoTitle ?? page.title,
      description: page.seoDescription ?? undefined,
      url: `${siteUrl()}/legal/${page.slug}`,
      type: "article",
    },
  };
}

export default function PublicLegalPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { version?: string };
}) {
  return <LegalPageView slug={params.slug} version={searchParams.version} guest />;
}
