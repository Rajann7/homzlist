import { ok } from "@/lib/api";
import { getLegalVersions } from "@/lib/legal/service";

/** GET /api/v1/cms/pages/:slug/versions — behind "View previous versions". */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  return ok({ versions: await getLegalVersions(params.slug) });
}
