-- 0091 — MODULE 12: HELP CENTRE, SUPPORT, LEGAL/CMS, BLOG, DATA RIGHTS, SYSTEM PAGES
--
-- designs/P12 screens, backed for real. 0088_admin_core already created the
-- stores the admin panel owns (cms_pages, cms_page_versions, faqs, blog_posts,
-- support_tickets, ticket_messages, maintenance_settings, auth_consents). What
-- P12's USER-facing screens need on top of that:
--
--   • help_categories + article columns on faqs  → S1 Help centre / category
--     accordion / article reader (one row is both the accordion answer and the
--     long-form article, so the category counts and the reader agree by
--     construction rather than by hand).
--   • help_feedback                             → "Was this helpful?" (yes/no + note)
--   • ticket columns + ticket_attachments       → S2 conditional fields, screenshots
--   • legal_settings                            → Doc10's [SQUARE BRACKET] placeholders,
--     filled from the DB (entity, grievance officer, jurisdiction, SLA) instead of
--     being frozen into the page text.
--   • cms_pages columns                         → S3 legal index (order/icon) +
--     "Version x · Effective <date>" strip.
--   • blog_categories + blog_posts.is_featured  → S4 chip row and the hero card.
--   • data_export_requests                      → S5 Download your data (own data only).
--   • account_actions                           → S6 deactivate / delete with the
--     30-day grace period and the 7-day payment hold.
--
-- RLS: enabled with NO policy on every new table, matching every other table in
-- this schema — anon/authenticated are denied outright and the server reaches
-- these rows through the service-role key after its own authorization check
-- (Doc9 §4). Public-readable content (legal, blog, help) is served by SSR/route
-- handlers that filter to published rows; nothing reaches a browser directly.

-- ============================================================ HELP CENTRE

-- The 8 cards on S1. Titles, icons and the search synonyms behind each card all
-- come from here — the design's "6 articles / 8 articles" counts are a live
-- count of faqs rows, never a literal.
create table if not exists public.help_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  icon         text not null default 'file',
  search_terms text not null default '',
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- faqs (0088) becomes the help article: `question` is the title, `answer` is the
-- one-paragraph accordion body, and body_md is the long-form reader. A row with
-- body_md is openable as an article; every row shows in its category accordion.
alter table public.faqs add column if not exists category_id   uuid references public.help_categories(id) on delete set null;
alter table public.faqs add column if not exists slug          text;
alter table public.faqs add column if not exists body_md       text;
alter table public.faqs add column if not exists read_minutes  int not null default 2;
alter table public.faqs add column if not exists is_popular    boolean not null default false;
alter table public.faqs add column if not exists search_terms  text not null default '';
alter table public.faqs add column if not exists updated_at    timestamptz not null default now();
create unique index if not exists faqs_slug_key on public.faqs (slug) where slug is not null;
create index if not exists faqs_category_idx on public.faqs (category_id, sort_order) where is_active;
create index if not exists faqs_popular_idx on public.faqs (sort_order) where is_active and is_popular;

-- "Was this helpful?" — one verdict per user per article, with the optional note
-- the No branch asks for. helpful_yes/no on faqs stay the denormalised counters
-- the admin FAQ manager reads.
create table if not exists public.help_feedback (
  id         uuid primary key default gen_random_uuid(),
  faq_id     uuid not null references public.faqs(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  helpful    boolean not null,
  note       text,
  created_at timestamptz not null default now()
);
create unique index if not exists help_feedback_one_per_user
  on public.help_feedback (faq_id, profile_id) where profile_id is not null;
create index if not exists help_feedback_faq_idx on public.help_feedback (faq_id, created_at desc);

-- ============================================================ SUPPORT TICKETS

-- The conditional fields S2 reveals per category. payment_ref is what the user
-- TYPES ("PAY-88213"); support_tickets.payment_id stays the resolved FK the
-- admin desk sets once it matches the reference to a real payment.
alter table public.support_tickets add column if not exists payment_ref  text;
alter table public.support_tickets add column if not exists alt_contact  text;
alter table public.support_tickets add column if not exists report_link  text;
alter table public.support_tickets add column if not exists reopened_at  timestamptz;
alter table public.support_tickets add column if not exists reopen_count int not null default 0;
create index if not exists support_tickets_mine_idx
  on public.support_tickets (profile_id, last_activity_at desc);

-- Screenshots on the new-ticket form and on any reply. Stored in R2 like every
-- other upload; `key` is the object key, `url` the CDN URL.
create table if not exists public.ticket_attachments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.ticket_messages(id) on delete cascade,
  key        text not null,
  url        text not null,
  bytes      int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id, created_at);
create index if not exists ticket_attachments_msg_idx on public.ticket_attachments (message_id);

-- ============================================================ LEGAL / CMS

