import { ok, fail } from "@/lib/api";
import { getBlogPost } from "@/lib/blog/service";

/** GET /api/v1/blog/:slug — one published post + its related posts. Public. */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  if (!post) return fail("NOT_FOUND");
  return ok(post);
}
