"use client";

/**
 * Client-side image normalisation, applied to EVERY photo before upload.
 *
 * Why this exists: the feed card is a fixed 4:5 frame and the photo grid is 1:1,
 * so a 6000×1200 panorama or a 900×3000 tall shot was being stuffed into those
 * frames by `object-cover` — the subject ended up cropped to nothing at display
 * time, and the original multi-megabyte file was stored as-is.
 *
 * The rule is Instagram's, which the brief asks us to match: allow anything from
 * 4:5 portrait (0.8) to 1.91:1 landscape, and centre-crop anything outside that
 * band to the nearest bound. Inside the band the photo is left composed exactly
 * as the user framed it — we only downscale.
 *
 * Runs in the browser on a canvas, so the bytes that reach storage are already
 * the bytes we'll serve. The server still validates magic bytes on commit; this
 * does not replace that check.
 */

/** Instagram's band. Below = too tall, above = too wide. */
const MIN_ASPECT = 4 / 5;      // 0.80 — portrait bound (the feed card ratio)
const MAX_ASPECT = 1.91;       // landscape bound

/** Longest side after downscaling. 2048 covers a 2x retina 4:5 card comfortably. */
const MAX_EDGE = 2048;

const JPEG_QUALITY = 0.9;

export interface NormalizeResult {
  file: File;
  /** True when the frame was changed (aspect clamped and/or downscaled). */
  changed: boolean;
  reason: "cropped-tall" | "cropped-wide" | "downscaled" | "unchanged";
}

/**
 * Normalise one image. Non-images and anything we can't decode are returned
 * untouched so the server's own validation stays the single gate on file type.
 */
export async function normalizeImage(file: File): Promise<NormalizeResult> {
  if (!file.type.startsWith("image/")) {
    return { file, changed: false, reason: "unchanged" };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Undecodable here (e.g. HEIC on a browser without support) — hand it over
    // untouched and let the server decide.
    return { file, changed: false, reason: "unchanged" };
  }

  const { width: w, height: h } = bitmap;
  if (!w || !h) {
    bitmap.close?.();
    return { file, changed: false, reason: "unchanged" };
  }

  const aspect = w / h;

  // 1. Decide the crop box (centred) that brings the aspect into the band.
  let cropW = w;
  let cropH = h;
  let reason: NormalizeResult["reason"] = "unchanged";

  if (aspect < MIN_ASPECT) {
    // Too tall → keep full width, trim height.
    cropH = Math.round(w / MIN_ASPECT);
    reason = "cropped-tall";
  } else if (aspect > MAX_ASPECT) {
    // Too wide → keep full height, trim width.
    cropW = Math.round(h * MAX_ASPECT);
    reason = "cropped-wide";
  }

  const sx = Math.round((w - cropW) / 2);
  const sy = Math.round((h - cropH) / 2);

  // 2. Downscale so the longest side fits MAX_EDGE.
  const longest = Math.max(cropW, cropH);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));
  if (scale < 1 && reason === "unchanged") reason = "downscaled";

  if (reason === "unchanged") {
    bitmap.close?.();
    return { file, changed: false, reason: "unchanged" };
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return { file, changed: false, reason: "unchanged" };
  }

  ctx.drawImage(bitmap, sx, sy, cropW, cropH, 0, 0, outW, outH);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return { file, changed: false, reason: "unchanged" };

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return {
    file: new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }),
    changed: true,
    reason,
  };
}

/** Normalise a batch, preserving order. */
export async function normalizeImages(files: File[]): Promise<NormalizeResult[]> {
  const out: NormalizeResult[] = [];
  for (const f of files) out.push(await normalizeImage(f));
  return out;
}
