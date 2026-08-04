import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { deleteDraft } from "@/lib/listings/service";

/** DELETE /api/v1/listings/draft/:id (Doc7 §46) — ownership-scoped delete. */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const removed = await deleteDraft(params.id, claims.sub);
  // Not yours (or already gone) → 404, never a false "deleted".
  if (!removed) return fail("NOT_FOUND");
  return ok({ deleted: true });
}
