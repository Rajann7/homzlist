-- 0109 added the enum values; the notification system is config-driven
-- (lib/notifications/catalog.ts reads `notification_types`, never a switch), so
-- a type with no row here renders with no icon, no tone and no href. These are
-- the rows for the three admin actions A11 can take.
--
-- All three are urgent and none is marketing: they are things that happened TO
-- the account, so `pref_group` stays null — there is no toggle that silences
-- being suspended.

insert into public.notification_types
  (code, category, label, lead_kind, lead_icon, lead_tone, href_template, actions,
   is_urgent, is_marketing, default_push, default_email, group_window_minutes, show_thumb, sort_order, pref_group)
values
  ('account_suspended', 'listing', 'Account suspended', 'icon', 'alert', 'err', '/profile', '[]'::jsonb,
   true, false, true, true, 0, false, 0, null),
  ('admin_message', 'listing', 'Message from HomzList', 'icon', 'mail', 'info', '/notifications', '[]'::jsonb,
   true, false, true, true, 0, false, 0, null),
  ('role_changed', 'listing', 'Account type changed', 'icon', 'user', 'info', '/profile', '[]'::jsonb,
   true, false, true, true, 0, false, 0, null)
on conflict (code) do nothing;
