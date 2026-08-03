import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getHelpArticle, visitorKey } from "@/lib/help/service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clientIp } from "@/lib/auth/rate-limit";

/**
 * GET /api/v1/help/articles/:slug — the article reader. Guest-readable.
 *
 * A signed-out reader gets a hashed visitor key (ip + user-agent) rather than a
 * cookie, so "you already voted" survives a refresh without the article page
 * setting a tracking cookie on a page a crawler also fetches.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const claims = await getCurrentUser();
  const article = await getHelpArticle(params.slug, {
    profileId: claims?.sub ?? null,
    visitorKey: claims ? null : visitorKey(clientIp(req.headers), req.headers.get("user-agent") ?? ""),
  });
  if (!article) return fail("NOT_FOUND");
  return ok(article);
}
