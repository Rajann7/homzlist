/** PNG pixel-diff built on sharp (already a dependency for image processing). */
import sharp from "sharp";

const raw = (buf) => sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/**
 * Compare two PNGs. Images are padded (not scaled) to a common canvas so a
 * height difference shows up as a real difference instead of silently
 * resampling both sides into agreement.
 *
 * Returns { width, height, diffPixels, total, ratio, diffPng }.
 */
export async function diff(aBuf, bBuf, { threshold = 24 } = {}) {
  const a = await raw(aBuf);
  const b = await raw(bBuf);
  const width = Math.max(a.info.width, b.info.width);
  const height = Math.max(a.info.height, b.info.height);

  const pad = async (img) =>
    img.info.width === width && img.info.height === height
      ? img
      : raw(await sharp(img.data, { raw: { width: img.info.width, height: img.info.height, channels: 4 } })
          .extend({
            top: 0, left: 0,
            bottom: height - img.info.height, right: width - img.info.width,
            background: { r: 255, g: 0, b: 255, alpha: 255 }, // magenta = "nothing here"
          })
          .png().toBuffer());

  const A = (await pad(a)).data;
  const B = (await pad(b)).data;
  const out = Buffer.alloc(width * height * 4);
  let diffPixels = 0;

  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const dr = Math.abs(A[p] - B[p]);
    const dg = Math.abs(A[p + 1] - B[p + 1]);
    const db = Math.abs(A[p + 2] - B[p + 2]);
    const delta = Math.max(dr, dg, db);
    if (delta > threshold) {
      diffPixels++;
      out[p] = 255; out[p + 1] = 0; out[p + 2] = 90; out[p + 3] = 255; // hot pink
    } else {
      // faded design pixel underneath, so the diff mask reads in context
      const grey = 255 - Math.round((255 - (A[p] * 0.299 + A[p + 1] * 0.587 + A[p + 2] * 0.114)) * 0.25);
      out[p] = grey; out[p + 1] = grey; out[p + 2] = grey; out[p + 3] = 255;
    }
  }

  const diffPng = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const total = width * height;
  return { width, height, diffPixels, total, ratio: diffPixels / total, diffPng };
}

/** Side-by-side design | app | diff strip, for eyeballing a whole screen fast. */
export async function contactSheet(designBuf, appBuf, diffBuf, outPath) {
  const metas = await Promise.all([designBuf, appBuf, diffBuf].map((b) => sharp(b).metadata()));
  const h = Math.max(...metas.map((m) => m.height));
  const widths = metas.map((m) => m.width);
  const gap = 12;
  const W = widths.reduce((s, w) => s + w, 0) + gap * 2;
  const layers = [];
  let x = 0;
  for (let i = 0; i < 3; i++) {
    layers.push({ input: [designBuf, appBuf, diffBuf][i], left: x, top: 0 });
    x += widths[i] + gap;
  }
  await sharp({ create: { width: W, height: h, channels: 4, background: { r: 24, g: 24, b: 24, alpha: 255 } } })
    .composite(layers).png().toFile(outPath);
}
