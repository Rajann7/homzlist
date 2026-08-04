import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getUploader, registerScopeAllows } from "@/lib/auth/uploader";
import { createServiceClient } from "@/lib/supabase/server";
import { readObject, deleteObject, publicUrlFor, keyFromPublicUrl, BUCKET } from "@/lib/storage";
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
  const uploader = await getUploader();
  if (!uploader) return fail("UNAUTHORIZED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const key = typeof body.key === "string" ? body.key : "";
  const kind = body.kind as "avatar" | "logo" | "doc" | "chat" | "support";
  if (!key || !["avatar", "logo", "doc", "chat", "support"].includes(kind)) return fail("VALIDATION_ERROR");
  // Registration window: profile photo only, never logos/docs/chat.
  if (!registerScopeAllows(uploader, kind)) return fail("UNAUTHORIZED");

  // The key must sit under THIS user's prefix — a crafted key pointing at
  // someone else's object can't be claimed.
  const expected = `${kind === "doc" ? "docs" : kind === "logo" ? "logos" : kind === "chat" ? "chat" : kind === "support" ? "support" : "avatars"}/${uploader.id}/`;
  if (!key.startsWith(expected)) return fail("VALIDATION_ERROR", { field: "key" });

  const bucket = kind === "doc" || kind === "support" ? BUCKET.private : BUCKET.public;
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
  } else if (kind !== "doc") {  // a PDF is only ever a verification document
    await deleteObject(key, bucket).catch(() => undefined);
    return fail("FILE_TYPE_BLOCKED");
  }

  // A support screenshot stays private and attaches to nothing yet — the KEY
  // goes back to the form, which sends it with the ticket. It becomes readable
  // only through the ticket it lands on (GET …/attachment), never by URL.
  if (kind === "support") {
    return ok({ key });
  }

  // Chat photos are public and returned to the composer to send as a bubble;
  // they attach to no profile column.
  if (kind === "chat") {
    return ok({ url: publicUrlFor(key, bucket) });
  }

  // Avatars/logos are public and land straight on the profile.
  if (kind === "avatar" || kind === "logo") {
    const url = publicUrlFor(key, bucket);
    const column = kind === "avatar" ? "photo_url" : "company_logo_url";
    const db = createServiceClient();

    // Replacing a photo: drop the object it replaces so re-uploading in a loop
    // doesn't leave orphans in the bucket.
    const { data: prev } = await db.from("profiles").select(column).eq("id", uploader.id).maybeSingle();
    const prevUrl = (prev as Record<string, string | null> | null)?.[column] ?? null;

    await db.from("profiles").update({ [column]: url }).eq("id", uploader.id);

    const prevKey = keyFromPublicUrl(prevUrl);
    if (prevKey && prevKey !== key) await deleteObject(prevKey, bucket).catch(() => undefined);

    return ok({ url });
  }

  // Docs stay private — only the key travels, never a public URL.
  return ok({ key });
}
