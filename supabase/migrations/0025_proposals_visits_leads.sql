-- ============================================================================
-- HomzList — Migration 0025: proposals, visits, leads (Module 5, P8 + Doc2 §7-8)
--
-- Module 4 shipped the requirements TABLE and its creation flow; the quota
-- backbone for proposals already exists (0003/0004: proposal_quota /
-- proposal_used / consume_quota('proposal') / refund_proposal, plus the topup10
-- add-on). This migration adds the three tables the rest of Module 5 writes to:
--
--   proposals — a sender's offer on someone's requirement (Doc2 §8.1, Doc7 §70-75)
--   visits    — a scheduled site visit (Doc2 §10, Doc7 §100-102)
--   leads     — the broker/builder pipeline (Doc2 §10.4, Doc7 §103-105)
--
-- The number rule (Doc2 §8.2) needs NO table here: the poster auto-sees the
-- SENDER's number, which is a poster-only server-side join to the sender's
-- profile phone. The sender→poster request/allow flow is chat (Module 6).
--
-- Chat threads are Module 6 (P7), not built. `proposals.thread_id` and
-- `visits`/`leads` carry the columns those will need so Module 6 adds behaviour,
-- not another migration to the same rows — exactly how 0013 pre-carried these.
--
-- RLS: deny-all to browser roles; the server API is the only path (Doc9 §4),
-- same as every other table in this schema.
-- ============================================================================

-- ---- enums ------------------------------------------------------------------
do $$ begin
  create type proposal_mode as enum ('listing','chat');
exception when duplicate_object then null; end $$;

do $$ begin
  -- pending → accepted / declined / not_relevant (poster actions);
  -- pending → expired (30-day no-response cron, count NOT refunded — Doc2 §8.1);
  -- pending → fulfilled (the requirement was fulfilled by someone else).
  create type proposal_status as enum (
    'pending','accepted','declined','not_relevant','expired','fulfilled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type visit_status as enum ('proposed','confirmed','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type visit_outcome as enum ('done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_stage as enum (
    'new','contacted','visit','negotiation','closed_won','closed_lost'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_source as enum ('inquiry','proposal','visit');
exception when duplicate_object then null; end $$;

-- ---- proposals --------------------------------------------------------------
create table if not exists public.proposals (
  id             uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.requirements(id) on delete cascade,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  -- Denormalised requirement owner: the poster-side list filters and RLS both
  -- key off this without joining requirements on every row.
  poster_id      uuid not null references public.profiles(id) on delete cascade,

  mode           proposal_mode not null default 'chat',
  -- Only meaningful when mode='listing'. The picker offers the sender's OWN live
  -- listings; the server re-checks ownership, so a crafted id can't be attached.
  listing_id     uuid references public.listings(id) on delete set null,
  message        text not null,

  status         proposal_status not null default 'pending',

  -- Quota trace. consume_quota('proposal') writes a plan_consumptions row keyed
  -- by ref_id = this proposal's id; we store that consumption id so the
  -- create-race compensation (Doc2 §15: proposal-vs-requirement-OFF) can call
  -- refund_proposal() precisely. Expiry (Doc2 §8.1) deliberately does NOT refund.
  consumption_id uuid references public.plan_consumptions(id) on delete set null,

  -- Chat opens on accept — Module 6. Null until then.
  thread_id      uuid,

  responded_at   timestamptz,               -- accept / decline / not_relevant
  expires_at     timestamptz not null,      -- 30 days from send (Doc2 §8.1)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Duplicate guard (Doc2 §8.1 "already sent", designs/P8 S3): at most one LIVE
-- proposal per (requirement, sender). Re-proposing the SAME requirement is
-- allowed only once a prior one was declined / not_relevant / expired.
-- (Doc7 §71's "a sender may send multiple" is read as across DIFFERENT
-- requirements — see docs/PENDING-INTEGRATIONS.md.)
create unique index if not exists proposals_no_dup_idx
  on public.proposals (requirement_id, sender_id)
  where status in ('pending','accepted');

-- A sender can never propose to their own requirement (Doc2 §8.1 self-block);
-- belt-and-braces behind the API check.
alter table public.proposals drop constraint if exists proposals_no_self;
alter table public.proposals add constraint proposals_no_self check (sender_id <> poster_id);

create index if not exists proposals_poster_idx  on public.proposals (poster_id, status, created_at desc);
create index if not exists proposals_sender_idx  on public.proposals (sender_id, status, created_at desc);
create index if not exists proposals_req_idx     on public.proposals (requirement_id, status, created_at desc);
create index if not exists proposals_expiry_idx  on public.proposals (status, expires_at) where status = 'pending';

drop trigger if exists proposals_updated_at on public.proposals;
create trigger proposals_updated_at before update on public.proposals
  for each row execute function public.set_updated_at();

-- ---- visits -----------------------------------------------------------------
-- A visit is between a BUYER and the listing's poster. In Module 5 visits are
-- seeded + managed (reschedule/cancel/outcome); their origination (the chat
-- visit scheduler, Doc2 §10.2) is Module 6 — tracked in PENDING-INTEGRATIONS.md.
create table if not exists public.visits (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid references public.listings(id) on delete set null,
  requirement_id uuid references public.requirements(id) on delete set null,
  buyer_id       uuid not null references public.profiles(id) on delete cascade,
  poster_id      uuid not null references public.profiles(id) on delete cascade,

  scheduled_at   timestamptz not null,
  note           text,
  status         visit_status not null default 'proposed',
  outcome        visit_outcome,             -- set after the visit time passes
  cancel_reason  text,
  reschedule_of  uuid references public.visits(id) on delete set null,

  thread_id      uuid,                       -- future chat link
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists visits_buyer_idx  on public.visits (buyer_id, scheduled_at desc);
create index if not exists visits_poster_idx on public.visits (poster_id, scheduled_at desc);

drop trigger if exists visits_updated_at on public.visits;
create trigger visits_updated_at before update on public.visits
  for each row execute function public.set_updated_at();

-- ---- leads ------------------------------------------------------------------
-- The broker/builder pipeline (Owner sees a simplified list variant, decided by
-- role server-side). owner_id is the pipeline owner (the seller); lead_profile_id
-- is the interested party. Auto-population from chat inquiries + visit outcomes
-- is Module 6 — here leads are seeded + manually stage-managed.
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  lead_profile_id  uuid not null references public.profiles(id) on delete cascade,
  listing_id       uuid references public.listings(id) on delete set null,
  requirement_id   uuid references public.requirements(id) on delete set null,

  source           lead_source not null default 'inquiry',
  stage            lead_stage not null default 'new',
  last_activity    text,
  last_activity_at timestamptz not null default now(),
  -- [{ text, at }] — the ⋯ → "Add note" sheet appends here.
  notes            jsonb not null default '[]'::jsonb,
  is_relevant      boolean not null default true,   -- "Mark not relevant" from ⋯

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists leads_owner_idx on public.leads (owner_id, stage, last_activity_at desc);

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---- RLS: deny-all to browser roles (server API is the only path) ------------
alter table public.proposals enable row level security;
alter table public.visits    enable row level security;
alter table public.leads     enable row level security;
