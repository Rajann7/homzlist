import { ok, fail } from "@/lib/api";
import { getUploader } from "@/lib/auth/uploader";
import { createServiceClient } from "@/lib/supabase/server";
import { deleteObject, keyFromPublicUrl, BUCKET } from "@/lib/storage";

/**
 * DELETE /api/v1/uploads/avatar — clear the profile photo.
 *
 * Registered users can also do this through PATCH /profile/me, but the
 * registration window (P1 S7) has no access token yet, so "Remove photo" needs
 * a path that the register cookie can reach. Clears the column AND drops the
 * object, so removing really removes.
 */
export const dynamic = "force-dynamic";

export async function DELETE() {
  const uploader = await getUploader();
  if (!uploader) return fail("UNAUTHORIZED");

  const db = createServiceClient();
  const { data: prev } = await db.from("profiles").select("photo_url").eq("id", uploader.id).maybeSingle();

  const { error } = await db.from("profiles").update({ photo_url: null }).eq("id", uploader.id);
  if (error) return fail("SERVER_ERROR");

  const key = keyFromPublicUrl(prev?.photo_url ?? null);
  if (key) await deleteObject(key, BUCKET.public).catch(() => undefined);

  return ok({ removed: true });
}
