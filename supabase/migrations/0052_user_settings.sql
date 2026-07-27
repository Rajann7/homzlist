-- ============================================================================
-- HomzList — Migration 0052: user_settings (P10 Settings suite — Language + Privacy)
--
-- The Settings home (P10 S6) links to a Language screen (S8) and a Privacy
-- screen (S6b). Both persist a per-user choice that MUST be server-owned, not
-- kept in the browser (CLAUDE.md backend lock): the locale the interface uses,
-- and four visibility toggles that govern what other people can see. Each is a
-- real column here so the toggle round-trips and reads back the server's answer.
--
-- One row per profile, created lazily on first read/write. RLS is deny-all to
-- the browser roles — the server API (service role, after the session gate) is
-- the only path (Doc9 §4). Enforcement of these prefs at the points they affect
-- (listing default number, chat last-seen, phone-search) is tracked in
-- docs/PENDING-INTEGRATIONS.md; this migration owns the source of truth.
-- ============================================================================

create table if not exists public.user_settings (
  profile_id           uuid primary key references public.profiles(id) on delete cascade,
  -- Interface language (S8). Only the app chrome changes; listing text is never
  -- translated. 'en' English · 'hi' Hindi · 'gu' Gujarati.
  locale               text not null default 'en' check (locale in ('en', 'hi', 'gu')),
  -- Privacy toggles (S6b). Defaults mirror the design's initial switch states.
  show_number_default  boolean not null default false,  -- number ON by default on new listings
  show_last_seen       boolean not null default true,   -- last-seen visible in chats
  show_activity        boolean not null default true,   -- activity status visible
  findable_by_phone    boolean not null default true,   -- discoverable by phone number
  updated_at           timestamptz not null default now()
);

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
