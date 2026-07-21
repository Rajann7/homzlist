/**
 * Rasterize the SVG brand icons into the PNG sizes the manifest + iOS expect.
 * Run: node scripts/gen-icons.mjs  (needs sharp — a project dependency).
 * Re-run whenever the brand SVGs change (admin branding swap happens at runtime
 * via R2 later; these are the built-in placeholders — Doc1 §12).
 */
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");

const jobs = [
  { src: "icon.svg", out: "icon-192.png", size: 192 },
  { src: "icon.svg", out: "icon-512.png", size: 512 },
  { src: "icon.svg", out: "apple-touch-icon.png", size: 180 },
  { src: "maskable.svg", out: "maskable-512.png", size: 512 },
];

for (const { src, out, size } of jobs) {
  const svg = await readFile(join(iconsDir, src));
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(iconsDir, out));
  console.log(`✓ ${out} (${size}px)`);
}
console.log("Icons generated.");
