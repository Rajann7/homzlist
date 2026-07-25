/**
 * Prints what is ACTUALLY stored in Supabase, so "is this really
 * database-backed?" can be answered with data instead of assurances.
 *
 *   npm run db:proof
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

const c = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432, user: "postgres", password: E.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
console.log(`Supabase project: ${E.SUPABASE_PROJECT_REF}\n`);

const TABLES = [
  ["profiles", "Module 1-2 · accounts"],
  ["verifications", "Module 2 · ID/RERA"],
  ["plan_catalog", "Module 3 · plans (admin-editable)"],
  ["orders", "Module 3 · checkout orders"],
  ["payments", "Module 3 · Razorpay payments"],
  ["invoices", "Module 3 · GST invoices"],
  ["user_plans", "Module 3 · entitlements"],
  ["plan_consumptions", "Module 3 · consumed trace"],
  ["listing_slots", "Module 3-4 · slot state machine"],
  ["boosts", "Module 3 · boosts"],
  ["coupons", "Module 3 · coupons"],
  ["coupon_claims", "Module 3 · per-user coupon slots"],
  ["notification_prefs", "Module 3 · reminder opt-in/out"],
  ["plan_reminders", "Module 3 · reminders actually sent"],
  ["listings", "Module 4 · listings"],
  ["listing_photos", "Module 4 · photos"],
  ["locations", "Module 4 · location master"],
  ["property_types", "Module 4 · dynamic field config"],
  ["field_definitions", "Module 4 · field labels + option lists"],
  ["listing_views", "Module 4 · unique detail opens per day"],
  ["staff", "Module 4 · who may moderate"],
  ["moderation_log", "Module 4 · every approve/changes/reject, attributed"],
  ["inquiries", "Module 6 · inquiry → chat request"],
  ["proposals", "Module 5 · requirement proposals"],
  ["visits", "Module 5-7 · scheduled site visits"],
  ["leads", "Module 5-7 · broker/builder pipeline"],
  ["chat_threads", "Module 7 · conversations (inquiry/proposal)"],
  ["thread_participants", "Module 7 · per-side pin/mute/archive/read"],
  ["chat_messages", "Module 7 · every bubble/system card"],
  ["number_requests", "Module 7 · sealed number request/allow"],
  ["chat_blocks", "Module 7 · directional blocks"],
  ["chat_templates", "Module 7 · quick-reply templates"],
  ["notifications", "Module 7 · in-app notification records"],
  ["push_tokens", "Module 7 · FCM device tokens (push)"],
];

console.log("TABLE                 ROWS   RLS  POLICIES   PURPOSE");
for (const [t, purpose] of TABLES) {
  const n = (await c.query(`select count(*)::int n from public.${t}`)).rows[0].n;
  const r = (
    await c.query(
      `select c.relrowsecurity rls,(select count(*) from pg_policy p where p.polrelid=c.oid) pol
         from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
        where ns.nspname='public' and c.relname=$1`,
      [t],
    )
  ).rows[0];
  console.log(`${t.padEnd(20)} ${String(n).padStart(5)}   ${r.rls ? "on " : "OFF"}   ${String(r.pol).padStart(5)}      ${purpose}`);
}

console.log("\nPer-user state (all server-computed, nothing cached in the browser):");
const users = await c.query(`
  select p.phone, p.role,
         (select count(*)::int from user_plans u where u.profile_id=p.id and u.status='active') plans,
         coalesce((select sum(u.listing_quota-u.listing_used) from user_plans u
                    where u.profile_id=p.id and u.status='active' and u.listing_quota>=0),0)::int slots,
         (select count(*)::int from listings l where l.profile_id=p.id and l.status<>'deleted') listings,
         (select count(*)::int from payments pa where pa.profile_id=p.id and pa.status='success') paid
    from profiles p
   where exists (select 1 from user_plans u where u.profile_id=p.id)
   order by paid desc`);
for (const u of users.rows) {
  console.log(`  ${u.phone}  ${u.role.padEnd(8)}  plans=${u.plans}  slotsLeft=${u.slots}  listings=${u.listings}  successfulPayments=${u.paid}`);
}

console.log("\nRLS with 0 policies = browsers can read nothing directly; the server API is the only path.");
await c.end();
