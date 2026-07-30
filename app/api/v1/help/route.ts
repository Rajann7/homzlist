import { ok } from "@/lib/api";
import { getHelpHome, searchHelp } from "@/lib/help/service";

/**
 * GET /api/v1/help[?q=…] (Doc7 §12 #178) — the help centre home (categories with
 * live article counts + popular articles), or search results when q is present.
 * Public.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q) return ok({ query: q, results: await searchHelp(q) });
  return ok(await getHelpHome());
}
