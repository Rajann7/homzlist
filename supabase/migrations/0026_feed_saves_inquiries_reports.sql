-- ============================================================================
-- HomzList — Migration 0026: feed interactions (Module 6, P2 + Doc2 §9-10)
--
-- The feed (Module 6) is read-only over data that already exists (listings,
-- projects, boosts, requirements). What it WRITES are the per-user interactions
-- the P2 design shows working — Save, Inquiry, Report, Not-interested — plus the
-- per-city story seen-store. Each is a MINIMAL real table so the feed buttons
-- persist end-to-end (never a frontend-only toast); the modules that own these
-- fully (P10 Saved, P7 Chat, P11 Reports) will extend them, not replace them.
--
-- RLS: deny-all to browser roles; the server API is the only path (Doc9 §4).
-- ============================================================================

-- ---- saves (the feed heart + P10 wishlist seed; Doc2 §11 Saved) -------------
create table if not exists public.saves (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (profile_id, listing_id)          -- one save per user per listing
);
create index if not exists saves_profile_idx on public.saves (profile_id, created_at desc);
create index if not exists saves_listing_idx on public.saves (listing_id);

-- ---- inquiries (the Inquiry sheet → chat request; Doc2 §10.1) ---------------
-- One thread per user-per-listing (Doc2 §10.1): the unique key enforces the
-- dedup; re-inquiring updates the same row. P7 Chat will grow a thread from this.
do $$ begin
  create type inquiry_status as enum ('sent','accepted','declined');
exception when duplicate_object then null; end $$;

create table if not exists public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,  -- the buyer
  listing_id    uuid not null references public.listings(id) on delete cascade,
  poster_id     uuid not null references public.profiles(id) on delete cascade,  -- listing owner (denormalised)
  message       text not null,
  intents       text[] not null default '{}',   -- Site visit? / Negotiable? / Documents? / Loan?
  share_number  boolean not null default true,
  status        inquiry_status not null default 'sent',
  thread_id     uuid,                             -- future chat (Module 7)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (profile_id, listing_id)
);
create index if not exists inquiries_poster_idx on public.inquiries (poster_id, status, created_at desc);
create index if not exists inquiries_buyer_idx  on public.inquiries (profile_id, created_at desc);

drop trigger if exists inquiries_updated_at on public.inquiries;
create trigger inquiries_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();

-- ---- reports (⋯ → Report; feeds the P11 admin Reports queue) ----------------
do $$ begin
  create type report_subject as enum ('listing','project','requirement');
exception when duplicate_object then null; end $$;
do $$ begin
  create type report_status as enum ('open','reviewing','actioned','dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.profiles(id) on delete cascade,
  subject_type  report_subject not null,
  subject_id    uuid not null,
  reason        text not null,             -- Fake listing / Already sold / Wrong price / …
  note          text,
  status        report_status not null default 'open',
  created_at    timestamptz not null default now(),
  -- One open report per reporter per subject — re-reporting the same thing is a no-op.
  unique (reporter_id, subject_type, subject_id)
);
create index if not exists reports_open_idx on public.reports (status, created_at) where status = 'open';
create index if not exists reports_subject_idx on public.reports (subject_type, subject_id);

-- ---- feed not-interested (down-rank prefs; Doc7 §82) ------------------------
-- A user hides more of a type OR an area. Both nullable; at least one set.
create table if not exists public.feed_not_interested (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type_code   text references public.property_types(code),
  area_id     uuid references public.locations(id),
  created_at  timestamptz not null default now(),
  constraint not_interested_target check (type_code is not null or area_id is not null)
);
create index if not exists not_interested_profile_idx on public.feed_not_interested (profile_id);

-- ---- story seen (per-city seen store; Doc7 §85, Doc2 §9.3) ------------------
-- Seen is stored PER CITY (a poster's ring re-appears fresh in another city).
-- A "segment" is a listing/project in someone's story; we key by listing id.
create table if not exists public.story_seen (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  city_id     uuid not null references public.locations(id) on delete cascade,
  segment_id  uuid not null,             -- the listing/project id in the story
  seen_at     timestamptz not null default now(),
  primary key (profile_id, city_id, segment_id)
);
create index if not exists story_seen_profile_city_idx on public.story_seen (profile_id, city_id);

-- ---- RLS: deny-all to browser roles (server API is the only path) -----------
alter table public.saves               enable row level security;
alter table public.inquiries           enable row level security;
alter table public.reports             enable row level security;
alter table public.feed_not_interested enable row level security;
alter table public.story_seen          enable row level security;
