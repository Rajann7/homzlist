import { ok, fail } from "@/lib/api";
import { getLegalVersions } from "@/lib/legal/service";

/**
 * GET /api/v1/cms/pages/:slug/versions (Doc7 §12 #175) — the archive behind
 * "View previous versions" on every legal reader. Public: a policy's history is
 * part of the policy.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const data = await getLegalVersions(params.slug);
  if (!data) return fail("NOT_FOUND");
  return ok(data);
}
