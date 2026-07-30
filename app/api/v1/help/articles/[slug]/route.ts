import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getHelpArticle } from "@/lib/help/service";

/**
 * GET /api/v1/help/articles/:slug — the article reader. Public; when a session is
 * present the response also carries this user's own helpful/not-helpful verdict
 * so the feedback card comes back already answered.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const claims = await getCurrentUser();
  const article = await getHelpArticle(params.slug, claims?.sub ?? null);
  if (!article) return fail("NOT_FOUND");
  return ok(article);
}
