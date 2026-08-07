import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProject } from "@/lib/listings/projects";
import { commitPhotos, listPhotos, PROJECT_PHOTOS } from "@/lib/listings/photos";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/projects/:id/photos/commit — attach the uploaded objects.
 *
 * The client says WHICH keys it uploaded; it cannot invent one for another
 * project, because keys are minted per-project by presign and the prefix is
 * re-checked here. `commitPhotos` then reads the real bytes and refuses
 * anything that isn't a decodable image before it can be served.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`project-photo-commit:${claims.sub}`, 200, 3600, "photo_upload");
  if (!limited.allowed) return fail("RATE_LIMITED");

  const project = await getProject(params.id, claims.sub);
  if (!project || !project.isOwner) return fail("NOT_FOUND");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const keys: string[] = Array.isArray(body.keys) ? body.keys.filter((k: unknown) => typeof k === "string").slice(0, 20) : [];
  if (!keys.length) return fail("VALIDATION_ERROR", { field: "keys" });

  const prefix = `projects/${params.id}/`;
  if (keys.some((k) => !k.startsWith(prefix))) return fail("VALIDATION_ERROR", { field: "keys" });

  const result = await commitPhotos(claims.sub, params.id, keys, Array.isArray(body.altTexts) ? body.altTexts : [], PROJECT_PHOTOS);
  return ok({
    photos: await listPhotos(params.id, PROJECT_PHOTOS),
    queued: result.queued,
    added: result.added,
    rejected: result.rejected.length,
  });
}
