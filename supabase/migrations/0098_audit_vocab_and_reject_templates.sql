-- Two data problems found while building Module 11, both of the same kind: the
-- seed and the code describe the same thing in different words, so a filter
-- written against one silently misses the other.

-- ---------------------------------------------------------------- audit vocab
-- scripts/seed-admin.mjs wrote admin_audit_log.actor_role as display labels
-- ("Super Admin") and action as prose ("Plan edit"), while lib/admin/audit.ts
-- writes canonical codes ("super", "flag_change"). A26's filter chips (Doc5 A26:
-- "Action ▾ Approve · Reject · … · Export") would have matched the code's rows
-- and quietly skipped the 600 seeded ones — a filter that looks like it works.
--
-- Codes are the storage format and labels are a rendering concern, so the seed
-- rows move to codes rather than the code learning to speak both.

update public.admin_audit_log set actor_role = 'super' where actor_role = 'Super Admin';
update public.admin_audit_log set actor_role = 'admin' where actor_role = 'Admin';
update public.admin_audit_log set actor_role = 'staff' where actor_role = 'Staff';

update public.admin_audit_log set action = case action
  when 'Approve'         then 'approve'
  when 'Reject'          then 'reject'
  when 'Request changes' then 'request_changes'
  when 'Edit'            then 'edit'
  when 'Suspend'         then 'suspend'
  when 'Lift suspension' then 'lift_suspension'
  when 'Delete'          then 'delete'
  when 'Refund'          then 'refund'
  when 'Grant'           then 'grant'
  when 'Adjust balance'  then 'adjust_balance'
  when 'Role change'     then 'role_change'
  when 'Impersonate'     then 'impersonate_start'
  when 'Flag change'     then 'flag_change'
  when 'Export'          then 'export'
  when 'Master data'     then 'edit'
  when 'Verification'    then 'approve'
  when 'Boost approve'   then 'approve'
  when 'Boost reject'    then 'reject'
  when 'Report action'   then 'edit'
  when 'Ticket close'    then 'edit'
  when 'Dispute resolve' then 'edit'
  when 'Plan edit'       then 'edit'
  when 'Coupon'          then 'edit'
  when 'Banner schedule' then 'publish'
  when 'Broadcast'       then 'send'
  else action
end
where action <> lower(action);

-- The seeded rows lost their nuance in that mapping (a boost approval and a
-- listing approval are both 'approve' now), but entity_type already carries it
-- — 'approve' + entity_type 'boost' is exactly how the code writes it too.

-- ------------------------------------------------------------ reject templates
-- First, a schema flaw that made A5 impossible: reject_templates has a
-- subject_type column so each queue can have its own reasons, but the primary
-- key is `code` ALONE. So 'contact' could exist for listings or for
-- requirements, never both — the second queue's reason list could not be
-- written at all. The key is (code, subject_type), which is what the column was
-- there for.
alter table public.reject_templates drop constraint if exists reject_templates_pkey;
alter table public.reject_templates add  constraint reject_templates_pkey primary key (code, subject_type);

-- 0088 seeded eight listing reject reasons in its own wording; designs/P13-14-15
-- draws eight DIFFERENT ones in A4's reject dialog. The dialog is locked design
-- and the poster is shown whichever reason is picked, so the design wins on
-- wording — but rule 7 says the list still comes from the table, not the
-- component. So: rename what maps, add what the design has and the table
-- lacked, and DEACTIVATE (never delete) the three the design does not draw, so
-- turning them back on is one flag flip if Rajan wants them.
update public.reject_templates set label = 'Photos don''t match the property' where code = 'photos'   and subject_type = 'listing';
update public.reject_templates set label = 'Price is unrealistic'             where code = 'price'    and subject_type = 'listing';
update public.reject_templates set label = 'Contact details in content'       where code = 'contact'  and subject_type = 'listing';
update public.reject_templates set label = 'Prohibited content'               where code = 'policy'   and subject_type = 'listing';

update public.reject_templates set is_active = false
 where subject_type = 'listing' and code in ('doc', 'incomplete', 'location');

insert into public.reject_templates (code, subject_type, label, body, sort_order, is_active) values
  ('fake',     'listing', 'Fake or misleading',     'This listing appears to be fake or misleading.',            2, true),
  ('category', 'listing', 'Wrong category or type', 'The category or property type does not match the listing.', 5, true),
  ('other',    'listing', 'Other',                  '',                                                          8, true)
on conflict (code, subject_type) do update set label = excluded.label, is_active = true;

update public.reject_templates set sort_order = 1 where subject_type='listing' and code='dup';
update public.reject_templates set sort_order = 3 where subject_type='listing' and code='photos';
update public.reject_templates set sort_order = 4 where subject_type='listing' and code='price';
update public.reject_templates set sort_order = 6 where subject_type='listing' and code='contact';
update public.reject_templates set sort_order = 7 where subject_type='listing' and code='policy';

-- A5 says the requirement queue's actions are "identical" to A3/A4's, but the
-- table only ever had listing rows — so the requirement reject dialog would
-- have opened with an empty reason list and no way to submit.
insert into public.reject_templates (code, subject_type, label, body, sort_order, is_active) values
  ('dup',      'requirement', 'Duplicate requirement',      'An identical requirement is already active.',                1, true),
  ('fake',     'requirement', 'Fake or misleading',         'This requirement appears to be fake or misleading.',         2, true),
  ('budget',   'requirement', 'Budget is unrealistic',      'The budget range is not plausible for the areas requested.', 3, true),
  ('areas',    'requirement', 'Areas are not valid',        'The preferred areas are not in our master data.',            4, true),
  ('contact',  'requirement', 'Contact details in content', 'Please remove contact details from the notes.',              5, true),
  ('ad',       'requirement', 'Disguised advertisement',    'This is an advertisement, not a genuine requirement.',       6, true),
  ('policy',   'requirement', 'Prohibited content',         'This requirement is against our content policy.',            7, true),
  ('other',    'requirement', 'Other',                      '',                                                          8, true)
on conflict (code, subject_type) do nothing;
