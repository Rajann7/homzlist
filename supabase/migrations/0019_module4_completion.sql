-- ============================================================================
-- HomzList — Migration 0019: finishing Module 4
--
-- Three things the module spec asked for that had no storage behind them:
--
-- 1. AREA CONVERSION. `toSqft()` has existed in validate.ts since 0005 and was
--    called by nothing, so "3 Vigha" was stored as {value:"3",unit:"vigha"} and
--    nothing could compare it to "1,450 sq ft". The form's own hint promises
--    "Converted automatically for search". This adds the canonical column that
--    promise needs.
--
-- 2. MODERATION. `listings.review_notes`, `reject_count` and `is_locked` have
--    been columns since 0005 and NOTHING has ever written them, because there
--    was no approve/reject path at all — every listing that reaches
--    `pending_review` stops there forever. This adds the staff whitelist the
--    moderation endpoints check, and the audit trail Doc9 requires.
--
-- 3. Requirements needed the same reject counter listings already had.
-- ============================================================================

-- ---- 1. canonical area ------------------------------------------------------

alter table public.listings
  add column if not exists area_sqft integer check (area_sqft is null or area_sqft > 0);

comment on column public.listings.area_sqft is
  'Primary area converted to sq ft at write time. Vigha/Guntha/acre are stored
   in `attributes` in the unit the seller chose; this is the comparable value
   search and sorting use.';

create index if not exists listings_area_sqft_idx on public.listings (area_sqft)
  where deleted_at is null;

-- ---- 2. staff whitelist + moderation audit ---------------------------------

-- Admin/staff identity is its OWN table, not a `user_role` value: a moderator
-- is not a kind of seller, and the admin zone is a separate subdomain with a
-- separate login (Doc6 §4). Rows are seeded by a human, never self-serve.
create table if not exists public.staff (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  level       text not null default 'staff' check (level in ('staff', 'admin')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Every moderation decision is recorded — who, what, why. An approve that
-- nobody can attribute is not an audit trail (Doc9 §audit).
create table if not exists public.moderation_log (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null check (subject in ('listing', 'requirement', 'project')),
  subject_id  uuid not null,
  actor_id    uuid not null references public.profiles(id),
  action      text not null check (action in ('approve', 'request_changes', 'reject')),
  -- Per-field notes for request_changes: {"photos":"too dark","price":"…"}.
  notes       jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists moderation_log_subject_idx
  on public.moderation_log (subject, subject_id, created_at desc);

alter table public.staff          enable row level security;
alter table public.moderation_log enable row level security;

-- ---- 3. requirements get the same reject counter ---------------------------

alter table public.requirements
  add column if not exists review_notes jsonb;

-- `reject_count` and `is_locked` already exist on requirements (0013); listings
-- got them in 0005. Nothing to add — they simply start being written now.
