import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCollections, createCollection, MAX_COLLECTIONS, MAX_ITEMS, NAME_MAX } from "@/lib/profile/featured";

/**
 * GET  /api/v1/profile/featured — the P9 S1 featured circles for the signed-in
 *      user: name, cover and how many of its listings are visible right now.
 * POST /api/v1/profile/featured { name, listingIds } — create one.
 *
 * The caps (10 collections, 20 listings, 30-char name) and the ownership rule
 * are the server's; the sheet only renders what comes back.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  return ok({ items: await listCollections(claims.sub), max: MAX_COLLECTIONS, maxItems: MAX_ITEMS });
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { name?: unknown; listingIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  if (typeof body.name !== "string") return fail("VALIDATION_ERROR", { field: "name" });
  const name = body.name.trim();
  if (name.length < 1 || name.length > NAME_MAX) return fail("VALIDATION_ERROR", { field: "name" });

  if (!Array.isArray(body.listingIds)) return fail("VALIDATION_ERROR", { field: "listings" });
  const listingIds = body.listingIds.filter((id): id is string => typeof id === "string");
  if (!listingIds.length) return fail("VALIDATION_ERROR", { field: "listings" });

  const res = await createCollection(claims.sub, name, listingIds);
  if (!res.ok) {
    if (res.reason === "LIMIT") return fail("VALIDATION_ERROR", { field: "collections", max: MAX_COLLECTIONS });
    return fail("VALIDATION_ERROR", { field: "listings" });
  }
  return ok({ id: res.id });
}
