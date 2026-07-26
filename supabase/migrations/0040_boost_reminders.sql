-- ============================================================================
-- HomzList — Migration 0040: boost expiry reminders (the job behind "Renew in 1 tap")
--   Doc2 §13 ("Auto-renew = 1-tap renew notification, no auto-charge") · Doc2 §14
--
-- P11 S5 renders a banner reading "Your boost ends tomorrow · Renew in 1 tap —
-- ₹1,499", and the P11 notifications screen lists the same thing as a
-- notification with a Renew button. Nothing produced either: the banner was
-- computed on read from `daysLeft <= 1`, so it only existed while the user
-- happened to be looking at the boost screen, and the notification had no
-- producer at all. Doc2 §13 is explicit that renewal is a NOTIFICATION, because
-- there is no auto-charge — if the notice never fires, the boost just dies.
--
-- One row per (boost, milestone), so the hourly cron can be re-run all day and
-- the user is told exactly once. Same shape as `plan_reminders`, which cannot be
-- reused: its `user_plan_id` is a foreign key to user_plans.
-- ============================================================================

create table if not exists public.boost_reminders (
  id         uuid primary key default gen_random_uuid(),
  boost_id   uuid not null references public.boosts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Days before `ends_at` this notice was for (1 = "ends tomorrow").
  milestone  integer not null,
  ends_at    timestamptz not null,
  sent_at    timestamptz not null default now()
);

-- The idempotency guard: the insert failing IS the "already sent" signal, so the
-- cron never needs a read-then-write race.
create unique index if not exists boost_reminders_once_idx
  on public.boost_reminders (boost_id, milestone);

create index if not exists boost_reminders_profile_idx
  on public.boost_reminders (profile_id, sent_at desc);

-- Deny-all to browser roles; the server API is the only path (Doc9 §4).
alter table public.boost_reminders enable row level security;

-- ============================================================================
-- End 0040_boost_reminders.sql
-- ============================================================================
