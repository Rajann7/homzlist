/**
 * Unpack the locked design prototypes (designs/*.html) into standalone,
 * offline-runnable pages under public/_dx/ so they can be screenshotted and
 * pixel-diffed against the real app.
 *
 * The shipped design files are "bundler" archives: the real prototype lives in
 * a JSON-encoded <script type="__bundler/template"> and is normally injected
 * into a sandboxed iframe via postMessage — which is why screenshots of them
 * came back blank/unreachable. Unpacking removes the iframe entirely.
 *
 *   node scripts/build-designcheck.mjs   →  /_dx/P4.html /_dx/P5.html /_dx/P6.html
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const PAGES = {
  P4: "designs/P4 - Detail Screens.html",
  P5: "designs/P5 - Creation A (Plan wall → Form → Photos).html",
  P6: "designs/P6 - Creation B (Preview → Payment → Forms → Drafts).html",
  P13: "designs/P13-14-15 - ADMIN DASH FULL.html",
};
const OUT = "public/_dx";

// Vendored so the prototypes render with no network at screenshot time.
const VENDOR = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js": "react.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "react-dom.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js": "babel.js",
};

const grab = (src, type) => {
  const m = new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`).exec(src);
  return m ? m[1].trim() : null;
};

fs.mkdirSync(OUT, { recursive: true });

for (const [key, file] of Object.entries(PAGES)) {
  const src = fs.readFileSync(file, "utf8");
  const manifest = JSON.parse(grab(src, "manifest"));
  const ext = JSON.parse(grab(src, "ext_resources") ?? "[]");
  const html = JSON.parse(grab(src, "template"));

  // The decoded template is the readable spec for the module: markup plus the
  // React render methods that decide every layout, size, colour and branch.
  fs.mkdirSync("designs/_unpacked", { recursive: true });
  fs.writeFileSync(path.join("designs/_unpacked", `${key}.template.html`), html);

  // uuid -> vendored filename, for the resources the runtime pulls from a CDN
  const byUuid = new Map(ext.map((e) => [e.uuid, VENDOR[e.id]]));

  for (const [uuid, entry] of Object.entries(manifest)) {
    let data = Buffer.from(entry.data, "base64");
    if (entry.compressed) data = zlib.gunzipSync(data);
    const vendored = byUuid.get(uuid);
    if (vendored) {
      fs.writeFileSync(path.join(OUT, vendored), data);
      continue;
    }
    // the x-dc runtime itself: point its CDN loads at the local copies
    let js = data.toString("utf8");
    for (const [url, local] of Object.entries(VENDOR)) js = js.split(url).join(`/_dx/${local}`);
    fs.writeFileSync(path.join(OUT, `${key}.runtime.js`), js);
    fs.writeFileSync(
      path.join(OUT, `${key}.html`),
      html.replace(`<script src="${uuid}"></script>`, `<script src="/_dx/${key}.runtime.js"></script>`),
    );
  }
  console.log(`${key} → ${OUT}/${key}.html`);
}

// Same-origin scratch page: the harness seeds localStorage here before it
// navigates to a screen, so it never has to load the target URL twice (which
// made Chrome restore the previous scroll offset mid-screenshot).
fs.writeFileSync(path.join(OUT, "blank.html"), '<!doctype html><meta charset="utf-8"><title>blank</title>\n');

// babel is not carried inside the archives — fetch once and cache it.
const babel = path.join(OUT, "babel.js");
if (!fs.existsSync(babel) || fs.statSync(babel).size < 1e6) {
  const url = Object.keys(VENDOR).find((u) => u.includes("babel"));
  const res = await fetch(url);
  fs.writeFileSync(babel, Buffer.from(await res.arrayBuffer()));
  console.log(`babel → ${babel}`);
}
