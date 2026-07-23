import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: defs } = await s.from('field_definitions').select('key,control,options,show_if').eq('is_active', true);
const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
const { data: types } = await s.from('property_types').select('*').eq('is_active', true).order('sort_order');

let bad = 0;
for (const role of ['owner', 'broker', 'builder']) {
  const mine = types.filter((t) => t.roles.includes(role));
  console.log(`\n=== ${role} — ${mine.length} types`);
  for (const t of mine) {
    const fields = t.field_config.fields ?? [];
    const missing = fields.filter((f) => !byKey[f]);
    const req = t.field_config.required ?? [];
    const reqNotInFields = req.filter((r) => !fields.includes(r));
    // A chips/select/multi with no options renders an empty row the user can't use.
    const empty = fields.filter((f) => byKey[f]
      && ['chips', 'select', 'multi'].includes(byKey[f].control)
      && (byKey[f].options ?? []).length === 0);
    // show_if pointing at a field this type doesn't have = permanently hidden.
    const orphanCond = fields.filter((f) => byKey[f]?.show_if && !fields.includes(byKey[f].show_if.field));
    const flag = missing.length || reqNotInFields.length || empty.length || orphanCond.length;
    if (flag) bad++;
    console.log(
      `${flag ? 'FAIL' : ' ok '} ${t.code.padEnd(11)} kinds=${JSON.stringify(t.kinds).padEnd(16)} fields=${String(fields.length).padStart(2)} req=${JSON.stringify(req)}` +
      (missing.length ? ` MISSING_DEF=${JSON.stringify(missing)}` : '') +
      (reqNotInFields.length ? ` REQ_NOT_RENDERED=${JSON.stringify(reqNotInFields)}` : '') +
      (empty.length ? ` NO_OPTIONS=${JSON.stringify(empty)}` : '') +
      (orphanCond.length ? ` ORPHAN_SHOW_IF=${JSON.stringify(orphanCond)}` : ''),
    );
  }
}
console.log(bad ? `\n${bad} type(s) with problems` : '\nall types clean');
