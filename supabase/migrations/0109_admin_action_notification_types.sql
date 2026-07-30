-- A11's action bar notifies the user for things that are not a report outcome.
-- Until now the only admin-shaped type was `report_outcome`, so a suspension
-- raised from the user panel — where there is no report at all — arrived tagged
-- as one, and the notification centre's own filters would file it wrongly.
--
-- `suspension_lifted` already existed and was going unused for the same reason.

alter type public.notification_type add value if not exists 'account_suspended';
alter type public.notification_type add value if not exists 'admin_message';
alter type public.notification_type add value if not exists 'role_changed';
