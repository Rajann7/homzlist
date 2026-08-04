import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getBlogPost, recordBlogRead } from "@/lib/blog/service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { visitorKey } from "@/lib/help/service";
import { clientIp } from "@/lib/auth/rate-limit";

/** GET /api/v1/blog/:slug — one post, its related rail, and a counted read. */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getBlogPost(params.slug);
  if (!post) return fail("NOT_FOUND");

  const claims = await getCurrentUser();
  await recordBlogRead(params.slug, {
    profileId: claims?.sub ?? null,
    visitorKey: claims ? null : visitorKey(clientIp(req.headers), req.headers.get("user-agent") ?? ""),
  });
  return ok(post);
}
