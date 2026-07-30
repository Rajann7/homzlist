import { ok } from "@/lib/api";
import { getBlogList } from "@/lib/blog/service";

/**
 * GET /api/v1/blog[?category=&offset=] (Doc7 §12 #177) — the blog list: featured
 * hero, a page of rows, the category chips, and whether Load more has anything
 * left. Public.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  return ok(await getBlogList({ category, offset: Number.isFinite(offset) ? offset : 0 }));
}
