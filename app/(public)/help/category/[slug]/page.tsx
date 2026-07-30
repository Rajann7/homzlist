import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpCategoryView } from "@/components/help/HelpCategoryView";
import { getHelpCategory } from "@/lib/help/service";
import { siteUrl } from "@/lib/seo/schema";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const cat = await getHelpCategory(params.slug);
  if (!cat) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: `${cat.title} — Help`,
    description: `${cat.articles.length} answers about ${cat.title.toLowerCase()} on HomzList.`,
    alternates: { canonical: `${siteUrl()}/help/category/${cat.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function PublicHelpCategoryPage({ params }: { params: { slug: string } }) {
  const cat = await getHelpCategory(params.slug);
  if (!cat) notFound();
  return <HelpCategoryView title={cat.title} articles={cat.articles} supportHref="/login" />;
}
