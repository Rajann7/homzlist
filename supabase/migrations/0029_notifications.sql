-- ============================================================================
-- HomzList — Migration 0029: notifications & push tokens (Module 7 follow-on)
--   Doc2 §10 · Doc7 §16 (realtime/notify) · Doc9 §4 (RLS deny-all)
--
-- Server-owned notification records + FCM device tokens. Chat events (inquiry
-- received, chat accepted, number requested/shared, new message) write a
-- notification row here and best-effort fire an FCM push to the recipient's
-- registered tokens. In-app surfacing reads these rows; the unread chat badge
-- keeps using the message read-cursor (lib/chat/service.ts unreadTotal).
--
-- RLS deny-all to browser roles — the server API (service-role) is the only
-- path, exactly like the chat tables in 0028.
-- ============================================================================

do $$ begin
  create type notification_type as enum (
    'inquiry_received','proposal_received','chat_accepted',
    'number_requested','number_shared','new_message'
  );
exception when duplicate_object then null; end $$;

-- ---- notifications ----------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,  -- recipient
  type        notification_type not null,
  title       text not null,
  body        text,
  thread_id   uuid references public.chat_threads(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,          -- who caused it
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_profile_idx
  on public.notifications (profile_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (profile_id) where read_at is null;

-- ---- push_tokens (FCM device registration) ----------------------------------
-- One row per (profile, device token). Registered by the client after it
-- obtains an FCM token; used server-side to target pushes. A token can move
-- between users (shared device) — the pkey is (profile_id, token) and a stale
-- token is pruned when FCM reports it unregistered.
create table if not exists public.push_tokens (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  token        text not null,
  platform     text not null default 'web',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, token)
);
create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);

-- ---- RLS: deny-all to browser roles (server API is the only path) -----------
alter table public.notifications enable row level security;
alter table public.push_tokens   enable row level security;

-- ============================================================================
-- End 0029_notifications.sql
-- ============================================================================
