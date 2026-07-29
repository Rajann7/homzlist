-- ============================================================================
-- HomzList — Migration 0082: register `chat_declined` in the type catalog
--
-- Split from 0081 on purpose: a migration runs inside ONE transaction, and
-- Postgres refuses to USE an enum value that was added by the same transaction.
-- 0081 adds the value; this file is the first statement allowed to reference it.
--
-- The screen reads its icon, tone, deep-link, grouping window and channel
-- defaults from `notification_types` (CLAUDE.md §7 — no option list in a
-- component), so a type that isn't here renders nothing.
-- ============================================================================

insert into public.notification_types
  (code, category, label, lead_kind, lead_icon, lead_tone, href_template, actions,
   is_urgent, is_marketing, default_push, default_email, group_window_minutes, show_thumb)
values
  -- Mirrors chat_accepted (its counterpart) but tone 'warn': the body carries the
  -- cooldown date the sender must wait out before re-inquiring.
  ('chat_declined','inquiry','Inquiry declined','avatar',null,'warn','/messages/{threadId}',
   '[]'::jsonb, false, false, true, false, 0, false)
on conflict (code) do nothing;

-- Same preference group as the other message-request events, so muting message
-- requests mutes this too instead of leaking past the user's choice.
update public.notification_types set pref_group = 'n_msgreq' where code = 'chat_declined';

-- ============================================================================
-- End 0082_chat_declined_type.sql
-- ============================================================================
