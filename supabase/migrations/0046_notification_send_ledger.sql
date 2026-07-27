-- ============================================================================
-- HomzList — Migration 0046: one idempotency ledger for the scheduled notices
--   Doc2 §14 (requirement expiry 5d/1d, plan expiry + grace, trial 2d/0d,
--   performance nudge, weekly digests) · Doc7 §21
--
-- Every one of those is a JOB that re-runs. Without a claim row each run would
-- re-send: "your requirement expires in 5 days" every hour for five days.
-- `plan_reminders` and `boost_reminders` already do this for their own two
-- cases; rather than adding four more near-identical tables, this is the one
-- generic ledger the remaining jobs claim through.
--
-- The UNIQUE key IS the claim: the job inserts first and only sends if the
-- insert won. A crash between the two loses one notification, never duplicates
-- one — the safe direction for something that pushes to a phone.
-- ============================================================================

create table if not exists public.notification_sends (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- what job this is: 'requirement_expiry' | 'plan_grace' | 'performance_nudge'
  -- | 'weekly_digest' | 'requirement_match'
  kind       text not null,
  -- the thing it is about (a requirement id, a listing id, a plan id…); the
  -- ISO week for a digest has no subject, so it is nullable.
  subject_id uuid,
  -- which occurrence: days-before for a reminder, the ISO week for a digest.
  milestone  text not null default '',
  sent_at    timestamptz not null default now(),
  unique (profile_id, kind, subject_id, milestone)
);
create index if not exists notification_sends_kind_idx
  on public.notification_sends (kind, sent_at desc);

-- Postgres treats NULLs as distinct in a UNIQUE constraint, so a subject-less
-- claim (the weekly digest) would not actually be unique. This partial index is
-- what makes "one digest per user per week" true.
create unique index if not exists notification_sends_nosubject_uq
  on public.notification_sends (profile_id, kind, milestone)
  where subject_id is null;

alter table public.notification_sends enable row level security;

-- ============================================================================
-- End 0046_notification_send_ledger.sql
-- ============================================================================
