/**
 * Static file server for designs/ — nothing else.
 *
 * The design set is plain .html that links `_kit.css` and `_kit.js` by relative
 * path, so opening it as a file:// snapshot in the preview pane loses both and
 * every frame renders empty. Served over http it behaves exactly as it does in
 * a real browser (the frames use container queries, so a frame's width IS a
 * viewport width).
 *
 *   node scripts/serve-designs.mjs        → http://localhost:4173/desktop-tablet/01-shell.html
 *
 * Read-only, localhost, no dependency, not part of the app.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "designs");
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8",
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // Resolve inside ROOT only — a served folder never escapes itself.
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }

  let target = file;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const index = path.join(target, "index.html");
    if (fs.existsSync(index)) target = index;
    else {
      const links = fs.readdirSync(target).sort()
        .map((n) => `<li><a href="${path.posix.join(rel, n)}">${n}</a></li>`).join("");
      res.writeHead(200, { "content-type": TYPES[".html"] });
      res.end(`<meta charset=utf-8><style>body{font:15px system-ui;padding:24px;line-height:1.9}</style><h1>designs${rel}</h1><ul>${links}</ul>`);
      return;
    }
  }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(target).pipe(res);
}).listen(PORT, () => console.log(`designs/ → http://localhost:${PORT}/desktop-tablet/01-shell.html`));
