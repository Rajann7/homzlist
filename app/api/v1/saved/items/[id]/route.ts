import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assignSave, removeSave } from "@/lib/saved/service";

/**
 * PATCH  /api/v1/saved/items/:id — move a save into a collection (collectionId
 *        null = out of any collection). Both the save and the target collection
 *        must belong to the caller.
 * DELETE /api/v1/saved/items/:id — un-save from the Saved screen.
 */
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const collectionId = body.collectionId === null ? null : typeof body.collectionId === "string" ? body.collectionId : undefined;
  if (collectionId === undefined) return fail("VALIDATION_ERROR", { field: "collectionId" });
  const r = await assignSave(claims.sub, params.id, collectionId);
  if (!r.ok) return fail("NOT_FOUND");
  return ok({ assigned: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const r = await removeSave(claims.sub, params.id);
  if (!r.ok) return fail("NOT_FOUND");
  return ok({ removed: true });
}
