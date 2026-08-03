import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { searchHelp } from "@/lib/help/service";

/**
 * GET /api/v1/help/search?q= — server-side search across question, answer and
 * the hidden keyword blob. The design's "No articles found for 'xyz'" must be
 * a statement about the whole library, which only the server can make.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return ok({ query: q, results: await searchHelp(q) });
}
