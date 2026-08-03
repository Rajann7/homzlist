-- Module 12 makes four promises that are only kept if a notification exists to
-- keep them, and each one is a screen printing a sentence:
--
--   "We've emailed you a confirmation"        (P12 S2, ticket created)
--   "Our team replies within 24 hours"        (P12 S2, staff reply lands)
--   "We'll notify you when it's ready"        (P12 S5, data export)
--   "Your account will be deleted on …"       (P12 S6, deletion scheduled)
--
-- Without these types the code that raises them would fail the enum check and
-- be swallowed by notify()'s catch-all — a promise with no job behind it, and
-- an invisible one at that.
--
-- All four are TRANSACTIONAL and carry no pref_group: none of them is something
-- a user should be able to switch off. Missing "your account deletes on the
-- 12th" because a toggle was off is not a preference we should offer.

alter type public.notification_type add value if not exists 'support_ticket_created';
alter type public.notification_type add value if not exists 'support_ticket_replied';
alter type public.notification_type add value if not exists 'data_export_ready';
alter type public.notification_type add value if not exists 'account_deletion_scheduled';
