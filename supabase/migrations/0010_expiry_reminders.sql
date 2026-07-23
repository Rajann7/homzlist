-- ============================================================================
-- HomzList — Migration 0010: make expiry reminders REAL
--
-- The My Plan screen shipped a "Reminders on — we'll notify you 7 days and 1 day
-- before expiry" card whose toggle was frontend `useState` only: no column, no
-- endpoint, no job. Flipping it persisted nothing and nothing was ever sent.
-- That breaks the A-to-Z database rule (CLAUDE.md §7/§12) — a control that looks
-- real must write to a table, and a promise the screen makes must have a job
-- behind it.
--
-- This adds both halves:
--   * notification_prefs — the user's actual, persisted preference.
--   * plan_reminders     — one row per (plan, milestone) actually sent, so the
--                          hourly job is idempotent and can never double-send.
-- ============================================================================

-- ---- preferences -------------------------------------------------------------
create table if not exists public.notification_prefs (
  profile_id       uuid primary key references public.profiles(id) on delete cascade,
  -- Expiry reminders for plans and boosts (the My Plan toggle).
  expiry_reminders boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Everyone is opted in by default, matching the design's "Reminders on" state.
-- Backfilled so existing users read a real row rather than an implied default.
insert into public.notification_prefs (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

-- ---- delivery ledger ---------------------------------------------------------
-- `milestone` is the number of days before expiry the reminder is for (7 or 1).
create table if not exists public.plan_reminders (
  id           uuid primary key default gen_random_uuid(),
  user_plan_id uuid not null references public.user_plans(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  milestone    integer not null check (milestone in (7, 1)),
  expires_at   timestamptz not null,   -- the expiry this reminder was about
  sent_at      timestamptz not null default now(),
  -- THE idempotency guarantee: an hourly job re-running inside the same window
  -- cannot send the same milestone twice.
  unique (user_plan_id, milestone)
);
create index if not exists plan_reminders_profile_idx on public.plan_reminders (profile_id, sent_at desc);

-- ---- RLS: deny-all for browsers, service role is the only path ---------------
alter table public.notification_prefs enable row level security;
alter table public.plan_reminders     enable row level security;
