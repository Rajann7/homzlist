/**
 * Generate the admin icon set FROM THE DESIGN, so it cannot drift.
 *
 * designs/P13-14-15 ships its own 57-icon set as raw SVG inner markup on a
 * `const P = {…}` map, drawn through one helper:
 *
 *   const SVG=(inner,size)=>React.createElement('svg',{width:size||20,height:size||20,
 *     viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,
 *     strokeLinecap:'round',strokeLinejoin:'round', …})
 *
 * Re-drawing those by hand — which is what the first admin build did with the
 * shared `components/ui/Icon` — is why the panel's icons, weights and sizes came
 * out different from the design. This copies them instead.
 *
 *   node scripts/gen-admin-icons.mjs   →  components/admin/ds/icons.tsx
 *
 * Re-run after `node scripts/build-designcheck.mjs` if the design file changes.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "designs/_unpacked/P13.template.html";
const OUT = "components/admin/ds/icons.tsx";

const src = fs.readFileSync(SRC, "utf8");

const svg = src.match(/const SVG\s*=\s*\(inner,\s*size\)\s*=>[\s\S]*?\n/);
if (!svg) throw new Error("SVG helper not found — did the design file change shape?");

// stroke-width / viewBox / linecaps, read off the design's own helper rather than
// assumed, so a change there shows up as a diff here.
const attr = (name) => {
  const m = svg[0].match(new RegExp(`${name}:\\s*'?([^,'}]+)'?`));
  return m ? m[1].trim() : null;
};
const meta = {
  viewBox: attr("viewBox") ?? "0 0 24 24",
  strokeWidth: attr("strokeWidth") ?? "1.5",
  strokeLinecap: attr("strokeLinecap") ?? "round",
  strokeLinejoin: attr("strokeLinejoin") ?? "round",
  defaultSize: (svg[0].match(/width:\s*size\s*\|\|\s*(\d+)/) ?? [, "20"])[1],
};

const block = src.match(/const P\s*=\s*\{([\s\S]*?)\n\s*\};/);
if (!block) throw new Error("icon map `const P = {…}` not found");

// one entry per line: `name:'…markup…',`
const entries = [];
for (const line of block[1].split("\n")) {
  const m = line.match(/^\s*(\w+)\s*:\s*'([\s\S]*)'\s*,?\s*$/);
  if (!m) continue;
  let [, name, markup] = m;
  markup = markup.replace(/\\'/g, "'");
  // A few entries are a bare path `d` rather than markup; the design's helper
  // injects them as innerHTML either way, so wrap them to make them render.
  if (!markup.trimStart().startsWith("<")) markup = `<path d="${markup}"/>`;
  entries.push([name, markup]);
}
if (!entries.length) throw new Error("no icons parsed");

const body = entries.map(([n, m]) => `  ${n}: ${JSON.stringify(m)},`).join("\n");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  `// GENERATED from ${SRC} by scripts/gen-admin-icons.mjs — do not edit by hand.
//
// The admin panel's icons are the DESIGN's icons, copied, not redrawn. Every
// attribute below (viewBox, stroke width, linecaps, default size) is read off the
// design's own SVG helper.

export type AdminIconName = keyof typeof ADMIN_ICON_PATHS;

export const ADMIN_ICON_PATHS = {
${body}
} as const;

export function AdminIcon({ name, size = ${meta.defaultSize} }: { name: AdminIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="${meta.viewBox}"
      fill="none"
      stroke="currentColor"
      strokeWidth={${meta.strokeWidth}}
      strokeLinecap="${meta.strokeLinecap}"
      strokeLinejoin="${meta.strokeLinejoin}"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ADMIN_ICON_PATHS[name] }}
    />
  );
}
`,
);

console.log(`${OUT} — ${entries.length} icons (viewBox ${meta.viewBox}, stroke ${meta.strokeWidth}, default ${meta.defaultSize}px)`);
