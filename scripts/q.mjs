/**
 * Ad-hoc SQL against the DEV Supabase database, so any claim in a module report
 * can be backed by the actual rows.
 *
 *   node scripts/q.mjs "select id, status from boosts limit 5"
 *   node scripts/q.mjs -f path/to/file.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const sql = args[0] === "-f" ? fs.readFileSync(args[1], "utf8") : args.join(" ");
if (!sql.trim()) {
  console.error('usage: node scripts/q.mjs "<sql>"  |  node scripts/q.mjs -f file.sql');
  process.exit(1);
}

// Direct first, then the regional poolers — the direct host's DNS drops out
// often enough that a one-host client turns "show me the row" into an outage.
// Same ladder scripts/migrate.mjs and the check:* scripts already walk.
const ref = E.SUPABASE_PROJECT_REF;
const CANDIDATES = [
  { name: "direct", host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["ap-south-1", "ap-southeast-1", "us-east-1", "eu-central-1"].flatMap((r) => [
    { name: `pooler-${r}:5432`, host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
    { name: `pooler-${r}:6543`, host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  ]),
];
let c = null;
let lastErr;
for (const cand of CANDIDATES) {
  const client = new pg.Client({
    host: cand.host, port: cand.port, user: cand.user,
    password: E.SUPABASE_DB_PASSWORD, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
  });
  try { await client.connect(); c = client; break; }
  catch (e) { lastErr = e; try { await client.end(); } catch {} }
}
if (!c) { console.error(`db connect failed: ${lastErr?.message}`); process.exit(1); }
try {
  const res = await c.query(sql);
  const all = Array.isArray(res) ? res : [res];
  for (const r of all) {
    if (r.rows?.length) console.table(r.rows);
    else console.log(`${r.command ?? "OK"} — ${r.rowCount ?? 0} row(s)`);
  }
} catch (e) {
  console.error("SQL ERROR:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
