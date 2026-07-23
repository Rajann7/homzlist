/**
 * One-off repair: release listing slots that were consumed by DRAFTS.
 *
 * Earlier builds drew the slot when the creation form was submitted, so a user
 * who opened the form and walked away silently lost a paid listing slot. Slots
 * are now drawn on "Submit for Review" (Doc2 §4.2), and this gives back the
 * ones that leaked.
 *
 * Only touches listings still in `draft` — anything submitted, live or archived
 * legitimately holds its slot.
 *
 *   node scripts/repair-draft-slots.mjs --dry-run
 *   node scripts/repair-draft-slots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const c = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432, user: "postgres", password: E.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();

// Two leaks to repair:
//  1. drafts that grabbed a slot at form-submit (old behaviour), and
//  2. listings deleted before ever being approved — a slot is only CONSUMED on
//     approve (Doc2 §4.2), so those should have been released.
const { rows } = await c.query(`
  select l.id, l.profile_id, l.slot_id, l.title, l.status, p.phone, s.user_plan_id
    from listings l
    join listing_slots s on s.id = l.slot_id
    join profiles p on p.id = l.profile_id
   where l.slot_id is not null
     and s.state = 'reserved'
     and (
       l.status = 'draft'
       or (l.status = 'deleted' and l.approved_at is null)
     )
`);

console.log(`${rows.length} slot(s) to release${DRY ? " (dry run)" : ""}\n`);

for (const r of rows) {
  console.log(`  ${r.phone}  [${r.status}]  ${(r.title ?? "(untitled)").slice(0, 40)}`);
  if (DRY) continue;

  // Give the quota back to the plan it came from, mark the trace row reverted,
  // and release the slot.
  await c.query(`update user_plans set listing_used = greatest(0, listing_used - 1) where id = $1`, [r.user_plan_id]);
  await c.query(
    `update plan_consumptions
        set reverted_at = now(), revert_reason = 'slot released — listing never approved'
      where id = (select id from plan_consumptions
                   where user_plan_id = $1 and kind = 'listing' and reverted_at is null
                   order by created_at desc limit 1)`,
    [r.user_plan_id],
  );
  await c.query(`update listing_slots set state='released', released_reason='repair: never approved' where id = $1`, [r.slot_id]);
  await c.query(`update listings set slot_id = null where id = $1`, [r.id]);
}

const { rows: after } = await c.query(`
  select p.phone, p.role,
         coalesce(sum(case when up.status='active' then up.listing_quota - up.listing_used else 0 end),0)::int slots
    from profiles p join user_plans up on up.profile_id = p.id
   group by p.id, p.phone, p.role order by slots desc
`);
console.log("\nlisting slots available now:");
for (const r of after) console.log(`  ${r.phone}  ${r.role.padEnd(8)}  ${r.slots}`);

await c.end();