-- Doc10's placeholders, as data. Every legal page renders through a substitution
-- pass over this row, so filling the entity name before launch is an UPDATE and
-- not a re-write of seven documents.
create table if not exists public.legal_settings (
  id                 boolean primary key default true check (id),
  entity_name        text not null default 'HomzList',
  entity_type        text not null default 'proprietorship',
  registered_address text not null default 'Rajkot, Gujarat 360001',
  reg_no             text not null default '',
  gstin              text not null default '',
  support_email      text not null default 'support@homzlist.com',
  grievance_name     text not null default '',
  grievance_email    text not null default 'grievance@homzlist.com',
  grievance_phone    text not null default '',
  grievance_hours    text not null default 'Mon–Fri, 10:00–18:00 IST',
  jurisdiction_city  text not null default 'Rajkot',
  jurisdiction_state text not null default 'Gujarat',
  ack_hours          int  not null default 24,
  resolution_days    int  not null default 15,
  liability_months   int  not null default 3,
  updated_by         uuid,
  updated_at         timestamptz not null default now()
);
insert into public.legal_settings (id) values (true) on conflict (id) do nothing;

-- S3's index order + row icon, and the "Effective <date>" half of the version
-- strip. `kind` separates the legal readers from ordinary CMS pages (About).
alter table public.cms_pages add column if not exists kind           text not null default 'legal';
alter table public.cms_pages add column if not exists icon           text not null default 'file';
alter table public.cms_pages add column if not exists sort_order     int  not null default 0;
alter table public.cms_pages add column if not exists effective_date date;
alter table public.cms_pages add column if not exists reader         text not null default 'longform';
create index if not exists cms_pages_index_idx on public.cms_pages (kind, sort_order) where is_published;

-- Version history rows get the effective date too, so "View previous versions"
-- can list them truthfully.
alter table public.cms_page_versions add column if not exists effective_date date;
alter table public.cms_page_versions add column if not exists is_material     boolean not null default false;
create index if not exists cms_page_versions_page_idx on public.cms_page_versions (page_id, created_at desc);

-- Versioned consent (0088's auth_consents) needs a fast "has this user accepted
-- version X of this doc" lookup for the re-acceptance interstitial.
create unique index if not exists auth_consents_one_per_version
  on public.auth_consents (profile_id, kind, version);

-- ============================================================ BLOG

-- S4's chip row is a config table, not a literal array in the component.
create table if not exists public.blog_categories (
  slug       text primary key,
  title      text not null,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- The hero card at the top of S4.
alter table public.blog_posts add column if not exists is_featured boolean not null default false;
create index if not exists blog_posts_live_idx
  on public.blog_posts (published_at desc) where status = 'published';
create index if not exists blog_posts_cat_idx
  on public.blog_posts (category, published_at desc) where status = 'published';

-- ============================================================ DATA RIGHTS (S5)

-- The user's own data export. `payload` holds the generated archive so the
-- 48-hour link is served by our own route (never a public bucket URL), and
-- expires_at is what makes the link stop working.
create table if not exists public.data_export_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  format       text not null default 'json' check (format in ('json', 'csv')),
  status       text not null default 'preparing' check (status in ('preparing', 'ready', 'expired', 'failed')),
  payload      jsonb,
  bytes        int not null default 0,
  filename     text,
  row_counts   jsonb not null default '{}'::jsonb,
  failure      text,
  downloads    int not null default 0,
  ready_at     timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists data_export_requests_mine_idx
  on public.data_export_requests (profile_id, created_at desc);

-- ============================================================ ACCOUNT (S6)

-- Deactivation and deletion as one auditable lifecycle. A delete row lives in
-- `scheduled` until purge_at (30-day grace) and is the thing the grace screen
-- reads; cancelling sets cancelled_at and puts the profile back to active.
create table if not exists public.account_actions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('deactivate', 'delete')),
  status       text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'done')),
  reason       text,
  -- What the user was told they were giving up, captured at the moment of the
  -- decision (P12 dg-del2 says "1 active ₹999 plan and 1 live listing").
  impact       jsonb not null default '{}'::jsonb,
  purge_at     timestamptz,
  cancelled_at timestamptz,
  done_at      timestamptz,
  ip_hash      text,
  created_at   timestamptz not null default now()
);
create index if not exists account_actions_profile_idx on public.account_actions (profile_id, created_at desc);
create unique index if not exists account_actions_one_open
  on public.account_actions (profile_id) where status = 'scheduled';

-- ============================================================ RETENTION KNOBS

-- The delete/export copy quotes these numbers; they must come from the same
-- place the purge job reads (0088's retention_settings).
insert into public.retention_settings (key, label, days, is_locked, note) values
  ('account_deletion_grace', 'Deleted account grace period', 30, false,
   'P12 S6 — days a scheduled deletion can still be cancelled by logging in.'),
  ('payment_hold_before_delete', 'Payment hold before deletion', 7, false,
   'P12 S6 — deletion is blocked for this many days after a successful payment.'),
  ('data_export_link', 'Data export download link', 2, false,
   'P12 S5 — hours are stored as days=2 (48h); the link expires after this.'),
  ('payment_records', 'Payment records (legal minimum)', 2555, true,
   'Doc10 §6 — 7 years, anonymised after account deletion.')
on conflict (key) do nothing;

-- ============================================================ RLS ON
do $$
declare t text;
begin
  foreach t in array array[
    'help_categories','help_feedback','ticket_attachments','legal_settings',
    'blog_categories','data_export_requests','account_actions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
