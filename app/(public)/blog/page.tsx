import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogList } from "@/components/blog/BlogList";
import { listBlog } from "@/lib/blog/service";
import { siteUrl } from "@/lib/seo/schema";
import { flagEnabled } from "@/lib/system/flags";

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
  // A22 Feature flags → Blog. Off = the section is retired (404), matching the
  // API gate. Default-on, so nothing changes while the flag is enabled.
  if (!(await flagEnabled("blog"))) notFound();
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
