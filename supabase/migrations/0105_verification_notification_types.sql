-- The catalog rows for the three verification events whose enum labels migration
-- 0104 added. Same shape as their closest neighbours (listing_approved /
-- listing_rejected): urgent, push + email on, no grouping window.
--
-- `pref_group` is null on all three: a user must not be able to switch off being
-- told their verified badge was removed.
insert into public.notification_types
  (code, category, label, lead_kind, lead_icon, lead_tone, href_template,
   actions, is_urgent, is_marketing, default_push, default_email,
   group_window_minutes, show_thumb, sort_order, pref_group)
values
  ('verification_approved', 'listing', 'Verification approved', 'icon', 'verified',   'accent', '/settings/verification',
   '[]'::jsonb, true, false, true, true, 0, false, 0, null),
  ('verification_rejected', 'listing', 'Verification rejected', 'icon', 'x-circle',   'err',    '/settings/verification',
   '[]'::jsonb, true, false, true, true, 0, false, 0, null),
  ('verification_revoked',  'listing', 'Verification revoked',  'icon', 'shield-off', 'err',    '/settings/verification',
   '[]'::jsonb, true, false, true, true, 0, false, 0, null)
on conflict (code) do nothing;
