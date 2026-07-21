-- ============================================================================
-- HomzList — Migration 0002: Roles & Profiles (Module 2)
-- Human-run only. Extends profiles + adds verification / role-change /
-- moderation (account-status) tables. RLS: deny-all for clients (server API is
-- the access path via service-role, Doc9 §4).
-- ============================================================================

-- ---- profiles: profile-suite fields (Doc2 §11) -----------------------------
alter table public.profiles
  add column if not exists username         text,
  add column if not exists email            text,
  add column if not exists company_logo_url text,
  add column if not exists established_year integer,
  add column if not exists projects_done    integer,
  add column if not exists office_address   text,
  add column if not exists areas_covered    text[],
  add column if not exists response_label   text; -- e.g. "Usually responds in 2 hours" (auto-calc later)

-- Unique username (nullable until backfilled/registered).
create unique index if not exists profiles_username_idx on public.profiles (lower(username)) where username is not null;

-- Backfill a username for any existing registered rows (slug of name + short id).
update public.profiles
set username = regexp_replace(lower(coalesce(name, 'user')), '[^a-z0-9]', '', 'g') || substr(id::text, 1, 4)
where username is null and is_registered = true;

-- ---- verifications (Phone / ID / RERA — Doc2 §11 / Doc7 §2) -----------------
do $$ begin
  create type verify_level as enum ('phone', 'id', 'rera');
exception when duplicate_object then null; end $$;
do $$ begin
  create type verify_status as enum ('not_started', 'pending', 'approved', 'rejected', 'revoked');
exception when duplicate_object then null; end $$;

create table if not exists public.verifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  level        verify_level not null,
  status       verify_status not null default 'not_started',
  doc_type     text,                 -- id: Aadhaar / PAN / …
  doc_key      text,                 -- private R2 key (owner+admin only)
  rera_number  text,
  reason       text,                 -- rejection / revoke reason
  valid_till   date,                 -- rera validity
  submitted_at timestamptz,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (profile_id, level)
);
create index if not exists verifications_profile_idx on public.verifications (profile_id);

-- Phone is verified at registration → seed a phone row for existing registered users.
insert into public.verifications (profile_id, level, status, reviewed_at)
select id, 'phone', 'approved', now() from public.profiles where is_registered = true
on conflict (profile_id, level) do nothing;

-- ---- role change requests (admin-approval — Doc2 §2) -----------------------
do $$ begin
  create type request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.role_change_requests (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  from_role  user_role,
  to_role    user_role not null,
  status     request_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists rcr_profile_idx on public.role_change_requests (profile_id, status);

-- ---- moderation events (account status + bio auto-flags — Doc2 §11) --------
create table if not exists public.moderation_events (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('rejection', 'warning', 'bio_flag', 'report_outcome')),
  severity   text not null default 'warning' check (severity in ('error', 'warning', 'info')),
  title      text not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists mod_events_profile_idx on public.moderation_events (profile_id, created_at desc);

-- ---- triggers ---------------------------------------------------------------
drop trigger if exists verifications_updated_at on public.verifications;
create trigger verifications_updated_at before update on public.verifications
  for each row execute function public.set_updated_at();

-- ---- RLS (deny-all for clients; server service-role only) -------------------
alter table public.verifications        enable row level security;
alter table public.role_change_requests enable row level security;
alter table public.moderation_events    enable row level security;
