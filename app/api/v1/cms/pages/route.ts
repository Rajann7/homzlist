import { ok } from "@/lib/api";
import { getLegalIndex } from "@/lib/legal/service";

/** GET /api/v1/cms/pages (Doc7 §173) — the Legal index rows. Public. */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET() {
  return ok({ pages: await getLegalIndex() });
}
