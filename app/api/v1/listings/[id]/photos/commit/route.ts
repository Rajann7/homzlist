import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getListingForViewer } from "@/lib/listings/service";
import { commitPhotos, listPhotos } from "@/lib/listings/photos";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/listings/:id/photos/commit (Doc7 §49) — attach uploaded objects
 * and enqueue the image job (WebP variants, EXIF strip, watermark).
 *
 * The client tells us WHICH keys it uploaded; it cannot invent one for another
 * listing because keys are minted per-listing by presign and re-checked here.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`photo-commit:${claims.sub}`, 200, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const listing = await getListingForViewer(params.id, claims.sub);
  if (!listing || listing.profile_id !== claims.sub) return fail("NOT_FOUND");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const keys: string[] = Array.isArray(body.keys) ? body.keys.filter((k: unknown) => typeof k === "string").slice(0, 20) : [];
  if (!keys.length) return fail("VALIDATION_ERROR", { field: "keys" });

  // A key must belong to THIS listing's prefix — otherwise a crafted commit
  // could attach an object uploaded against a different listing.
  const prefix = `listings/${params.id}/`;
  if (keys.some((k) => !k.startsWith(prefix))) return fail("VALIDATION_ERROR", { field: "keys" });

  const result = await commitPhotos(claims.sub, params.id, keys, Array.isArray(body.altTexts) ? body.altTexts : []);
  return ok({
    photos: await listPhotos(params.id),
    queued: result.queued,
    added: result.added,
    // Files the server refused after inspecting the actual bytes — the grid
    // shows these as failed tiles with a retry.
    rejected: result.rejected.length,
  });
}
