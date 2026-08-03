import { notFound } from "next/navigation";
import { BlogPost } from "@/components/blog/BlogPost";
import { getBlogPost } from "@/lib/blog/service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  return { title: post?.title ?? "Blog" };
}

export default async function SellerBlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  if (!post) notFound();
  return <BlogPost post={post} />;
}
