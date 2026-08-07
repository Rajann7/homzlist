import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { listBlog } from "@/lib/blog/service";
import { flagEnabled } from "@/lib/system/flags";

/**
 * GET /api/v1/blog?category=&cursor= (Doc7 §177) — the blog list, its category
 * chips and the Load more cursor. Public.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  // A22 Feature flags → Blog. Off = the blog list is empty for everyone (the
  // section is retired without a deploy). Default-on, so nothing changes while
  // the flag stays enabled.
  if (!(await flagEnabled("blog"))) return ok({ posts: [], categories: [], nextCursor: null });
  const p = req.nextUrl.searchParams;
  return ok(await listBlog({ category: p.get("category"), cursor: p.get("cursor") }));
}
