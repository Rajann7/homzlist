import { notFound } from "next/navigation";
import { BlogPostView } from "./BlogPostView";
import { AreaBlock } from "./AreaBlock";
import { getBlogPost, bumpBlogView } from "@/lib/blog/service";
import { getAreaBlock } from "@/lib/blog/area-block";
import { renderBody } from "@/lib/legal/markdown";
import { siteUrl } from "@/lib/seo/schema";

/** Server half of the blog post, shared by the public and seller hosts. */
export async function BlogPostPage({ slug, guest, base = "" }: { slug: string; guest: boolean; base?: string }) {
  const post = await getBlogPost(slug);
  if (!post) notFound();

  // Views are only counted on the public (guest) surface; an author re-reading
  // their own post inside the app would otherwise inflate the number.
  if (guest) void bumpBlogView(slug);

  const area = await getAreaBlock(post.tags);
  const url = `${siteUrl()}/blog/${post.slug}`;

  return (
    <BlogPostView
      post={post}
      related={post.related}
      guest={guest}
      base={base}
      shareUrl={url}
      areaBlock={area ? <AreaBlock block={area} base={base} /> : undefined}
    >
      {renderBody(post.body)}
    </BlogPostView>
  );
}
