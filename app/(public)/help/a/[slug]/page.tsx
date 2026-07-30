import type { Metadata } from "next";
import { HelpArticlePage } from "@/components/help/HelpArticlePage";
import { getHelpArticle } from "@/lib/help/service";
import { siteUrl } from "@/lib/seo/schema";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = await getHelpArticle(params.slug);
  if (!a) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: a.title,
    description: a.answer,
    alternates: { canonical: `${siteUrl()}/help/a/${a.slug}` },
    robots: { index: true, follow: true },
    openGraph: { title: a.title, description: a.answer, url: `${siteUrl()}/help/a/${a.slug}`, type: "article" },
  };
}

export default function PublicHelpArticleRoute({ params }: { params: { slug: string } }) {
  return <HelpArticlePage slug={params.slug} />;
}
