import { ok } from "@/lib/api";
import { getHelpIndex } from "@/lib/help/service";

/**
 * GET /api/v1/help (Doc7 §178) — the Help centre index: the 8 category tiles
 * with their live article counts, the 6 search chips, and the popular list.
 * Guest-readable; nothing here depends on a session.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET() {
  return ok(await getHelpIndex());
}
