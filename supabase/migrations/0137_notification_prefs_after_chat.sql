-- ============================================================================
-- HomzList — Migration 0137: notification preferences after chat
--
-- Three toggles on the notification settings screen controlled features that no
-- longer exist: "New messages", "Number requests" and "Message requests". A
-- toggle that persists a value nobody reads is exactly the fake control the
-- hidden-issue hunt is about — the user turns it off and nothing changes,
-- because nothing was ever going to send.
--
-- They are hidden rather than deleted: the rows stay so historic
-- notification_pref_values keep their meaning (and so this is reversible if a
-- messaging feature ever returns), but the settings screen stops offering them.
--
-- The section that held them is renamed for what it now contains.
-- ============================================================================

alter table public.notification_pref_groups
  add column if not exists is_active boolean not null default true;

update public.notification_pref_groups
   set is_active = false
 where code in ('n_msg', 'n_numreq', 'n_msgreq');

-- "Inquiries & chats" → the section is inquiries and the leads they become.
update public.notification_pref_groups
   set section = 'Inquiries & leads'
 where section = 'Inquiries & chats';

-- The surviving inquiry toggle now also governs the two lead nudges the
-- scheduled job sends (due today / still waiting), so its sublabel says so.
update public.notification_pref_groups
   set sublabel = 'Someone inquires about your listing, and reminders about leads waiting on you'
 where code = 'n_inq';
