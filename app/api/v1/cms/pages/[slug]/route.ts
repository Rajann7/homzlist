import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getLegalPage, getGrievanceOfficer } from "@/lib/legal/service";

/**
 * GET /api/v1/cms/pages/:slug[?version=1.0] (Doc7 §173) — a legal page, current
 * or archived. Public and guest-readable by design (Doc10: "Guest-accessible +
 * SEO"), so there is no session check here on purpose.
 */
export const dynamic = "force-dynamic";
// force-dynamic alone leaves the Supabase reads in Next's persistent DATA cache,
// which outlives a restart — an admin flipping maintenance on, or republishing a
// legal page, would never reach this endpoint. (memory: nextjs-data-cache-ssr-staleness)
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const version = req.nextUrl.searchParams.get("version");
  const page = await getLegalPage(params.slug, version);
  if (!page) return fail("NOT_FOUND");
  return ok({
    page,
    officer: page.reader === "grievance" ? await getGrievanceOfficer() : null,
  });
}
