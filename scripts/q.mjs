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

const c = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: E.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();
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
