-- ============================================================================
-- A16 Churn's row menu sends a renewal reminder by hand.
--
-- `plan_reminders` is the cron's ledger and it is shaped for the cron:
-- `milestone` is CHECK-constrained to 7 or 1 (days before expiry), and
-- UNIQUE (user_plan_id, milestone) is what stops the hourly sweep sending the
-- same nudge twice. An admin's manual send fits neither: it has no milestone,
-- and it may legitimately happen more than once over a long plan.
--
-- Writing it somewhere else would give the platform two reminder ledgers, and
-- the cron would happily send a duplicate an hour after an admin already did.
-- So milestone 0 means MANUAL, and the uniqueness that protects the cron is
-- narrowed to the cron's own milestones.
-- ============================================================================
alter table public.plan_reminders drop constraint if exists plan_reminders_milestone_check;
alter table public.plan_reminders
  add constraint plan_reminders_milestone_check check (milestone = any (array[0, 1, 7]));

alter table public.plan_reminders drop constraint if exists plan_reminders_user_plan_id_milestone_key;
create unique index if not exists plan_reminders_cron_once
  on public.plan_reminders (user_plan_id, milestone)
  where milestone <> 0;

create index if not exists plan_reminders_manual_idx
  on public.plan_reminders (user_plan_id, sent_at desc)
  where milestone = 0;

comment on column public.plan_reminders.milestone is
  '7 or 1 = days before expiry, sent by the billing cron. 0 = sent by hand from A16.';
