-- ============================================================================
-- HomzList — Migration 0028: chat, inquiry & number system (Module 7, P7)
--   Doc2 §10 · Doc4 34-39 · Doc7 §87-107 · Doc9 §10 (IDOR/number-sealing)
--
-- Everything the P7 design shows working, persisted end-to-end. The origin
-- records already exist (0025 proposals/visits/leads, 0026 inquiries); Module 7
-- grows a THREAD from each and owns the conversation on top of it — exactly as
-- 0025/0026 pre-carried `thread_id` columns for.
--
-- THREE walls, always:
--   1. RLS deny-all to browser roles — the server API is the only path (Doc9 §4).
--   2. API participant + ownership checks (lib/chat/*).
--   3. Number-sealing: the poster's number is NEVER in a payload until an
--      `allowed` number_requests row exists (Doc2 §8.2, Doc9 §10) — stripped
--      server-side, DevTools-proof, never hidden with CSS.
--
-- Admin is READ-ONLY on chat (Doc7 §203, Doc9 §22) — enforced at the API, this
-- schema simply never grants a browser role write access to any of it.
-- ============================================================================

-- ---- enums ------------------------------------------------------------------
do $$ begin
  -- inquiry = property chat (pinned listing); proposal = requirement chat
  -- (pinned requirement + optional attached listing rich card).
  create type thread_kind as enum ('inquiry','proposal');
exception when duplicate_object then null; end $$;

do $$ begin
  -- pending  → the request is awaiting the poster (accept-before-seen, Doc2 §10.1)
  -- accepted → chat open, seen-status active
  -- declined → poster declined; sender in 30-day cooldown (Doc2 §10.1)
  create type thread_status as enum ('pending','accepted','declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type thread_role as enum ('buyer','poster');   -- buyer = sender/inquirer
exception when duplicate_object then null; end $$;

do $$ begin
  -- Every bubble/system-card the P7 thread renders is one message row, typed:
  create type message_kind as enum (
    'text','photo','system','number_request','number_card',
    'visit_proposal','visit_confirmed','continuity','link'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type number_req_status as enum ('requested','allowed','denied');
exception when duplicate_object then null; end $$;

-- Reports already exist (0026) for listing/project/requirement. Chat adds
-- message + user (block/report sheet) as report subjects so the P11 admin queue
-- sees them in one place (Doc7 §97, §193).
do $$ begin
  alter type report_subject add value if not exists 'message';
exception when undefined_object then null; end $$;
do $$ begin
  alter type report_subject add value if not exists 'user';
exception when undefined_object then null; end $$;

-- ---- chat_threads -----------------------------------------------------------
-- One conversation. For an inquiry there is exactly one thread per (buyer,
-- listing) — the unique index below is the "one thread per user-per-listing"
-- wall (Doc2 §10.1); re-inquiring or deleting-then-reviving reuses the row.
create table if not exists public.chat_threads (
  id                  uuid primary key default gen_random_uuid(),
  kind                thread_kind not null,

  buyer_id            uuid not null references public.profiles(id) on delete cascade,  -- sender/inquirer
  poster_id           uuid not null references public.profiles(id) on delete cascade,  -- owner/poster

  listing_id          uuid references public.listings(id) on delete set null,          -- inquiry: pinned property
  requirement_id      uuid references public.requirements(id) on delete set null,      -- proposal: pinned requirement
  attached_listing_id uuid references public.listings(id) on delete set null,          -- proposal: sender's attached listing

  source_inquiry_id   uuid references public.inquiries(id) on delete set null,
  source_proposal_id  uuid references public.proposals(id) on delete set null,

  status              thread_status not null default 'pending',
  cooldown_until      timestamptz,          -- set on decline: sender may re-inquire after (Doc2 §10.1)

  -- Denormalised tail for the list rows (avoids a per-thread message join on the
  -- 4-tab home). Kept fresh by the send path + a trigger fallback.
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  last_message_kind    message_kind,
  last_message_sender  uuid references public.profiles(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint chat_threads_no_self check (buyer_id <> poster_id)
);

-- One thread per user-per-listing (inquiry). Proposals are keyed to their
-- source proposal instead (a sender may propose across many requirements).
create unique index if not exists chat_threads_inquiry_uniq
  on public.chat_threads (buyer_id, listing_id)
  where kind = 'inquiry' and listing_id is not null;
create unique index if not exists chat_threads_proposal_uniq
  on public.chat_threads (source_proposal_id)
  where source_proposal_id is not null;

create index if not exists chat_threads_buyer_idx  on public.chat_threads (buyer_id, last_message_at desc);
create index if not exists chat_threads_poster_idx on public.chat_threads (poster_id, last_message_at desc);
create index if not exists chat_threads_listing_idx on public.chat_threads (listing_id);

drop trigger if exists chat_threads_updated_at on public.chat_threads;
create trigger chat_threads_updated_at before update on public.chat_threads
  for each row execute function public.set_updated_at();

-- ---- thread_participants ----------------------------------------------------
-- Per-side state: pin / mute / archive / read cursor / delete-for-me. Two rows
-- per thread (buyer + poster). Unread = messages after last_read_at from the
-- OTHER side. Archive auto-lifts on a new message (Doc2 §10.2, handled in send).
create table if not exists public.thread_participants (
  thread_id     uuid not null references public.chat_threads(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  role          thread_role not null,
  pinned        boolean not null default false,
  muted         boolean not null default false,
  archived      boolean not null default false,
  last_read_at  timestamptz not null default 'epoch',
  cleared_at    timestamptz,           -- delete-for-me: hide messages up to here
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (thread_id, profile_id)
);
create index if not exists thread_participants_profile_idx
  on public.thread_participants (profile_id, archived, pinned, last_read_at);

drop trigger if exists thread_participants_updated_at on public.thread_participants;
create trigger thread_participants_updated_at before update on public.thread_participants
  for each row execute function public.set_updated_at();

-- ---- chat_messages ----------------------------------------------------------
create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.chat_threads(id) on delete cascade,
  sender_id        uuid references public.profiles(id) on delete set null,   -- null for system cards

  kind             message_kind not null default 'text',
  body             text,                          -- text / caption / system copy
  photo_url        text,
  photo_w          int,
  photo_h          int,
  reply_to         uuid references public.chat_messages(id) on delete set null,  -- quoted-reply
  meta             jsonb not null default '{}'::jsonb,   -- link preview / visit slots / number / system subtype
  reactions        jsonb not null default '{}'::jsonb,   -- { "👍": [profile_id,...] }

  -- delete-for-everyone → tombstone ("This message was deleted"); delete-for-me
  -- → the profile_id is added to deleted_for and the row is filtered per-viewer.
  -- Both keep the row for admin evidence (Doc2 §10.2, Doc7 §96).
  deleted_all      boolean not null default false,
  deleted_for      uuid[] not null default '{}',

  number_flag      boolean not null default false,   -- number-pattern soft-warn (admin)
  profanity_flag   boolean not null default false,   -- blocklist auto-flag (admin)

  created_at       timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at desc);

-- ---- number_requests --------------------------------------------------------
-- The SENDER (buyer) asks for the POSTER's number. The poster Allow/Deny.
-- Deny → re-request UNLIMITED (no cooldown, no auto-block — Doc7 §99). The
-- poster's number is revealed ONLY when a row here is 'allowed'.
create table if not exists public.number_requests (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.chat_threads(id) on delete cascade,
  requester_id  uuid not null references public.profiles(id) on delete cascade,  -- buyer
  target_id     uuid not null references public.profiles(id) on delete cascade,  -- poster
  status        number_req_status not null default 'requested',
  message_id    uuid references public.chat_messages(id) on delete set null,     -- the request card
  responded_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists number_requests_thread_idx on public.number_requests (thread_id, created_at desc);
-- At most one live (requested/allowed) request per thread at a time.
create unique index if not exists number_requests_live_uniq
  on public.number_requests (thread_id)
  where status in ('requested','allowed');

-- ---- chat_blocks ------------------------------------------------------------
-- Block is directional. Thread stays visible; sending is disabled (Doc2 §10.2).
create table if not exists public.chat_blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint chat_blocks_no_self check (blocker_id <> blocked_id)
);
create index if not exists chat_blocks_blocked_idx on public.chat_blocks (blocked_id);

-- ---- chat_templates (quick replies) -----------------------------------------
-- profile_id null = a system default template (shown to everyone, read-only);
-- profile_id set = a user's own template (CRUD via the manage sheet, Doc2 §10.2).
create table if not exists public.chat_templates (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete cascade,
  body        text not null,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists chat_templates_profile_idx on public.chat_templates (profile_id, sort);

drop trigger if exists chat_templates_updated_at on public.chat_templates;
create trigger chat_templates_updated_at before update on public.chat_templates
  for each row execute function public.set_updated_at();

-- Seed the three default quick replies (Doc P7 quick-replies sheet). Idempotent.
insert into public.chat_templates (profile_id, body, sort)
select null, b, s from (values
  ('Site visits happen on weekends 11 AM–5 PM.', 0),
  ('The price is slightly negotiable for a serious buyer.', 1),
  ('All documents are ready — index copy and tax receipts.', 2)
) as d(b, s)
where not exists (select 1 from public.chat_templates where profile_id is null and body = d.b);

-- ---- last-message denormalisation trigger -----------------------------------
-- A real message (not a delete tombstone edit) bumps the thread tail so the
-- 4-tab home orders + previews without a per-row join.
create or replace function public.chat_bump_thread() returns trigger as $$
begin
  update public.chat_threads t set
    last_message_at = new.created_at,
    last_message_kind = new.kind,
    last_message_sender = new.sender_id,
    last_message_preview = case
      when new.kind = 'photo' then 'Photo'
      when new.kind = 'text'  then left(coalesce(new.body,''), 140)
      when new.kind = 'link'  then left(coalesce(new.body,''), 140)
      else coalesce(new.body, initcap(replace(new.kind::text,'_',' ')))
    end
  where t.id = new.thread_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists chat_messages_bump on public.chat_messages;
create trigger chat_messages_bump after insert on public.chat_messages
  for each row execute function public.chat_bump_thread();

-- ---- RLS: deny-all to browser roles (server API is the only path) -----------
alter table public.chat_threads        enable row level security;
alter table public.thread_participants enable row level security;
alter table public.chat_messages       enable row level security;
alter table public.number_requests     enable row level security;
alter table public.chat_blocks         enable row level security;
alter table public.chat_templates      enable row level security;

-- ============================================================================
-- End 0028_chat.sql
-- ============================================================================
