-- ============================================================================
-- HomzList — Migration 0135: the inquiry → lead connection system
--
-- What changes conceptually: a connection is no longer "start a conversation".
-- The sender picks WHAT they want, HOW they want to be contacted and WHEN, and
-- that becomes a lead on the other side — no composer, no accept/decline, no
-- number request, no waiting for a reply.
--
-- Nothing is dropped. `inquiries`, `leads` and `proposals` already exist and
-- already carry quota, dedup and admin wiring, so this migration EXTENDS them
-- rather than minting a parallel universe:
--
--   inquiries — the sender's structured intent on a listing OR a project
--   proposals — the sender's offer on someone's requirement (quota'd already)
--   leads     — the single record the receiver works from, for all three
--
-- The chat tables (chat_threads/chat_messages/number_requests/chat_blocks/
-- chat_templates) are deliberately LEFT IN PLACE and untouched: their rows are
-- evidence for open disputes. No application code reads or writes them after
-- this module; they stay deny-all under RLS as they always were.
--
-- RLS: every new table is deny-all to browser roles. The server API (service
-- role) is the only path, exactly like the rest of the schema (Doc9 §4).
-- ============================================================================

-- ---- inquiries: from "a message" to a structured intent ---------------------
-- listing_id was NOT NULL because an inquiry could only ever be about a
-- property. A project inquiry used to leave no `inquiries` row at all (it grew
-- a chat thread instead), so the builder's side had no record to work from.
alter table public.inquiries alter column listing_id drop not null;
alter table public.inquiries add column if not exists project_id uuid references public.projects(id) on delete cascade;

-- Exactly one subject. Existing rows all carry listing_id, so they pass.
alter table public.inquiries drop constraint if exists inquiries_one_subject;
alter table public.inquiries add constraint inquiries_one_subject
  check (num_nonnulls(listing_id, project_id) = 1);

-- The three answers. `wants` and `when_token` are validated against
-- inquiry_options (below) server-side — never a hardcoded list in a component.
alter table public.inquiries add column if not exists wants        text[] not null default '{}';
alter table public.inquiries add column if not exists contact_pref text not null default 'call';
alter table public.inquiries drop constraint if exists inquiries_contact_pref_ck;
alter table public.inquiries add constraint inquiries_contact_pref_ck
  check (contact_pref in ('call','whatsapp'));
alter table public.inquiries add column if not exists when_token   text not null default 'anytime';

-- "Tomorrow" read three days later is meaningless, so the token is resolved to
-- a real date at insert time (server clock, IST) and BOTH are kept: the token
-- for the words the sender chose, the date for anything that has to compare.
alter table public.inquiries add column if not exists preferred_on date;

-- The number that was actually shared, snapshotted. Joining to the profile
-- would make an old lead silently show a number that was never given to that
-- person — the lead is a record of what was shared, not a live view.
alter table public.inquiries add column if not exists contact_number text;
alter table public.inquiries add column if not exists contact_number_verified boolean not null default false;

-- Consent is a row, not a ticked box in a screenshot (DPDP). Version + time +
-- IP make it evidence; the checkbox alone is not.
alter table public.inquiries add column if not exists consent_version text;
alter table public.inquiries add column if not exists consent_at      timestamptz;
alter table public.inquiries add column if not exists consent_ip      text;

-- What the subject looked like when the inquiry was sent. Listings get edited
-- and deleted; the lead card must still be readable years later.
alter table public.inquiries add column if not exists subject_snapshot jsonb not null default '{}'::jsonb;

-- Double-tap Send must not mint two leads.
alter table public.inquiries add column if not exists idempotency_key text;

-- The sender can stop the listing side showing it further. It does NOT unshare
-- what was already delivered — the UI says so in those words.
alter table public.inquiries add column if not exists withdrawn_at timestamptz;

-- There is no composer any more; a message is never required.
alter table public.inquiries alter column message set default '';

create unique index if not exists inquiries_profile_project_uniq
  on public.inquiries (profile_id, project_id) where project_id is not null;
create unique index if not exists inquiries_idem_uniq
  on public.inquiries (profile_id, idempotency_key) where idempotency_key is not null;
create index if not exists inquiries_poster_idx on public.inquiries (poster_id, created_at desc);

-- ---- leads: the one record both sides work from -----------------------------
alter table public.leads add column if not exists inquiry_id  uuid references public.inquiries(id) on delete set null;
alter table public.leads add column if not exists proposal_id uuid references public.proposals(id) on delete set null;

-- The answers, copied onto the lead so the receiver's list renders from one
-- table (the Leads tab is the hottest screen in the app; it must not fan out).
alter table public.leads add column if not exists wants          text[] not null default '{}';
alter table public.leads add column if not exists contact_pref   text;
alter table public.leads add column if not exists contact_number text;
alter table public.leads add column if not exists when_token     text;
alter table public.leads add column if not exists preferred_on   date;
alter table public.leads add column if not exists subject_snapshot jsonb not null default '{}'::jsonb;

-- "I Have a Property": what the sender offered against a requirement.
alter table public.leads add column if not exists offer_listing_id uuid references public.listings(id) on delete set null;
alter table public.leads add column if not exists offer_project_id uuid references public.projects(id) on delete set null;

-- Unread (per-viewer) and stage (pipeline) are different things. The nav badge
-- counts unseen; the filter chips count stage. Conflating them made a lead the
-- owner had merely opened look "handled".
alter table public.leads add column if not exists seen_at timestamptz;

-- Why a lead stopped being actionable: the listing came down, the requirement
-- expired, the sender withdrew. Without it the sender's Sent card dead-ends on
-- "Sent" forever, which is exactly where a lead goes to die.
alter table public.leads add column if not exists closed_reason text;

create unique index if not exists leads_inquiry_uniq  on public.leads (inquiry_id)  where inquiry_id  is not null;
create unique index if not exists leads_proposal_uniq on public.leads (proposal_id) where proposal_id is not null;
create index if not exists leads_owner_unseen_idx on public.leads (owner_id) where seen_at is null;
create index if not exists leads_lead_profile_idx  on public.leads (lead_profile_id, created_at desc);

-- ---- inquiry_options: the chips, from the database --------------------------
-- Every option the sheet renders is a row here. A component that hardcodes
-- "Price / Details / Availability" is the thing this table exists to prevent
-- (CLAUDE.md §7): admin changes wording without a deploy, and the server
-- validates submissions against the same rows the UI drew.
create table if not exists public.inquiry_options (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('want','when','offer')),
  code        text not null,
  label       text not null,
  -- Which subjects the option is offered on. A property inquiry and a
  -- requirement offer do not ask the same question.
  applies_to  text[] not null default '{listing,project,requirement}',
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (kind, code)
);

