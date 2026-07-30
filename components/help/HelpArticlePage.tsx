import { notFound } from "next/navigation";
import { HelpArticleView } from "./HelpArticleView";
import { getHelpArticle } from "@/lib/help/service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { renderBody } from "@/lib/legal/markdown";
import { formatDate } from "@/lib/legal/service";
import { siteUrl } from "@/lib/seo/schema";

/** Server half of the article reader, shared by the public and seller hosts. */
export async function HelpArticlePage({ slug, base = "" }: { slug: string; base?: string }) {
  const claims = await getCurrentUser();
  const article = await getHelpArticle(slug, claims?.sub ?? null);
  if (!article) notFound();

  return (
    <HelpArticleView
      slug={article.slug}
      title={article.title}
      metaLine={`Updated ${formatDate(article.updatedAt)} · ${article.readMinutes} min read`}
      related={article.related.map((r) => ({ slug: r.slug, title: r.title }))}
      base={base}
      supportHref={claims ? `${base}/support/new` : "/login"}
      shareUrl={`${siteUrl()}/help/a/${article.slug}`}
      initialVerdict={article.myVerdict}
    >
      {renderBody(article.body)}
    </HelpArticleView>
  );
}
