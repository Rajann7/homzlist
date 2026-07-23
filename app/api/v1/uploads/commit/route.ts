import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createServiceClient } from "@/lib/supabase/server";
import { readObject, deleteObject, publicUrlFor, BUCKET } from "@/lib/storage";
import { validateImage } from "@/lib/image-pipeline";

/**
 * POST /api/v1/uploads/commit — confirm a non-listing upload.
 *
 * Same magic-byte gate as listing photos: the bytes went browser → bucket, so
 * this is the first point the server can inspect them. Anything that isn't a
 * real image is deleted and refused (Doc9 §9). PDFs (verification docs) skip
 * the image decode but are still size- and prefix-checked.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const key = typeof body.key === "string" ? body.key : "";
  const kind = body.kind as "avatar" | "logo" | "doc";
  if (!key || !["avatar", "logo", "doc"].includes(kind)) return fail("VALIDATION_ERROR");

  // The key must sit under THIS user's prefix — a crafted key pointing at
  // someone else's object can't be claimed.
  const expected = `${kind === "doc" ? "docs" : kind === "logo" ? "logos" : "avatars"}/${claims.sub}/`;
  if (!key.startsWith(expected)) return fail("VALIDATION_ERROR", { field: "key" });

  const bucket = kind === "doc" ? BUCKET.private : BUCKET.public;
  const bytes = await readObject(key, bucket);
  if (!bytes) return fail("VALIDATION_ERROR", { field: "key" });

  // Images must decode; a PDF is accepted on its magic header alone.
  const isPdf = bytes.subarray(0, 4).toString("latin1") === "%PDF";
  if (!isPdf) {
    const check = await validateImage(bytes);
    if (!check.ok) {
      await deleteObject(key, bucket).catch(() => undefined);
      return fail(check.reason === "FILE_TOO_LARGE" ? "FILE_TOO_LARGE" : "FILE_TYPE_BLOCKED");
    }
  } else if (kind !== "doc") {
    await deleteObject(key, bucket).catch(() => undefined);
    return fail("FILE_TYPE_BLOCKED");
  }

  // Avatars/logos are public and land straight on the profile.
  if (kind === "avatar" || kind === "logo") {
    const url = publicUrlFor(key, bucket);
    const column = kind === "avatar" ? "photo_url" : "company_logo_url";
    await createServiceClient().from("profiles").update({ [column]: url }).eq("id", claims.sub);
    return ok({ url });
  }

  // Docs stay private — only the key travels, never a public URL.
  return ok({ key });
}
