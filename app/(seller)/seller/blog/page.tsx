import { BlogList } from "@/components/blog/BlogList";
import { getBlogList } from "@/lib/blog/service";

/** P12 S4 — the blog inside the app. Same list, user chrome. */
export const metadata = { title: "Blog" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerBlogPage() {
  const { featured, posts, categories, hasMore } = await getBlogList();
  return (
    <BlogList
      featured={featured}
      initialPosts={posts}
      initialHasMore={hasMore}
      categories={categories}
      guest={false}
    />
  );
}
