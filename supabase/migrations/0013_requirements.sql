-- ============================================================================
-- HomzList — Migration 0013: requirements (Module 4, P6 S4 "Post a requirement")
--
-- The requirement FORM is a creation flow, so it ships with Module 4 alongside
-- listings and projects. Browsing, matching and proposals are Module 5 and are
-- deliberately NOT built here — but the table carries the columns those will
-- need, so Module 5 adds behaviour, not another migration to the same rows.
--
-- Quota: a requirement post consumes the `requirement` kind from the pooled
-- plan balance via the existing `consume_quota` RPC (migration 0003/0004).
-- Doc2 §4.2's rule is deliberate and enforced elsewhere: turning a requirement
-- OFF, or deleting it, still counts — only turning it back ON after a renewal
-- consumes again. That is why `slot_consumed_at` is recorded per requirement.
-- ============================================================================

do $$ begin
  create type requirement_state as enum (
    'draft','pending_review','changes_requested','rejected',
    'live','paused','fulfilled','expired','deleted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type requirement_urgency as enum ('immediate','1_3_months','exploring');
exception when duplicate_object then null; end $$;

create table if not exists public.requirements (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,

  -- "Looking for": buy | rent, reusing the listing enum so matching can compare
  -- a requirement to a listing without translating between two vocabularies.
  kind           listing_kind not null default 'sell',
  type_code      text not null references public.property_types(code),
  -- BHK is hidden by the form for Plot/Office/Shop, so it stays nullable.
  bhk            integer check (bhk is null or (bhk >= 1 and bhk <= 10)),

  -- Budget in paise. Both ends optional (a user may state only a ceiling), but
  -- when both are present max must not be below min — enforced here, not just
  -- in the form, because the browser is never trusted (Doc9 §6).
  budget_min_paise bigint check (budget_min_paise is null or budget_min_paise >= 0),
  budget_max_paise bigint check (budget_max_paise is null or budget_max_paise >= 0),
  constraint budget_range_sane check (
    budget_min_paise is null or budget_max_paise is null
    or budget_max_paise >= budget_min_paise
  ),

  -- Preferred areas: up to 5 (Doc4 S4). Denormalised ids for matching, plus a
  -- display label so cards don't need a join.
  area_ids       uuid[] not null default '{}',
  area_label     text,
  city_id        uuid references public.locations(id),

  urgency        requirement_urgency not null default 'immediate',
  notes          text,

  status         requirement_state not null default 'draft',
  -- Live/paused is the P8 toggle; `is_active` mirrors it for cheap filtering.
  is_active      boolean not null default true,

  -- Moderation, same shape as listings so the admin queue can treat them alike.
  reject_count   integer not null default 0,
  review_notes   jsonb,
  reject_reason  text,
  is_locked      boolean not null default false,
  flagged_reason text,                    -- number/URL in notes → admin queue

  -- Quota trace: which consumption row paid for this, and when.
  consumption_id uuid,
  slot_consumed_at timestamptz,

  -- 30-day life (Doc7 §62).
  submitted_at   timestamptz,
  approved_at    timestamptz,
  live_at        timestamptz,
  expires_at     timestamptz,
  fulfilled_at   timestamptz,
  deleted_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists requirements_owner_idx on public.requirements (profile_id, status, created_at desc);
create index if not exists requirements_live_idx  on public.requirements (status, is_active, city_id, created_at desc) where status = 'live';
-- Matching (Module 5) scans by area; GIN over the array keeps that cheap.
create index if not exists requirements_areas_idx on public.requirements using gin (area_ids);
create index if not exists requirements_expiry_idx on public.requirements (status, expires_at) where expires_at is not null;

drop trigger if exists requirements_updated_at on public.requirements;
create trigger requirements_updated_at before update on public.requirements
  for each row execute function public.set_updated_at();

-- Deny-all for browsers; the server API is the only path (same as every other
-- table in this schema — Doc9 §4).
alter table public.requirements enable row level security;
