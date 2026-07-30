import { BlogPostPage } from "@/components/blog/BlogPostPage";

export const metadata = { title: "Blog" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerBlogPostRoute({ params }: { params: { slug: string } }) {
  return <BlogPostPage slug={params.slug} guest={false} />;
}
