import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { previewProjectCard } from "@/lib/feed/service";

/**
 * GET /api/v1/projects/:id/card — this project as the FEED CARD renders it.
 *
 * The builder's counterpart to `/listings/:id/card`. The project preview screen
 * renders the same `ProjectCard` the feed uses off this payload, so "this is how
 * your project appears in the feed" cannot quietly stop being true the next time
 * the card changes.
 *
 * Owner-only, and NOT_FOUND (never FORBIDDEN) for anyone else: a project sits in
 * `pending_review` right after posting, and a distinct error code would confirm
 * that the id exists.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const card = await previewProjectCard(params.id, claims.sub);
  if (!card) return fail("NOT_FOUND");
  return ok({ card });
}
