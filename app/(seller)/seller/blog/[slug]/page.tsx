import { notFound } from "next/navigation";
import { BlogPost } from "@/components/blog/BlogPost";
import { getBlogPost } from "@/lib/blog/service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getBlogPost(params.slug);
  return { title: post?.title ?? "Blog" };
}

export default async function SellerBlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getBlogPost(params.slug);
  if (!post) notFound();
  return <BlogPost post={post} />;
}
