import { ok, fail } from "@/lib/api";
import { getHelpCategory } from "@/lib/help/service";

/** GET /api/v1/help/categories/:slug — the accordion screen's articles. */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const view = await getHelpCategory(params.slug);
  if (!view) return fail("NOT_FOUND");
  return ok(view);
}
