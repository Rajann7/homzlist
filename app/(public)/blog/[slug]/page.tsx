import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPost } from "@/components/blog/BlogPost";
import { getBlogPost, allBlogSlugs } from "@/lib/blog/service";
import { toPlainText } from "@/lib/content/markdown";
import { siteUrl } from "@/lib/seo/schema";

/**
 * /blog/:slug — one post. Carries full Article structured data, because a blog
 * without it is a blog Google has to guess about.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateStaticParams() {
  return (await allBlogSlugs()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getBlogPost(params.slug);
  if (!post) return { title: "Not found", robots: { index: false, follow: false } };
  const url = `${siteUrl()}/blog/${post.slug}`;
  const description = post.seoDescription ?? toPlainText(post.excerpt ?? post.bodyMd, 155);
  return {
    title: { absolute: post.seoTitle ?? `${post.title} — HomzList` },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    keywords: post.tags,
    authors: [{ name: post.authorName }],
    openGraph: {
      title: post.title,
      description,
      url,
      type: "article",
      siteName: "HomzList",
      publishedTime: post.publishedAt,
      tags: post.tags,
      images: [{
        url: `${siteUrl()}/api/og?title=${encodeURIComponent(post.title)}&subtitle=${encodeURIComponent(`${post.readMinutes} min read · HomzList Blog`)}`,
        width: 1200, height: 630,
      }],
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

export default async function PublicBlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  if (!post) notFound();

  const url = `${siteUrl()}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription,
    datePublished: post.publishedAt,
    author: { "@type": "Organization", name: post.authorName },
    publisher: { "@type": "Organization", name: "HomzList", url: siteUrl() },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: post.tags.join(", "),
    articleSection: post.categoryLabel,
    inLanguage: "en-IN",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogPost post={post} guest />
    </>
  );
}
