-- ============================================================================
-- HomzList — Migration 0001: Auth & Entry (Module 1)
-- Human-run only (Doc6 / CLAUDE.md — Claude never writes prod DB directly).
--
-- RLS posture: tables have RLS ENABLED with NO permissive policy for the
-- anon/authenticated roles → direct client (anon-key) access returns nothing
-- (the second wall, Doc9 §4). All legitimate access goes through server API
-- routes using the service-role key with explicit authorization.
-- ============================================================================

create extension if not exists pgcrypto;

-- cities — minimal location master so the city sheet is backend-driven.
create table if not exists public.cities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  state         text not null,
  slug          text unique not null,
  property_count integer not null default 0,
  is_active     boolean not null default true,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now()
);

insert into public.cities (name, state, slug, property_count, sort_order) values
  ('Rajkot',     'Gujarat',     'rajkot',     1240, 1),
  ('Ahmedabad',  'Gujarat',     'ahmedabad',  3820, 2),
  ('Surat',      'Gujarat',     'surat',      2150, 3),
  ('Vadodara',   'Gujarat',     'vadodara',   1470, 4),
  ('Mumbai',     'Maharashtra', 'mumbai',     5310, 5)
on conflict (slug) do nothing;

-- profiles — one row per user (keyed by E.164 phone). Doc2 §3 / §11.
do $$ begin
  create type user_role as enum ('owner', 'broker', 'builder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_state as enum ('active', 'suspended', 'deactivated', 'deleted', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  phone          text unique not null,
  role           user_role,
  name           text,
  city_id        uuid references public.cities(id),
  photo_url      text,
  bio            text,
  state          account_state not null default 'active',
  is_registered  boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists profiles_phone_idx on public.profiles (phone);
create index if not exists profiles_city_idx on public.profiles (city_id);

-- auth_consents — versioned consent log (DPDP / 18+ / T&C). Append-only.
create table if not exists public.auth_consents (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('age18', 'dpdp', 'tc')),
  version     text not null,
  accepted    boolean not null default true,
  ip_hash     text,
  accepted_at timestamptz not null default now()
);

create index if not exists auth_consents_profile_idx on public.auth_consents (profile_id);

create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.cities        enable row level security;
alter table public.profiles      enable row level security;
alter table public.auth_consents enable row level security;

drop policy if exists cities_public_read on public.cities;
create policy cities_public_read on public.cities
  for select to anon, authenticated using (is_active = true);
-- profiles / auth_consents: no client policy → only service-role reaches them.
