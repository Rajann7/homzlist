/**
 * Migration runner — DEV database only (CLAUDE.md build discipline).
 *
 * Applies every file in supabase/migrations in filename order, inside a
 * transaction each, and records what ran in `public._migrations` so re-runs are
 * no-ops. Migrations are also written idempotently (`create ... if not exists`,
 * `on conflict do nothing`), so a partially-applied history heals itself.
 *
 * Usage:
 *   node scripts/migrate.mjs            # apply pending
 *   node scripts/migrate.mjs --status   # list applied/pending, change nothing
 *   node scripts/migrate.mjs --only 0003_billing.sql
 *
 * PRODUCTION IS NEVER A TARGET HERE. The script refuses to run unless the
 * connection points at the project ref in .env.local, which is the dev project.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

// ---- env (.env.local, no extra dependency) ---------------------------------
function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) throw new Error(".env.local not found");
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const ref = env.SUPABASE_PROJECT_REF;
const password = env.SUPABASE_DB_PASSWORD;
if (!ref || !password) throw new Error("SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD are required");

/**
 * Supabase exposes a direct host (IPv6-only on newer projects) and IPv4 poolers.
 * Try each in turn so this works on any network.
 */
const CANDIDATES = [
  { name: "direct", host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["ap-south-1", "ap-southeast-1", "us-east-1", "us-west-1", "eu-central-1", "eu-west-2"].flatMap((region) => [
    { name: `pooler-${region}:5432`, host: `aws-0-${region}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
    { name: `pooler-${region}:6543`, host: `aws-0-${region}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  ]),
];

async function connect() {
  let lastErr;
  for (const c of CANDIDATES) {
    const client = new pg.Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      statement_timeout: 120000,
    });
    try {
      await client.connect();
      console.log(`connected via ${c.name} (${c.host}:${c.port})`);
      return client;
    } catch (e) {
      lastErr = e;
      try { await client.end(); } catch {}
    }
  }
  throw new Error(`could not connect to the dev database. Last error: ${lastErr?.message}`);
}

async function main() {
  const args = process.argv.slice(2);
  const statusOnly = args.includes("--status");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const client = await connect();

  try {
    await client.query(`
      create table if not exists public._migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      )
    `);
    const { rows } = await client.query("select name from public._migrations");
    const applied = new Set(rows.map((r) => r.name));

    if (statusOnly) {
      for (const f of files) console.log(`${applied.has(f) ? "applied" : "PENDING"}  ${f}`);
      return;
    }

    const pending = files.filter((f) => (only ? f === only : !applied.has(f)));
    if (!pending.length) {
      console.log("nothing to apply — database is up to date");
      return;
    }

    for (const f of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
      process.stdout.write(`applying ${f} … `);
      try {
        // Each migration is atomic: a failure rolls the whole file back so the
        // schema is never left half-migrated.
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public._migrations (name) values ($1) on conflict (name) do nothing", [f]);
        await client.query("commit");
        console.log("ok");
      } catch (e) {
        await client.query("rollback");
        console.log("FAILED");
        throw e;
      }
    }
    console.log(`\ndone — ${pending.length} migration(s) applied`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\nmigration error:", e.message);
  process.exit(1);
});
