import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProject } from "@/lib/listings/projects";
import { listPhotos, reorderPhotos, setPhotoLabel, photoCapacity, PROJECT_PHOTOS } from "@/lib/listings/photos";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * GET   /api/v1/projects/:id/photos — the scheme's gallery, in display order
 *       (0 = cover). Migration 0075; before it a project had one `cover_url`
 *       and the detail hero was handed an empty array.
 * PATCH — reorder / set cover / label, builder-only on their own project.
 *
 * Visibility is the PROJECT's: `getProject` applies the state-access matrix, so
 * a scheme still in review shows its photos to nobody but its builder.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const claims = await getCurrentUser();
  const project = await getProject(params.id, claims?.sub ?? null);
  if (!project) return fail("NOT_FOUND");

  // The "6 / ∞" counter is the server's per-role answer and only the owner can
  // act on it, so only the owner is told.
  const capacity = project.isOwner ? await photoCapacity(claims!.sub, params.id, PROJECT_PHOTOS) : null;
  return ok({ photos: await listPhotos(params.id, PROJECT_PHOTOS), capacity });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`project-photo-reorder:${claims.sub}`, 200, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const project = await getProject(params.id, claims.sub);
  if (!project || !project.isOwner) return fail("NOT_FOUND");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  if (typeof body.photoId === "string" && body.altText !== undefined) {
    if (!UUID_RE.test(body.photoId)) return fail("NOT_FOUND");
    const label = typeof body.altText === "string" ? body.altText.trim().slice(0, 120) : "";
    await setPhotoLabel(claims.sub, params.id, body.photoId, label || null, PROJECT_PHOTOS);
    return ok({ photos: await listPhotos(params.id, PROJECT_PHOTOS) });
  }

  // Bounded — an unbounded array would let one call rewrite arbitrarily many rows.
  const order: string[] = Array.isArray(body.order)
    ? body.order.filter((x: unknown) => typeof x === "string").slice(0, 40)
    : [];
  if (!order.length) return fail("VALIDATION_ERROR", { field: "order" });

  await reorderPhotos(claims.sub, params.id, order, PROJECT_PHOTOS);
  return ok({ photos: await listPhotos(params.id, PROJECT_PHOTOS) });
}
