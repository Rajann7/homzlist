import { ok, fail } from "@/lib/api";
import { getHelpCategory } from "@/lib/help/service";

/** GET /api/v1/help/categories/:slug — the accordion screen's articles. */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const view = await getHelpCategory(params.slug);
  if (!view) return fail("NOT_FOUND");
  return ok(view);
}
