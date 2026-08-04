import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCollection, deleteCollection } from "@/lib/profile/featured";
import { featuredItemDTO } from "@/lib/listings/dto";

/**
 * GET    /api/v1/profile/featured/:id — what's inside one circle (tapping it).
 * DELETE /api/v1/profile/featured/:id — remove the collection.
 *
 * Both are scoped to the session user in the query itself, so another profile's
 * collection is a 404 rather than a 403 — no ids to probe.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const collection = await getCollection(claims.sub, params.id);
  if (!collection) return fail("NOT_FOUND");

  return ok({
    id: collection.id,
    name: collection.name,
    items: collection.listings.map(featuredItemDTO),
  });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const removed = await deleteCollection(claims.sub, params.id);
  if (!removed) return fail("NOT_FOUND");
  return ok({ removed: true });
}
