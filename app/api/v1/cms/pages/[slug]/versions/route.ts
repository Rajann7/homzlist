import { ok } from "@/lib/api";
import { getLegalVersions } from "@/lib/legal/service";

/** GET /api/v1/cms/pages/:slug/versions — behind "View previous versions". */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  return ok({ versions: await getLegalVersions(params.slug) });
}
