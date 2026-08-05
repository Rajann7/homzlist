import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { renameCollection, deleteCollection } from "@/lib/saved/service";

/**
 * PATCH  /api/v1/saved/collections/:id — rename (ownership-scoped, IDOR-safe).
 * DELETE /api/v1/saved/collections/:id — remove; its saves fall back to "All".
 */
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const name = typeof body.name === "string" ? body.name : "";
  const r = await renameCollection(claims.sub, params.id, name);
  if (!r.ok) return fail(r.error === "duplicate" ? "VALIDATION_ERROR" : "NOT_FOUND", r.error ? { reason: r.error } : undefined);
  return ok({ renamed: true });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const r = await deleteCollection(claims.sub, params.id);
  if (!r.ok) return fail("NOT_FOUND");
  return ok({ deleted: true });
}
