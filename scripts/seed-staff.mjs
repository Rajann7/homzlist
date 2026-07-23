/**
 * Seed a moderator into `public.staff` — DEV only.
 *
 * Staff identity is deliberately not self-serve and not a `user_role` value, so
 * there is no endpoint that can create one. Production gets its rows from the
 * admin Google whitelist (Module 11); this is how a dev gets a reviewer.
 *
 *   node scripts/seed-staff.mjs +919825012345 [staff|admin]
 *   node scripts/seed-staff.mjs --list
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

if (process.argv[2] === '--list') {
  const { data } = await s.from('staff').select('profile_id,level,is_active');
  const { data: profiles } = await s.from('profiles').select('id,phone');
  const byId = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.phone]));
  console.log((data ?? []).map((r) => `${byId[r.profile_id] ?? r.profile_id}  ${r.level}  ${r.is_active ? 'active' : 'inactive'}`).join('\n') || '(no staff)');
  process.exit(0);
}

const phone = process.argv[2];
const level = process.argv[3] === 'admin' ? 'admin' : 'staff';
if (!phone) throw new Error('usage: node scripts/seed-staff.mjs +91XXXXXXXXXX [staff|admin]');

const { data: profile } = await s.from('profiles').select('id,phone,role').eq('phone', phone).maybeSingle();
if (!profile) throw new Error(`no profile for ${phone}`);

const { error } = await s.from('staff').upsert({ profile_id: profile.id, level, is_active: true });
if (error) throw error;
console.log(JSON.stringify({ seeded: phone, profileId: profile.id, level }, null, 2));
