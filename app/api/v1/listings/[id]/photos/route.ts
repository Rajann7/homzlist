import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getListingForViewer } from "@/lib/listings/service";
import { listPhotos, reorderPhotos, setPhotoLabel, photoCapacity } from "@/lib/listings/photos";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * GET   /api/v1/listings/:id/photos — photos in display order (0 = cover).
 * PATCH — reorder / set cover (Doc2 §5.2: first photo IS the cover).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const claims = await getCurrentUser();
  // Photos follow the listing's own visibility (state-access matrix).
  const listing = await getListingForViewer(params.id, claims?.sub ?? null);
  if (!listing) return fail("NOT_FOUND");

  // The owner's grid shows a "6 / 10" counter (designs/P5 S5). The cap is the
  // server's per-role answer, so it is sent with the photos rather than being
  // re-derived — and only to the owner, who is the only one who can add any.
  const isOwner = claims?.sub === listing.profile_id;
  const capacity = isOwner ? await photoCapacity(claims!.sub, params.id) : null;
  return ok({ photos: await listPhotos(params.id), capacity });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`photo-reorder:${claims.sub}`, 200, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const listing = await getListingForViewer(params.id, claims.sub);
  if (!listing || listing.profile_id !== claims.sub) return fail("NOT_FOUND");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  // "Add label" from the tile sheet (P5 S5) — the caption shown under a photo
  // and used as its alt text. Scoped to this listing, which the ownership check
  // above already established.
  if (typeof body.photoId === "string" && body.altText !== undefined) {
    if (!UUID_RE.test(body.photoId)) return fail("NOT_FOUND");
    const label = typeof body.altText === "string" ? body.altText.trim().slice(0, 120) : "";
    await setPhotoLabel(claims.sub, params.id, body.photoId, label || null);
    return ok({ photos: await listPhotos(params.id) });
  }

  // Bounded to the photo cap — an unbounded array would let a single call
  // rewrite arbitrarily many rows.
  const order: string[] = Array.isArray(body.order)
    ? body.order.filter((x: unknown) => typeof x === "string").slice(0, 30)
    : [];
  if (!order.length) return fail("VALIDATION_ERROR", { field: "order" });

  await reorderPhotos(claims.sub, params.id, order);
  return ok({ photos: await listPhotos(params.id) });
}
