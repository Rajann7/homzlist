import type { Metadata } from "next";
import { BlogList } from "@/components/blog/BlogList";
import { getBlogList } from "@/lib/blog/service";
import { siteUrl } from "@/lib/seo/schema";

/** P12 S4 — the blog on the public host. SSR, guest-readable, indexable. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides on buying, renting and the Rajkot property market — paperwork, areas, RERA, carpet area and how to list well on HomzList.",
  alternates: { canonical: `${siteUrl()}/blog` },
  robots: { index: true, follow: true },
};

export default async function PublicBlogPage() {
  const { featured, posts, categories, hasMore } = await getBlogList();
  return (
    <BlogList featured={featured} initialPosts={posts} initialHasMore={hasMore} categories={categories} guest />
  );
}
