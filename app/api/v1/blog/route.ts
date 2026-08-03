import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { listBlog } from "@/lib/blog/service";

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
  const p = req.nextUrl.searchParams;
  return ok(await listBlog({ category: p.get("category"), cursor: p.get("cursor") }));
}
