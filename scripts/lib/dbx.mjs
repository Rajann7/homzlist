/** Shared Supabase Postgres client + .env.local loader for the QA scripts. */
import fs from "node:fs";
import pg from "pg";

export const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

export async function connect() {
  const sql = new pg.Client({
    host: `db.${env.SUPABASE_PROJECT_REF}.supabase.co`,
    port: 5432, user: "postgres", password: env.SUPABASE_DB_PASSWORD,
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await sql.connect();
  return sql;
}
