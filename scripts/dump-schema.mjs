/** Dump the public schema (columns + enums) to a file so seed work can be exact. */
import fs from "node:fs";
import { connect } from "./lib/dbx.mjs";

const sql = await connect();
const out = [];

const { rows: enums } = await sql.query(`
  select t.typname, string_agg(e.enumlabel, '|' order by e.enumsortorder) labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by 1 order by 1`);
out.push("== ENUMS ==");
for (const e of enums) out.push(`${e.typname}: ${e.labels}`);

const only = process.argv.slice(2);
const { rows: cols } = await sql.query(`
  select table_name, column_name, udt_name, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' order by table_name, ordinal_position`);
out.push("\n== TABLES ==");
let cur = null;
for (const c of cols) {
  if (only.length && !only.includes(c.table_name)) continue;
  if (c.table_name !== cur) { cur = c.table_name; out.push(`\n[${cur}]`); }
  out.push(
    `  ${c.column_name} ${c.udt_name}${c.is_nullable === "NO" ? " NOT NULL" : ""}` +
      (c.column_default ? ` default ${c.column_default}` : ""),
  );
}

fs.writeFileSync(process.env.SCHEMA_OUT || "schema-dump.txt", out.join("\n"));
console.log("wrote", out.length, "lines");
await sql.end();
