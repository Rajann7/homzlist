/** Shared Supabase Postgres client + .env.local loader for the QA scripts. */
import fs from "node:fs";
import pg from "pg";

export const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/**
 * The direct host resolves to an IPv6 address that this network drops often
 * enough to fail a harness mid-run (ETIMEDOUT on :5432). scripts/q.mjs and
 * scripts/migrate.mjs already walk a ladder of poolers for exactly that
 * reason — this now walks the same one, so a pixel-diff run does not die at
 * fixture-loading because one DNS answer was unroutable.
 */
function candidates() {
  const ref = env.SUPABASE_PROJECT_REF;
  return [
    { name: "direct", host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
    ...["ap-south-1", "ap-southeast-1", "us-east-1", "eu-central-1"].flatMap((region) => [
      {
        name: `pooler-${region}:5432`,
        host: `aws-0-${region}.pooler.supabase.com`,
        port: 5432,
        user: `postgres.${ref}`,
      },
      {
        name: `pooler-${region}:6543`,
        host: `aws-0-${region}.pooler.supabase.com`,
        port: 6543,
        user: `postgres.${ref}`,
      },
    ]),
  ];
}

export async function connect() {
  let lastError;
  for (const c of candidates()) {
    const sql = new pg.Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password: env.SUPABASE_DB_PASSWORD,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await sql.connect();
      return sql;
    } catch (e) {
      lastError = e;
      await sql.end().catch(() => {});
    }
  }
  throw lastError ?? new Error("no database host was reachable");
}
