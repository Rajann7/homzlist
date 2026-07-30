import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getUploader, registerScopeAllows } from "@/lib/auth/uploader";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createUploadGrant } from "@/lib/storage";
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from "@/lib/image-pipeline";

/**
 * POST /api/v1/uploads/presign — upload grant for NON-listing media:
 * profile photos, company logos (public) and verification documents (private).
 *
 * `kind` decides the bucket, so the client cannot choose to put an ID scan in
 * the public bucket — that mapping is server-side (Doc2 §5.1, Doc9 §17).
 * Listing photos have their own endpoint because they carry a per-listing
 * ownership check and a per-role cap.
 */
export const dynamic = "force-dynamic";

const KINDS = {
  avatar: { prefix: "avatars", private: false, mimes: ALLOWED_IMAGE_MIME as readonly string[] },
  logo: { prefix: "logos", private: false, mimes: ALLOWED_IMAGE_MIME as readonly string[] },
  // Chat photos are PUBLIC (rendered inline in a bubble), keyed per-sender.
  chat: { prefix: "chat", private: false, mimes: ALLOWED_IMAGE_MIME as readonly string[] },
  // Support-ticket screenshots are PUBLIC (rendered inline in the thread the
  // same way a chat photo is), keyed per-reporter.
  support: { prefix: "support", private: false, mimes: ALLOWED_IMAGE_MIME as readonly string[] },
  // Verification docs are PRIVATE: owner + admin only, via signed URL.
  doc: { prefix: "docs", private: true, mimes: [...ALLOWED_IMAGE_MIME, "application/pdf"] },
} as const;

export async function POST(req: NextRequest) {
  const uploader = await getUploader();
  if (!uploader) return fail("UNAUTHORIZED");

  const limited = await rateLimit(`upload-presign:${uploader.id}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const spec = KINDS[body.kind as keyof typeof KINDS];
  if (!spec) return fail("VALIDATION_ERROR", { field: "kind" });
  // Registration window: profile photo only, never logos/docs/chat.
  if (!registerScopeAllows(uploader, body.kind)) return fail("UNAUTHORIZED");

  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  if (!(spec.mimes as readonly string[]).includes(contentType)) return fail("FILE_TYPE_BLOCKED");
  if (typeof body.size === "number" && body.size > MAX_IMAGE_BYTES) return fail("FILE_TOO_LARGE");

  // Keyed under the owner's id so an object is always attributable.
  const grant = await createUploadGrant({
    prefix: `${spec.prefix}/${uploader.id}`,
    contentType,
    isPrivate: spec.private,
  });

  return ok({ grant });
}
