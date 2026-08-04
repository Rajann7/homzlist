/**
 * Diff two captures from scripts/upgrade-capture.mjs.
 *
 *   node scripts/upgrade-compare.mjs _upgrade/base14 _upgrade/next15
 *
 * Reports, per screen: pixel difference, and whether the page still resolved to
 * the same path/title and threw no new console errors. Reports, per API probe:
 * status change and a structural diff of the payload.
 *
 * A clean run means the upgrade changed nothing the user can see or the client
 * can read. That is the whole bar.
 */
import fs from "node:fs";
import path from "node:path";
import { diff } from "./lib/pixels.mjs";

const [A, B] = process.argv.slice(2);
if (!A || !B) {
  console.error("usage: node scripts/upgrade-compare.mjs <dirBefore> <dirAfter>");
  process.exit(2);
}
const OUT = process.env.OUT ?? "_upgrade/diff";
fs.mkdirSync(OUT, { recursive: true });

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
let problems = 0;
const say = (bad, line) => { if (bad) problems++; console.log(`  ${bad ? "DIFF" : "same"}  ${line}`); };

// ------------------------------------------------------------- screens ---
console.log("\n=== SCREENS ===");
const sa = readJson(path.join(A, "screens.json"));
const sb = readJson(path.join(B, "screens.json"));

const ids = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].sort();
const pixelReport = [];
for (const id of ids) {
  const a = sa[id], b = sb[id];
  if (!a || !b) { say(true, `${id.padEnd(28)} present in only one capture`); continue; }
  if (a.error || b.error) {
    say(a.error !== b.error, `${id.padEnd(28)} error before=${a.error ?? "-"} after=${b.error ?? "-"}`);
    continue;
  }

  const notes = [];
  if (a.finalPath !== b.finalPath) notes.push(`path ${a.finalPath} -> ${b.finalPath}`);
  if (a.title !== b.title) notes.push(`title "${a.title}" -> "${b.title}"`);
  // The two sides run on different ports, so the same message carries a
  // different origin ("…localhost:3001/messages" vs "…localhost:3000/messages")
  // and a naive string compare reports every pre-existing warning as NEW.
  const norm = (e) => String(e).replace(/https?:\/\/[^/\s]+/g, "<origin>");
  const before = new Set((a.consoleErrors ?? []).map(norm));
  const newErrors = (b.consoleErrors ?? []).map(norm).filter((e) => !before.has(e));
  if (newErrors.length) notes.push(`NEW console errors: ${JSON.stringify(newErrors.slice(0, 3))}`);
  const beforeReq = new Set((a.failedRequests ?? []).map(norm));
  const newFailed = (b.failedRequests ?? []).map(norm).filter((e) => !beforeReq.has(e));
  if (newFailed.length) notes.push(`NEW failed requests: ${JSON.stringify(newFailed.slice(0, 3))}`);

  const pa = path.join(A, `${id}.png`), pb = path.join(B, `${id}.png`);
  let pct = null;
  if (fs.existsSync(pa) && fs.existsSync(pb)) {
    try {
      const d = await diff(fs.readFileSync(pa), fs.readFileSync(pb));
      pct = d.ratio * 100;
      if (pct > 0) fs.writeFileSync(path.join(OUT, `${id}.diff.png`), d.diffPng);
    } catch (e) { notes.push(`pixel diff failed: ${e.message}`); }
  } else notes.push("a screenshot is missing");

  pixelReport.push({ id, pct });
  const bad = notes.length > 0 || (pct !== null && pct > 0.1);
  say(bad, `${id.padEnd(28)} pixels=${pct === null ? "n/a" : pct.toFixed(3) + "%"}${notes.length ? "  " + notes.join(" | ") : ""}`);
}

// ----------------------------------------------------------------- api ---
console.log("\n=== API ===");
const aa = readJson(path.join(A, "api.json"));
const ab = readJson(path.join(B, "api.json"));
const keys = [...new Set([...Object.keys(aa), ...Object.keys(ab)])].sort();

/** First few structural differences, so a huge payload does not print itself. */
function structDiff(x, y, at = "", found = []) {
  if (found.length >= 5) return found;
  const tx = Array.isArray(x) ? "array" : x === null ? "null" : typeof x;
  const ty = Array.isArray(y) ? "array" : y === null ? "null" : typeof y;
  if (tx !== ty) { found.push(`${at || "<root>"}: ${tx} -> ${ty}`); return found; }
  if (tx === "array") {
    if (x.length !== y.length) found.push(`${at}: length ${x.length} -> ${y.length}`);
    for (let i = 0; i < Math.min(x.length, y.length) && found.length < 5; i++) structDiff(x[i], y[i], `${at}[${i}]`, found);
    return found;
  }
  if (tx === "object") {
    const kx = Object.keys(x), ky = Object.keys(y);
    for (const k of kx) if (!(k in y)) found.push(`${at}.${k}: removed`);
    for (const k of ky) if (!(k in x)) found.push(`${at}.${k}: added`);
    for (const k of kx) if (k in y && found.length < 5) structDiff(x[k], y[k], `${at}.${k}`, found);
    return found;
  }
  if (x !== y) found.push(`${at}: ${JSON.stringify(x)?.slice(0, 60)} -> ${JSON.stringify(y)?.slice(0, 60)}`);
  return found;
}

for (const k of keys) {
  const x = aa[k], y = ab[k];
  if (!x || !y) { say(true, `${k} present in only one capture`); continue; }
  if (x.status !== y.status) { say(true, `${k} status ${x.status} -> ${y.status}`); continue; }
  const d = structDiff(x.body, y.body);
  say(d.length > 0, `${k.padEnd(52)} status=${x.status}${d.length ? "  " + d.join(" ; ") : ""}`);
}

// -------------------------------------------------------------- verdict ---
const worst = pixelReport.filter((r) => r.pct !== null).sort((a, b) => b.pct - a.pct).slice(0, 5);
console.log("\n=== WORST PIXEL DRIFT ===");
for (const r of worst) console.log(`  ${r.pct.toFixed(3).padStart(8)}%  ${r.id}`);

console.log(`\n${problems ? "FAIL" : "PASS"} — ${ids.length} screens + ${keys.length} api probes, ${problems} difference(s)`);
if (problems) console.log(`diff images (where any) in ${OUT}/`);
process.exit(problems ? 1 : 0);
