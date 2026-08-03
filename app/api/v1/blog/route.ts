import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { listBlog } from "@/lib/blog/service";

/**
 * GET /api/v1/blog?category=&cursor= (Doc7 §177) — the blog list, its category
 * chips and the Load more cursor. Public.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return ok(await listBlog({ category: p.get("category"), cursor: p.get("cursor") }));
}
