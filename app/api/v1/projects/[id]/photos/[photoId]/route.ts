import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { deletePhoto, listPhotos, PROJECT_PHOTOS } from "@/lib/listings/photos";
import { rateLimit } from "@/lib/auth/rate-limit";

/** DELETE one photo from a project gallery (per-tile delete in the grid). */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; photoId: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.photoId)) return fail("NOT_FOUND");

  const limited = await rateLimit(`project-photo-delete:${claims.sub}`, 200, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  // Scoped by BOTH project and owner inside `deletePhoto`, so a photo id from
  // somewhere else matches no row rather than being deleted.
  const removed = await deletePhoto(claims.sub, params.id, params.photoId, PROJECT_PHOTOS);
  if (!removed) return fail("NOT_FOUND");
  return ok({ photos: await listPhotos(params.id, PROJECT_PHOTOS) });
}
