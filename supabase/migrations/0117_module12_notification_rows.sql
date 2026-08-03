-- The catalog rows for the four types added in 0116. Separate file because
-- Postgres will not let a new enum value be USED in the same transaction that
-- added it, and the migration runner wraps each file in one.
--
-- `pref_group` is null on all four: notification_types.pref_group null means
-- "critical, no switch exists", which is the correct answer for a ticket
-- acknowledgement, a data-export link with a 48-hour expiry, and a scheduled
-- account deletion.

insert into public.notification_types
  (code, category, label, lead_kind, lead_icon, lead_tone, href_template, actions,
   is_urgent, is_marketing, default_push, default_email, group_window_minutes,
   show_thumb, sort_order, pref_group)
values
  ('support_ticket_created', 'payment', 'Support ticket created', 'icon', 'headset', 'info',
   '/help/tickets/{ticketId}', '[]'::jsonb, true, false, true, true, 0, false, 300, null),
  ('support_ticket_replied', 'payment', 'Support replied', 'icon', 'headset', 'accent',
   '/help/tickets/{ticketId}', '[]'::jsonb, true, false, true, true, 0, false, 301, null),
  ('data_export_ready', 'payment', 'Your data is ready', 'icon', 'download', 'accent',
   '/settings/data', '[]'::jsonb, true, false, true, true, 0, false, 302, null),
  ('account_deletion_scheduled', 'payment', 'Account scheduled for deletion', 'icon', 'clock', 'warn',
   '/settings/account', '[]'::jsonb, true, false, true, true, 0, false, 303, null)
on conflict (code) do update set
  label = excluded.label,
  lead_icon = excluded.lead_icon,
  lead_tone = excluded.lead_tone,
  href_template = excluded.href_template,
  is_urgent = excluded.is_urgent,
  default_push = excluded.default_push,
  default_email = excluded.default_email;
