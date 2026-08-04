import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { deletePhoto, listPhotos } from "@/lib/listings/photos";
import { rateLimit } from "@/lib/auth/rate-limit";

/** DELETE a single photo (per-tile delete in the grid — Doc2 §5.2). */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; photoId: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.photoId)) return fail("NOT_FOUND");

  const limited = await rateLimit(`photo-delete:${claims.sub}`, 200, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  // Scoped by BOTH listing and owner, so a photo id from elsewhere can't be hit.
  const removed = await deletePhoto(claims.sub, params.id, params.photoId);
  if (!removed) return fail("NOT_FOUND");
  return ok({ photos: await listPhotos(params.id) });
}
