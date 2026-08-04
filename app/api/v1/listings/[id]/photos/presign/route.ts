import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getListingForViewer } from "@/lib/listings/service";
import { photoCapacity } from "@/lib/listings/photos";
import { createUploadGrant } from "@/lib/storage";
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from "@/lib/image-pipeline";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/listings/:id/photos/presign (Doc7 §48) — grant direct-to-R2
 * upload URLs so the bytes never transit our server.
 *
 * The grant is the security boundary: the key is server-generated (never the
 * user's filename), the content-type is pinned into the signature, and the
 * per-role photo cap is enforced HERE, not when the client feels like stopping
 * (Doc2 §5.2 — Owner/Broker 10, Builder unlimited).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`photo-presign:${claims.sub}`, 200, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  // Ownership: you may only add photos to your OWN listing.
  const listing = await getListingForViewer(params.id, claims.sub);
  if (!listing || listing.profile_id !== claims.sub) return fail("NOT_FOUND");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const files: { contentType: string; size?: number }[] = Array.isArray(body.files) ? body.files.slice(0, 20) : [];
  if (!files.length) return fail("VALIDATION_ERROR", { field: "files" });

  const cap = await photoCapacity(claims.sub, params.id);
  if (cap.remaining !== null && files.length > cap.remaining) {
    return fail("VALIDATION_ERROR", { code: "PHOTO_LIMIT", max: cap.max, remaining: cap.remaining });
  }

  const grants = [];
  for (const f of files) {
    if (!ALLOWED_IMAGE_MIME.includes(f.contentType as (typeof ALLOWED_IMAGE_MIME)[number])) {
      return fail("FILE_TYPE_BLOCKED");
    }
    if (typeof f.size === "number" && f.size > MAX_IMAGE_BYTES) return fail("FILE_TOO_LARGE");
    grants.push(await createUploadGrant({ prefix: `listings/${params.id}`, contentType: f.contentType }));
  }

  return ok({ grants, maxBytes: MAX_IMAGE_BYTES });
}
