/**
 * Turn the capture manifest into a readable index, so the tablet/desktop work
 * can be planned from a list rather than by scrolling a folder of PNGs.
 *
 *   node scripts/shot-screens.index.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "_screens", "mobile");
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));

const GROUP_TITLE = {
  guest: "Guest / public (not signed in)",
  owner: "Owner",
  broker: "Broker",
  builder: "Builder",
};

const lines = [];
lines.push("# HomzList — every mobile screen, shot from the live app");
lines.push("");
lines.push(`Captured ${new Date().toISOString().slice(0, 10)} at 390×844 (2× DPR) against the running app and the real database. Admin (\`account.*\`) is excluded — it already has tablet and desktop layouts.`);
lines.push("");
lines.push("Two files per screen where the screen scrolls:");
lines.push("");
lines.push("- `<id>.png` — what fits on the phone");
lines.push("- `<id>--full.png` — the whole screen, top to bottom");
lines.push("");

const byGroup = {};
for (const m of manifest) (byGroup[m.group] ??= []).push(m);

let ok = 0, failed = 0;
for (const [group, rows] of Object.entries(byGroup)) {
  lines.push(`## ${GROUP_TITLE[group] ?? group}`);
  lines.push("");
  lines.push("| screen | file | full-height | source |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
    if (r.error) { failed++; continue; }
    ok++;
    const where = r.url ? `\`${r.url.replace(/^https?:\/\//, "")}\`` : "interaction";
    lines.push(`| ${r.id.replace(/^[0-9A-Z]+-/, "").replace(/-/g, " ")} | \`${group}/${r.id}.png\` | ${r.full ? `\`${r.id}--full.png\` (${r.height}px)` : "—" } | ${where} |`);
  }
  lines.push("");
}

const errors = manifest.filter((m) => m.error);
if (errors.length) {
  lines.push("## Not captured");
  lines.push("");
  for (const e of errors) lines.push(`- \`${e.group}/${e.id}\` — ${e.error}${e.url ? ` (${e.url})` : ""}`);
  lines.push("");
}

lines.push(`---`);
lines.push(``);
lines.push(`${ok} screens captured${failed ? `, ${failed} not reachable` : ""}.`);
lines.push(``);
lines.push(`Re-run with \`node scripts/shot-screens.mjs\` (add group names to narrow it, \`ONLY=<substring>\` to pick individual screens).`);

fs.writeFileSync(path.join(OUT, "INDEX.md"), lines.join("\n"));
console.log(`INDEX.md → ${ok} screens, ${failed} failures`);
