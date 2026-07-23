import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { createUploadGrant, readObject, deleteObject, signedReadUrl, BUCKET } from "@/lib/storage";

/**
 * Project brochure (P6 S5 Step 3) — PDF, 10MB, "scanning → Ready ✓".
 *
 *   POST   ?stage=presign  → a direct-upload grant for the PRIVATE bucket
 *   POST   ?stage=commit   → verify the real bytes, then attach
 *   GET                    → a short-lived signed URL for the owner
 *   DELETE                 → detach + remove the object
 *
 * The "scanning" state the design shows is not decoration: on commit we read
 * the object back and check its magic bytes. A file that claims application/pdf
 * but isn't one is deleted from the bucket and never attached — the same
 * discipline photos get, because a presigned upload bypasses our API entirely.
 *
 * Brochures live in `private-docs` and are served only through a signed URL, so
 * an un-approved project's brochure isn't world-readable by guessing a path.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BROCHURE_BYTES = 10 * 1024 * 1024;
const PDF_MIME = "application/pdf";

const db = () => createServiceClient();

/** Ownership-checked project fetch — someone else's is simply not found. */
async function ownProject(id: string, profileId: string) {
  const { data } = await db()
    .from("projects")
    .select("id,profile_id,brochure_key,brochure_scanned")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();
  return (data as { id: string; profile_id: string; brochure_key: string | null; brochure_scanned: boolean } | null) ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`brochure:${claims.sub}`, 40, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const project = await ownProject(params.id, claims.sub);
  if (!project) return fail("NOT_FOUND");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const stage = new URL(req.url).searchParams.get("stage") ?? "presign";

  // ---- presign ------------------------------------------------------------
  if (stage === "presign") {
    if (body.contentType !== PDF_MIME) return fail("VALIDATION_ERROR", { field: "contentType" });
    if (typeof body.size === "number" && body.size > MAX_BROCHURE_BYTES) return fail("FILE_TOO_LARGE");

    // The key is ours, never the user's filename.
    const grant = await createUploadGrant({
      prefix: `projects/${params.id}/brochure`,
      contentType: PDF_MIME,
      isPrivate: true,
    });
    return ok({ grant, maxBytes: MAX_BROCHURE_BYTES });
  }

  // ---- commit -------------------------------------------------------------
  if (stage === "commit") {
    const key = typeof body.key === "string" ? body.key : "";
    // The key must be one we minted for THIS project — a client-supplied path
    // pointing anywhere else is refused rather than attached.
    if (!key || !key.startsWith(`projects/${params.id}/brochure`)) {
      return fail("VALIDATION_ERROR", { field: "key" });
    }

    const bytes = await readObject(key, BUCKET.private);
    if (!bytes) return fail("VALIDATION_ERROR", { field: "key" });

    if (bytes.length > MAX_BROCHURE_BYTES || !isPdf(bytes)) {
      // Not a PDF (or oversized) → remove it; nothing unvalidated stays stored.
      await deleteObject(key, BUCKET.private).catch(() => {});
      return fail("VALIDATION_ERROR", { field: "file", message: "That file isn't a valid PDF" });
    }

    // Replace any previous brochure so we don't accumulate orphans.
    if (project.brochure_key && project.brochure_key !== key) {
      await deleteObject(project.brochure_key, BUCKET.private).catch(() => {});
    }

    await db()
      .from("projects")
      .update({ brochure_key: key, brochure_scanned: true })
      .eq("id", params.id)
      .eq("profile_id", claims.sub);

    return ok({ attached: true, scanned: true });
  }

  return fail("VALIDATION_ERROR", { field: "stage" });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const project = await ownProject(params.id, claims.sub);
  if (!project) return fail("NOT_FOUND");
  if (!project.brochure_key) return ok({ brochure: null });

  // Short-lived signed read — the raw bucket path stays unreachable.
  const url = await signedReadUrl(project.brochure_key, 300);
  return ok({ brochure: { url, scanned: project.brochure_scanned } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const project = await ownProject(params.id, claims.sub);
  if (!project) return fail("NOT_FOUND");

  if (project.brochure_key) await deleteObject(project.brochure_key, BUCKET.private).catch(() => {});
  await db()
    .from("projects")
    .update({ brochure_key: null, brochure_scanned: false })
    .eq("id", params.id)
    .eq("profile_id", claims.sub);

  return ok({ deleted: true });
}

/** %PDF- magic bytes. The mime a browser sends is only a claim. */
function isPdf(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}
