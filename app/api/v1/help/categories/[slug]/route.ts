import { ok, fail } from "@/lib/api";
import { getHelpCategory } from "@/lib/help/service";

/** GET /api/v1/help/categories/:slug — one category's accordion (P12 S1 detail). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const data = await getHelpCategory(params.slug);
  if (!data) return fail("NOT_FOUND");
  return ok(data);
}
