/**
 * The secret-grep gate, as a script instead of a thing each part re-does by hand.
 *
 * §9.6 asks every part for "secret-grep of the built bundle". P2, P3, P4 and
 * P5a each ran it as an ad-hoc command, which means the gate existed four times
 * and could be forgotten a fifth. This is the one copy.
 *
 * It greps for the VALUES in .env.local, not for variable names: a bundle
 * containing the string "SUPABASE_SERVICE_ROLE_KEY" is harmless (it is a name),
 * and one containing the key itself is a breach. Public values —
 * NEXT_PUBLIC_* — are expected in the bundle and are skipped by design.
 *
 *   node scripts/check-bundle-secrets.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BUILD = join(ROOT, ".next");

if (!existsSync(BUILD)) {
  console.log("No .next/ — run `npm run build` first.");
  process.exit(1);
}

const envText = existsSync(join(ROOT, ".env.local"))
  ? readFileSync(join(ROOT, ".env.local"), "utf8")
  : "";

/** Every value worth hiding, keyed by the name it came from. */
const secrets = [];
const publicValues = [];
for (const line of envText.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  const [, name, rawValue] = m;
  const value = rawValue.trim().replace(/^["']|["']$/g, "");
  // NEXT_PUBLIC_* is shipped to the browser on purpose; a short value would
  // produce false positives against minified identifiers.
  if (name.startsWith("NEXT_PUBLIC_")) {
    publicValues.push(value);
    continue;
  }
  if (value.length < 12) continue;
  secrets.push({ name, value });
}
// A value that is PART of a public one is public too. SUPABASE_PROJECT_REF is
// the first half of NEXT_PUBLIC_SUPABASE_URL, so finding it in the bundle is
// finding the URL the browser is supposed to call — not a leak. Without this
// the gate cries wolf, and a gate that always fails gets ignored.
const derived = secrets.filter((s) => publicValues.some((p) => p.includes(s.value)));
for (const d of derived) {
  console.log(`  skip ${d.name} — its value is contained in a NEXT_PUBLIC_ value (public by construction)`);
}
const checked = secrets.filter((s) => !derived.includes(s));
secrets.length = 0;
secrets.push(...checked);

// A value that is ALSO written as a literal fallback in lib/env.ts cannot be
// told apart from that fallback once it is in a bundle. Next.js replaces
// non-NEXT_PUBLIC_ `process.env.X` reads with `undefined` on the client, so
// what a grep finds in a client chunk is the source default
// (`process.env.REDIS_URL ?? "redis://127.0.0.1:6379"`), not the secret. Left
// unhandled this gate reported ~49 leaks on every run, and a gate that always
// fails is a gate nobody reads.
const envSource = existsSync(join(ROOT, "lib", "env.ts"))
  ? readFileSync(join(ROOT, "lib", "env.ts"), "utf8")
  : "";
const sourceDefaults = new Set(
  [...envSource.matchAll(/\?\?\s*"([^"]*)"/g)].map((m) => m[1]).filter(Boolean),
);

// Short values also collide by accident — a 12-character FCM_PROJECT_ID equal
// to the folder name matched every chunk, because the build path is baked into
// them. Anything a grep cannot attribute is not evidence.
const MIN_DISTINCTIVE_LEN = 24;
const projectPath = ROOT.toLowerCase();

const undecidable = [];
const checkable = [];
for (const s of secrets) {
  if (sourceDefaults.has(s.value)) {
    undecidable.push([s.name, "identical to its own fallback literal in lib/env.ts"]);
  } else if (s.value.length < MIN_DISTINCTIVE_LEN && projectPath.includes(s.value.toLowerCase())) {
    undecidable.push([s.name, `${s.value.length} chars and a substring of the build path`]);
  } else {
    checkable.push(s);
  }
}
for (const [name, why] of undecidable) {
  console.log(`  skip ${name} — ${why}; a match would not prove a leak`);
}
secrets.length = 0;
secrets.push(...checkable);

if (!secrets.length) {
  console.log("No non-public secrets found in .env.local — nothing to check.");
  process.exit(0);
}

// The client bundle only. Server chunks legitimately contain the service key.
const roots = [join(BUILD, "static")];
const files = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|css|json|map)$/.test(entry)) files.push(p);
  }
};
roots.forEach(walk);

let leaks = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const s of secrets) {
    if (text.includes(s.value)) {
      leaks++;
      console.log(`  LEAK ${s.name} appears in ${file.slice(ROOT.length + 1)}`);
    }
  }
}

console.log(
  `\n${leaks ? "FAIL" : "PASS"} — ${secrets.length} secret value(s) checked against ${files.length} client bundle file(s): ${leaks} leak(s)`,
);
process.exit(leaks ? 1 : 0);
