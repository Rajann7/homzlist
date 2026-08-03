import { BlogList } from "@/components/blog/BlogList";
import { listBlog } from "@/lib/blog/service";

export const metadata = { title: "Blog" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SellerBlogPage() {
  const view = await listBlog();
  return (
    <BlogList initial={view.posts} categories={view.categories} featured={view.featured} initialCursor={view.nextCursor} />
  );
}
