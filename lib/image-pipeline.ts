import "server-only";
import sharp from "sharp";

/**
 * Image pipeline service (Doc6 §6). Reusable by listings, projects, profile
 * photos, banners. Module 0 provides the processing primitives + variant spec;
 * the R2 presign/upload/store wiring lands with the storage module (later).
 *
 * Security-relevant behaviour baked in now (Doc9 §9):
 *  - re-encode to WebP (drops embedded polyglot payloads),
 *  - strip EXIF/GPS (privacy — no location leak),
 *  - server-generated random keys (no user paths — path-traversal-proof).
 */

/** Locked variants (Doc6 §6.2). Longest-edge caps; aspect preserved via cover-crop at slot time. */
export const IMAGE_VARIANTS = {
  thumb: 300, // grid 1:1
  medium: 800, // feed 4:5
  large: 1600, // detail
  original: 2000, // capped original
} as const;

export type VariantName = keyof typeof IMAGE_VARIANTS;

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB/file (Doc6 §6.1 / Doc9 §9)
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;

/** Random, server-generated storage key — never derived from the user filename. */
export function generateImageKey(prefix = "img"): string {
  const rand = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}/${rand}`;
}

/**
 * Validate a buffer is really an image of an allowed type via magic-bytes (not
 * just the claimed MIME / extension — Doc9 §9). Returns the detected format.
 */
export async function validateImage(
  buffer: Buffer,
): Promise<{ ok: true; format: string; width: number; height: number } | { ok: false; reason: string }> {
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "FILE_TOO_LARGE" };
  }
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.format || !["jpeg", "png", "webp", "heif"].includes(meta.format)) {
      return { ok: false, reason: "FILE_TYPE_BLOCKED" };
    }
    return { ok: true, format: meta.format, width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch {
    return { ok: false, reason: "FILE_TYPE_BLOCKED" };
  }
}

/**
 * Produce one WebP variant. EXIF/GPS is stripped (sharp drops metadata unless
 * .withMetadata() is called — we deliberately don't). "Balanced" quality default,
 * admin-editable later (Doc6 §6.2).
 */
export async function makeWebpVariant(
  buffer: Buffer,
  variant: VariantName,
  quality = 78,
): Promise<Buffer> {
  const edge = IMAGE_VARIANTS[variant];
  return sharp(buffer)
    .rotate() // apply EXIF orientation, then discard EXIF
    .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

/**
 * Full variant set generator. Returns buffers keyed by variant; storage upload
 * to R2 + CDN URL assembly is wired in the storage/listings module.
 */
export async function processToVariants(
  buffer: Buffer,
): Promise<Record<VariantName, Buffer>> {
  const [thumb, medium, large, original] = await Promise.all([
    makeWebpVariant(buffer, "thumb"),
    makeWebpVariant(buffer, "medium"),
    makeWebpVariant(buffer, "large"),
    makeWebpVariant(buffer, "original"),
  ]);
  return { thumb, medium, large, original };
}