insert into public.inquiry_options (kind, code, label, applies_to, sort_order) values
  ('want','price',       'Price',              '{listing,project}', 10),
  ('want','details',     'Details',            '{listing,project}', 20),
  ('want','availability','Availability',       '{listing,project}', 30),
  ('want','photos',      'Photos / Brochure',  '{listing,project}', 40),
  ('want','visit',       'Visit later',        '{listing,project}', 50),
  ('want','more',        'More details',       '{listing,project}', 60),
  ('when','today',       'Today',              '{listing,project,requirement}', 10),
  ('when','tomorrow',    'Tomorrow',           '{listing,project,requirement}', 20),
  ('when','date',        'Select date',        '{listing,project,requirement}', 30),
  ('when','anytime',     'Whenever',           '{listing,project,requirement}', 40),
  ('offer','matching_soon','Matching property soon', '{requirement}', 10),
  ('offer','site_visit',  'Site visit',            '{requirement}', 20),
  ('offer','loan_help',   'Loan / paperwork help',  '{requirement}', 30),
  ('offer','rental_option','Rental option',         '{requirement}', 40),
  ('offer','other',       'Other',                  '{requirement}', 50)
on conflict (kind, code) do nothing;

-- ---- verified_contact_numbers: the "use a different number" flow ------------
-- The sender may give a number other than the one on their profile. It is
-- OTP-verified in a popup (the existing KV OTP flow — verifying a number here
-- never creates an account), and the verification is reusable for 7 days on any
-- other listing, so a user is not made to re-verify the same number all day.
create table if not exists public.verified_contact_numbers (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  number      text not null,                                   -- E.164
  verified_at timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now(),
  unique (profile_id, number)
);
create index if not exists verified_numbers_live_idx
  on public.verified_contact_numbers (profile_id, expires_at desc);

-- ---- user_blocks: block survives the removal of chat ------------------------
-- Blocking used to live in chat_blocks, which dies with chat. Without a general
-- block an owner has no way to stop a harasser re-inquiring. Directional, and
-- a blocked sender gets a generic success (never an enumeration signal).
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Carry the chat-era blocks over so nobody who was blocked yesterday can walk
-- back in through the new front door today.
insert into public.user_blocks (blocker_id, blocked_id, created_at)
select blocker_id, blocked_id, created_at from public.chat_blocks
on conflict do nothing;

-- ---- lead_contact_events: the only proof a connection happened --------------
-- Chat used to be the evidence that two people actually talked. With Call and
-- WhatsApp being the whole connection, the tap itself is the signal: it moves a
-- lead New → Contacted without the owner having to bookkeep, and it is the
-- audit trail for "who was given my number".
create table if not exists public.lead_contact_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  actor_id   uuid not null references public.profiles(id) on delete cascade,
  channel    text not null check (channel in ('call','whatsapp','profile')),
  created_at timestamptz not null default now()
);
create index if not exists lead_contact_events_lead_idx on public.lead_contact_events (lead_id, created_at desc);

-- ---- lead_subject_counts: the Received tab in ONE query ---------------------
-- The Received tab lists the viewer's own listings/projects/requirements with a
-- lead count on each. Done naively that is a count query per row; a broker with
-- 200 listings would make the Leads tab the slowest screen in the product.
create or replace function public.lead_subject_counts(p_owner uuid)
returns table (kind text, subject_id uuid, total bigint, unseen bigint, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select case
           when listing_id     is not null then 'listing'
           when project_id     is not null then 'project'
           when requirement_id is not null then 'requirement'
         end as kind,
         coalesce(listing_id, project_id, requirement_id) as subject_id,
         count(*)::bigint                                  as total,
         count(*) filter (where seen_at is null)::bigint    as unseen,
         max(last_activity_at)                              as last_at
    from public.leads
   where owner_id = p_owner
     and is_relevant
     and coalesce(listing_id, project_id, requirement_id) is not null
   group by 1, 2
$$;
revoke all on function public.lead_subject_counts(uuid) from public, anon, authenticated;

-- ---- RLS: deny-all to browser roles -----------------------------------------
alter table public.inquiry_options          enable row level security;
alter table public.verified_contact_numbers enable row level security;
alter table public.user_blocks              enable row level security;
alter table public.lead_contact_events      enable row level security;
