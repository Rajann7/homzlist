import { ok, fail } from "@/lib/api";
import { getLegalPage } from "@/lib/legal/service";

/**
 * GET /api/v1/cms/pages/:slug (Doc7 §12 #173) — one legal/CMS document, with its
 * version, effective date and the Doc10 placeholders already substituted.
 * Public; an unpublished page is a 404, not a 403.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const page = await getLegalPage(params.slug);
  if (!page) return fail("NOT_FOUND");
  return ok(page);
}
