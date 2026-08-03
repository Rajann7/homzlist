import type { Metadata } from "next";
import { BlogList } from "@/components/blog/BlogList";
import { listBlog } from "@/lib/blog/service";
import { siteUrl } from "@/lib/seo/schema";

/**
 * /blog — the public blog index. SSR so the crawler and the human see the same
 * first page; the chip filter and Load more take over on the client.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: { absolute: "HomzList Blog — buying, renting and the Rajkot market" },
  description:
    "Practical guides for buying and renting property in Rajkot: paperwork, RERA, carpet area, area comparisons and listing tips — written by people who do this every day.",
  alternates: { canonical: `${siteUrl()}/blog` },
  robots: { index: true, follow: true },
};

export default async function PublicBlogPage() {
  const view = await listBlog();
  return (
    <BlogList
      initial={view.posts}
      categories={view.categories}
      featured={view.featured}
      initialCursor={view.nextCursor}
      guest
    />
  );
}
