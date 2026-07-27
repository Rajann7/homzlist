-- ============================================================================
-- HomzList — Migration 0050
--   (a) boost credits: unused boost days survive the subject that was carrying
--       them, and can be spent on a different listing / project / requirement
--   (b) edited_since_approval: a subject that was only PAUSED (not edited) goes
--       straight back live instead of queueing for a second moderation pass
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) Boost credits
--
-- Until now, a boost whose subject went sold / rented / off was set to
-- `stopped` and every unused day was simply burned ("Sold mid-boost → stop, no
-- refund"). The seller paid for 30 days of placement, sold on day 4, and lost
-- 26 days they had already paid for.
--
-- No refund is still correct — money does not go back — but the DAYS are now
-- reclaimable: they become a credit on the seller's account which they can
-- apply to any other eligible subject, at no further charge. So the boost
-- history stays honest (that boost really did run on that subject for 4 days)
-- while the value the seller bought is not destroyed by them succeeding.
--
-- One row per interrupted boost. `days` is whole days, floored, so a partial
-- day is never rounded up into a free extra day.
-- ---------------------------------------------------------------------------
create table if not exists public.boost_credits (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  -- The boost that was cut short. `on delete cascade` because a credit with no
  -- provenance is not auditable and must not outlive its source.
  source_boost_id uuid not null references public.boosts(id) on delete cascade,
  days            integer not null check (days > 0),
  reason          text,
  -- Credits expire, or an account could hoard placement indefinitely and spend
  -- it years later at today's prices. 90 days from issue.
  expires_at      timestamptz not null default (now() + interval '90 days'),
  -- Set when spent, together with the boost it paid for. Both move in the same
  -- statement, so a credit can never be spent twice (see the partial unique
  -- index below, which is the actual guard).
  consumed_at     timestamptz,
  consumed_boost_id uuid references public.boosts(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- One credit per interrupted boost — the issuing path is idempotent, so a
-- retried stop (or two racing status changes) cannot mint a second credit for
-- the same boost.
create unique index if not exists boost_credits_source_unique
  on public.boost_credits (source_boost_id);

-- The "you have N boost days" strip reads unspent, unexpired credits for one
-- profile; this is the index behind it.
create index if not exists boost_credits_unspent_idx
  on public.boost_credits (profile_id, expires_at)
  where consumed_at is null;

alter table public.boost_credits enable row level security;

comment on table public.boost_credits is
  'Unused boost days released when a boosted subject is sold/rented/turned off — spendable on another subject, never refunded as money.';

-- ---------------------------------------------------------------------------
-- (b) edited_since_approval
--
-- Re-activating a listing (or unhiding it, or switching a requirement back on)
-- sent it to `pending_review` unconditionally. That is the right call when the
-- content changed — but a seller who merely marked a flat "rented" for two
-- months and then wants it back had to queue behind moderation again for
-- content a moderator had ALREADY approved, unchanged.
--
-- This flag is the distinction. It is set the moment content is edited and
-- cleared the moment a moderator approves. So:
--
--   was live before  AND  not edited since approval  →  straight back to live
--   anything else                                    →  pending_review
--
-- Defaulting to false is safe for the backfill: every existing row is either
-- already live (approved, unedited as far as we can tell) or is going through
-- review anyway, and the `live_at is not null` half of the condition is what
-- stops a never-approved row from skipping review on this flag alone.
-- ---------------------------------------------------------------------------
alter table public.listings     add column if not exists edited_since_approval boolean not null default false;
alter table public.projects     add column if not exists edited_since_approval boolean not null default false;
alter table public.requirements add column if not exists edited_since_approval boolean not null default false;

comment on column public.listings.edited_since_approval is
  'Content changed since the last moderator approval. Cleared on approve; blocks the straight-back-to-live path in setListingStatus.';
