-- ============================================================================
-- MODULE 12 — Help & Support · Legal/CMS · Blog · Data rights · System pages
--
-- Three jobs, in the order that matters:
--
--  1. RECONCILE DRIFT. `admin_cms_list` (0106) already selects `p.kind` and
--     `p.effective_date`, and lib/admin/content.ts already writes
--     `faqs.slug` / `blog_posts.is_featured` — but NO migration file ever
--     created any of those columns. They exist only on the dev database,
--     added out of band during P6. A fresh `npm run migrate` therefore builds
--     a database where 0106's own view fails to compile. Every one of those
--     columns is written down here, idempotently, so the history builds from
--     zero again.
--
--  2. THE OPTION LISTS BECOME TABLES. P12 draws four lists that were about to
--     be hardcoded in components: the 8 help categories, the 6 help search
--     chips, the 7 support-ticket categories and the 6 blog category chips.
--     CLAUDE.md §7 bans exactly that. Each is a table; each screen reads it.
--     The ticket categories carry their own conditional-field flags, so the
--     "show the Payment ID field for a refund ticket" rule lives with the
--     category instead of in a switch statement the admin cannot reach.
--
--  3. THE DATA-RIGHTS TABLES. `data_export_requests` gives DPDP §8 download a
--     real state machine (queued→processing→ready→expired/failed) with an
--     expiry the UI can print, and the deactivate/delete lifecycle gets real
--     columns on `profiles` plus an `account_events` audit — because a 30-day
--     grace period nothing records the start of cannot be cancelled, and a
--     "deletion scheduled for 12 Feb" the server cannot compute is a lie.
--
-- RLS: every new table gets RLS ENABLED WITH NO POLICIES, matching 0088. These
-- are read and written by the server (service-role) after an explicit
-- authorization check; the anon/authenticated keys reach none of them.
-- ============================================================================

/* ══════════════════════════════════════════ 1 · drift → real migration ═══ */

-- CMS pages: the reader needs to know what KIND of page it is (a legal page
-- carries a version bar and a consent record; About does not), which icon the
-- index row draws, what order the index is in, the effective date the version
-- bar prints, and which reader template renders it (`grievance` has the officer
-- card; everything else is longform).
alter table public.cms_pages
  add column if not exists kind           text not null default 'page',      -- legal | page
  add column if not exists icon           text not null default 'file',
  add column if not exists sort_order     integer not null default 0,
  add column if not exists effective_date date,
  add column if not exists reader         text not null default 'longform';  -- longform | grievance

-- A version row needs its own effective date (the date the version bar shows
-- when you open an OLD version), and `is_material` is what decides whether
-- publishing it forces every user through the re-acceptance interstitial.
alter table public.cms_page_versions
  add column if not exists effective_date date,
  add column if not exists is_material    boolean not null default false;

-- The blog list's hero card is the FEATURED post, and the badge above its title
-- ("Guide") is per-post copy, not a category label.
alter table public.blog_posts
  add column if not exists is_featured boolean not null default false,
  add column if not exists badge       text;

-- `faqs` is the help-article table. The accordion inside a category shows
-- `answer`; the article reader shows `body_md`; `search_terms` is the hidden
-- keyword blob the help search matches on (the design's tiles carry
-- data-search="plans pricing 999 plan subscription cost"); `related_slugs` is
-- the "Related articles" list at the foot of an article.
alter table public.faqs
  add column if not exists category_id   uuid,
  add column if not exists slug          text,
  add column if not exists body_md       text,
  add column if not exists read_minutes  integer not null default 2,
  add column if not exists is_popular    boolean not null default false,
  add column if not exists search_terms  text,
  add column if not exists related_slugs text[] not null default '{}',
  add column if not exists updated_at    timestamptz not null default now();

create unique index if not exists faqs_slug_key on public.faqs (slug) where slug is not null;

/* ═══════════════════════════════════════════════ 2 · help centre model ═══ */

-- The 8 tiles on the Help centre. `article_count` is NOT stored — the tile
-- prints a live count over `faqs`, so deactivating an article moves the number.
create table if not exists public.help_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  icon         text not null default 'file',
  search_terms text not null default '',
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The out-of-band P6 setup put uuids in `faqs.category_id` pointing at a table
-- that was never created. They are dangling by definition — clear them before
-- the constraint goes on, and let the seed re-link every article by slug.
update public.faqs f
   set category_id = null
 where f.category_id is not null
   and not exists (select 1 from public.help_categories c where c.id = f.category_id);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'faqs_category_id_fkey'
  ) then
    alter table public.faqs
      add constraint faqs_category_id_fkey
      foreign key (category_id) references public.help_categories(id) on delete set null;
  end if;
end $$;

create index if not exists faqs_category_idx on public.faqs (category_id, sort_order);
create index if not exists faqs_popular_idx  on public.faqs (is_popular, sort_order) where is_active;

