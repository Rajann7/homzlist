import type { Metadata } from "next";
import { BlogPostPage } from "@/components/blog/BlogPostPage";
import { getBlogPost, getBlogSlugs } from "@/lib/blog/service";
import { siteUrl } from "@/lib/seo/schema";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateStaticParams() {
  return (await getBlogSlugs()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getBlogPost(params.slug);
  if (!post) return { title: "Not found", robots: { index: false, follow: false } };
  const url = `${siteUrl()}/blog/${post.slug}`;
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? post.excerpt ?? undefined,
      url,
      type: "article",
      publishedTime: post.publishedAt,
      authors: [post.authorName],
    },
  };
}

export default function PublicBlogPostRoute({ params }: { params: { slug: string } }) {
  return <BlogPostPage slug={params.slug} guest />;
}