-- The chip row above the tiles. Each chip is a canned SEARCH, not a category —
-- "Chat & Numbers" filters on the word "chat" and matches two categories. That
-- mapping is data, so an admin can retune it without a deploy.
create table if not exists public.help_chips (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  query      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- "Was this helpful? Yes / No" + the "Tell us what's missing" box. The two
-- counters on `faqs` are the aggregate; this is the row behind each vote, so a
-- comment has somewhere to live and one person cannot vote a hundred times.
create table if not exists public.help_feedback (
  id         uuid primary key default gen_random_uuid(),
  faq_id     uuid not null references public.faqs(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  visitor_key text,                       -- hashed ip+ua for signed-out readers
  helpful    boolean not null,
  comment    text,
  created_at timestamptz not null default now()
);
create unique index if not exists help_feedback_one_per_reader
  on public.help_feedback (faq_id, coalesce(profile_id::text, visitor_key));

/* ══════════════════════════════════════════ 3 · support ticket taxonomy ═══ */

-- The 7 rows of the "Choose a category" sheet. The three booleans are the
-- design's conditional fields: choosing "Payment or refund" reveals the
-- Payment ID input, "Lost access to my number" reveals the warning callout +
-- alternate-contact input, "Report a user or listing" reveals the link input.
create table if not exists public.ticket_categories (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  label                text not null,
  icon                 text not null default 'more-horizontal',
  needs_payment_ref    boolean not null default false,
  needs_alt_contact    boolean not null default false,
  needs_report_link    boolean not null default false,
  is_grievance         boolean not null default false,
  sort_order           integer not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

-- What the user typed into the conditional fields has to be stored somewhere a
-- staff member can read it. `payment_ref` is the human reference the user pastes
-- ("PAY-88213"); `payment_id` (0088) is the resolved FK when we can match it.
alter table public.support_tickets
  add column if not exists category_id  uuid references public.ticket_categories(id) on delete set null,
  add column if not exists payment_ref  text,
  add column if not exists alt_contact  text,
  add column if not exists report_link  text,
  add column if not exists resolved_at  timestamptz;

-- Attachments on a ticket message. The design's composer offers 3 screenshots.
alter table public.ticket_messages
  add column if not exists attachments text[] not null default '{}';

create index if not exists support_tickets_mine_idx
  on public.support_tickets (profile_id, last_activity_at desc);

/* ═════════════════════════════════════════════════ 4 · blog taxonomy ═══ */

create table if not exists public.blog_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_published_idx
  on public.blog_posts (status, published_at desc);

-- The reader's progress bar and "N min read" are honest only if the view is
-- counted once per reader per post rather than once per render.
create table if not exists public.blog_post_reads (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.blog_posts(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  visitor_key text,
  created_at  timestamptz not null default now()
);
create unique index if not exists blog_post_reads_once
  on public.blog_post_reads (post_id, coalesce(profile_id::text, visitor_key));

create or replace function public.hz_bump_blog_view(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.blog_posts set view_count = view_count + 1 where id = p_id;
$$;
revoke all on function public.hz_bump_blog_view(uuid) from public;

/* ═══════════════════════════════════════════ 5 · DPDP data download ═══ */

create table if not exists public.data_export_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  format       text not null default 'json',        -- json | csv
  status       text not null default 'queued',      -- queued | processing | ready | expired | failed
  file_key     text,                                -- object key in the private bucket
  size_bytes   bigint,
  error        text,
  requested_at timestamptz not null default now(),
  ready_at     timestamptz,
  expires_at   timestamptz,
  downloaded_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists data_export_requests_mine_idx
  on public.data_export_requests (profile_id, requested_at desc);

-- Exports of a person's own data are private, and they are neither an image nor
-- an admin spreadsheet, so they get their own bucket rather than widening the
-- mime allowlist on `private-docs` (which holds ID scans) or leaking into the
-- public `listing-photos` bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-exports', 'user-exports', false, 52428800, array['application/zip', 'application/json', 'text/csv'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ═════════════════════════════════ 6 · deactivate / delete lifecycle ═══ */

-- `profiles.state` (0001) already has 'deactivated' and 'deleted'. What it has
-- no room for is WHEN — and every promise the screen makes is a date:
-- "log in anytime to reactivate", "deleted on 12 Feb", "available from 19 Jan".
alter table public.profiles
  add column if not exists deactivated_at        timestamptz,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists deletion_reason       text;

create index if not exists profiles_deletion_due_idx
  on public.profiles (deletion_scheduled_at)
  where deletion_scheduled_at is not null;

create table if not exists public.account_events (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,   -- deactivate | reactivate | delete_request | delete_cancel | delete_purge
  reason     text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists account_events_profile_idx
  on public.account_events (profile_id, created_at desc);

/* ═══════════════════════════════════════════════════ 7 · consent index ═══ */

-- `auth_consents` (0001) already stores versioned consent. The re-acceptance
-- interstitial asks one question on every page load — "has this user accepted
-- the CURRENT version of every material legal page?" — so it needs the index.
create index if not exists auth_consents_profile_kind_idx
  on public.auth_consents (profile_id, kind, accepted_at desc);

/* ═══════════════════════════════════════════════════════════════ RLS ═══ */

do $$
declare t text;
begin
  foreach t in array array[
    'help_categories','help_chips','help_feedback','ticket_categories',
    'blog_categories','blog_post_reads','data_export_requests','account_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
