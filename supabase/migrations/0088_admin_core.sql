-- 0088 — ADMIN CORE
--
-- Every admin screen in designs/P13-14-15 reads real rows. The user-side tables
-- already existed (listings, payments, boosts, reports, verifications, chats…);
-- what was missing is everything the admin panel owns: the audit trail, the
-- support desk, the CMS, the config surfaces, the system/observability tables
-- and the trash/export registries.
--
-- RLS: enabled on every table with NO policy, matching every existing table in
-- this schema — anon/authenticated are denied by default and the server reaches
-- these rows through the service-role key only (Doc7 §18: audit is append-only,
-- master/cms/settings are admin-write, staff is Super-only).

-- ---------------------------------------------------------------- seed ledger
-- Lets scripts/seed-admin.mjs be re-runnable: it records what it inserted so a
-- re-seed removes exactly its own rows and never touches hand-made data.
create table if not exists public.seed_ledger (
  batch      text not null,
  table_name text not null,
  row_id     text not null,
  created_at timestamptz not null default now(),
  primary key (batch, table_name, row_id)
);

-- ------------------------------------------------------------ staff & access
alter table public.staff add column if not exists email         text;
alter table public.staff add column if not exists display_name  text;
alter table public.staff add column if not exists added_by       uuid references public.staff(profile_id) on delete set null;
alter table public.staff add column if not exists invited_at     timestamptz;
alter table public.staff add column if not exists last_login_at  timestamptz;
alter table public.staff add column if not exists is_online      boolean not null default false;
alter table public.staff add column if not exists state          text not null default 'active';
create unique index if not exists staff_email_key on public.staff (lower(email)) where email is not null;

create table if not exists public.admin_login_attempts (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  success     boolean not null default false,
  reason      text,
  ip          text,
  device      text,
  created_at  timestamptz not null default now()
);
create index if not exists admin_login_attempts_email_idx on public.admin_login_attempts (email, created_at desc);

create table if not exists public.staff_sessions (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.staff(profile_id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  ended_at      timestamptz,
  ip            text,
  device        text
);

-- ---------------------------------------------------------------- audit trail
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.staff(profile_id) on delete set null,
  actor_name   text not null,
  actor_role   text not null,
  action       text not null,                -- approve | reject | edit | suspend | refund | grant | impersonate | export | flag …
  entity_type  text not null,                -- listing | user | payment | coupon | flag | export …
  entity_id    uuid,
  entity_label text not null,
  summary      text not null,
  diff         jsonb,                        -- {"field": {"old": …, "new": …}} or ["old","new"]
  ip           text,
  device       text,
  is_sensitive boolean not null default false,
  case_ref     text,                         -- evidence SOP: preservation lock
  preserved    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists admin_audit_log_ts_idx     on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id);

-- --------------------------------------------------------- queue furniture
create table if not exists public.admin_saved_views (
  id         uuid primary key default gen_random_uuid(),
  queue      text not null,                  -- listings | requirements | boosts | verifications | appeals | reports | users | payments
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  owner_id   uuid references public.staff(profile_id) on delete cascade,
  is_shared  boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.review_locks (
  subject_type text not null,
  subject_id   uuid not null,
  locked_by    uuid references public.staff(profile_id) on delete cascade,
  locked_at    timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  primary key (subject_type, subject_id)
);

create table if not exists public.reject_templates (
  code         text primary key,
  subject_type text not null default 'listing',
  label        text not null,
  body         text not null,
  sort_order   int not null default 0,
  is_active    boolean not null default true
);

create table if not exists public.report_actions (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports(id) on delete cascade,
  action        text not null,               -- dismiss | hide | warn | suspend | ban
  reason        text,
  actor_id      uuid references public.staff(profile_id) on delete set null,
  reporter_notified_at timestamptz,
  created_at    timestamptz not null default now()
);

-- -------------------------------------------------------------- user tooling
create table if not exists public.admin_notes (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null default 'user',
  subject_id   uuid not null,
  author_id    uuid references public.staff(profile_id) on delete set null,
  author_name  text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists admin_notes_subject_idx on public.admin_notes (subject_type, subject_id);

create table if not exists public.admin_messages (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel    text not null default 'in_app',  -- in_app | email | sms | whatsapp | push
  subject    text,
  body       text not null,
  sent_by    uuid references public.staff(profile_id) on delete set null,
  sent_by_name text not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_messages_profile_idx on public.admin_messages (profile_id, created_at desc);

create table if not exists public.device_bans (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'device',  -- device | ip
  value        text not null,
  profile_id   uuid references public.profiles(id) on delete set null,
  reason       text not null,
  banned_by    uuid references public.staff(profile_id) on delete set null,
  expires_at   timestamptz,
  lifted_at    timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.impersonation_sessions (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid references public.staff(profile_id) on delete set null,
  staff_name  text not null,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  reason      text,
  ip          text,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create table if not exists public.account_suspensions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  reason      text not null,
  days        int,
  suspended_by uuid references public.staff(profile_id) on delete set null,
  lifted_at   timestamptz,
  lifted_by   uuid references public.staff(profile_id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.grants (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         text not null default 'trial',   -- trial | free_plan | balance
  catalog_code text,
  contents     jsonb not null default '{}'::jsonb,
  duration_days int,
  reason       text not null,
  granted_by   uuid references public.staff(profile_id) on delete set null,
  granted_by_name text not null,
  user_plan_id uuid references public.user_plans(id) on delete set null,
  notified_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ finance
create table if not exists public.chargebacks (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  amount_paise bigint not null,
  reason      text not null,
  status      text not null default 'open',    -- open | contested | lost | won
  plan_suspended boolean not null default true,
  raised_at   timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.reconciliation_runs (
  id            uuid primary key default gen_random_uuid(),
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  platform_count int not null default 0,
  gateway_count  int not null default 0,
  matched       int not null default 0,
  mismatched    int not null default 0,
  status        text not null default 'ok',    -- ok | mismatch | failed
  ran_at        timestamptz not null default now()
);

create table if not exists public.reconciliation_items (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.reconciliation_runs(id) on delete cascade,
  payment_id  uuid references public.payments(id) on delete set null,
  gateway_ref text,
  platform_paise bigint,
  gateway_paise  bigint,
  state       text not null default 'matched', -- matched | missing_gateway | missing_platform | amount_mismatch
  rechecked_at timestamptz,
  note        text
);

-- ------------------------------------------------------------------ support
create table if not exists public.support_tickets (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  profile_id     uuid references public.profiles(id) on delete set null,
  subject        text not null,
  category       text not null,               -- payment_refund | listing_not_approved | number_recovery | verification | bug | grievance | other
  priority       text not null default 'normal', -- low | normal | high | urgent
  status         text not null default 'open',   -- open | replied | closed
  assignee_id    uuid references public.staff(profile_id) on delete set null,
  payment_id     uuid references public.payments(id) on delete set null,
  listing_id     uuid references public.listings(id) on delete set null,
  is_grievance   boolean not null default false,
  acked_at       timestamptz,
  sla_due_at     timestamptz,
  resolution     text,
  closed_at      timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, last_activity_at desc);

create table if not exists public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_kind text not null default 'user',   -- user | staff
  author_id   uuid,
  author_name text not null,
  body        text not null,
  is_internal boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

create table if not exists public.canned_responses (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  category   text not null default 'general',
  body       text not null,
  used_count int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.disputes (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique,
  party_a       uuid not null references public.profiles(id) on delete cascade,
  party_b       uuid not null references public.profiles(id) on delete cascade,
  listing_id    uuid references public.listings(id) on delete set null,
  thread_id     uuid references public.chat_threads(id) on delete set null,
  category      text not null default 'transaction',
  summary       text not null,
  amount_claimed_paise bigint,
  status        text not null default 'open',   -- open | investigating | resolved | closed
  outcome       text,                           -- no_liability | mediated | escalated | user_at_fault
  resolution    text,
  evidence_preserved boolean not null default false,
  opened_by     uuid references public.staff(profile_id) on delete set null,
  resolved_by   uuid references public.staff(profile_id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------- CMS
create table if not exists public.cms_pages (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  body_md       text not null,
  version       text not null default '1.0',
  is_published  boolean not null default true,
  requires_reacceptance boolean not null default false,
  seo_title     text,
  seo_description text,
  updated_by    uuid references public.staff(profile_id) on delete set null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.cms_page_versions (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.cms_pages(id) on delete cascade,
  version    text not null,
  title      text not null,
  body_md    text not null,
  note       text,
  created_by uuid references public.staff(profile_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text,
  body_md      text not null,
  cover_url    text,
  category     text not null default 'guides',
  tags         text[] not null default '{}',
  status       text not null default 'draft',   -- draft | scheduled | published
  seo_title    text,
  seo_description text,
  read_minutes int not null default 4,
  view_count   int not null default 0,
  author_id    uuid references public.staff(profile_id) on delete set null,
  author_name  text not null default 'HomzList',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.faqs (
  id           uuid primary key default gen_random_uuid(),
  category     text not null default 'general',
  question     text not null,
  answer       text not null,
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  helpful_yes  int not null default 0,
  helpful_no   int not null default 0,
  created_at   timestamptz not null default now()
);

-- banners already exist as feed_banners; the admin screen adds targeting.
alter table public.feed_banners add column if not exists target_cities uuid[] not null default '{}';
alter table public.feed_banners add column if not exists target_roles  text[] not null default '{}';
alter table public.feed_banners add column if not exists target_plan_status text;
alter table public.feed_banners add column if not exists frequency_cap int not null default 0;
alter table public.feed_banners add column if not exists impressions   int not null default 0;
alter table public.feed_banners add column if not exists clicks        int not null default 0;

create table if not exists public.broadcasts (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  body           text not null,
  channels       text[] not null default '{push}',
  audience       jsonb not null default '{}'::jsonb,  -- {city:[], role:[], plan_status:""}
  recipient_count int not null default 0,
  cost_estimate_paise bigint not null default 0,
  status         text not null default 'draft',       -- draft | scheduled | sending | sent | failed
  scheduled_at   timestamptz,
  sent_at        timestamptz,
  sent_by        uuid references public.staff(profile_id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------- templates & UI strings
create table if not exists public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  channel     text not null,                 -- email | sms | whatsapp | push
  name        text not null,
  subject     text,
  body        text not null,
  variables   text[] not null default '{}',
  provider_ref text,                          -- DLT id / Meta template name
  is_active   boolean not null default true,
  last_test_at timestamptz,
  updated_by  uuid references public.staff(profile_id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (code, channel)
);

create table if not exists public.ui_strings (
  key        text primary key,
  area       text not null default 'common',
  en         text not null,
  gu         text,
  hi         text,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------- settings and flags
create table if not exists public.feature_flags (
  key         text primary key,
  label       text not null,
  description text,
  enabled     boolean not null default true,
  scope       text not null default 'all',   -- all | percentage | city | role | staff
  scope_value jsonb not null default '{}'::jsonb,
  updated_by  uuid references public.staff(profile_id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.rate_limits (
  key            text primary key,
  label          text not null,
  scope          text not null default 'ip',  -- ip | user | device | phone
  window_seconds int not null,
  max_requests   int not null,
  block_seconds  int not null default 0,
  is_active      boolean not null default true,
  updated_at     timestamptz not null default now()
);

create table if not exists public.velocity_rules (
  key         text primary key,
  label       text not null,
  threshold   int not null,
  window_hours int not null,
  action      text not null default 'flag',   -- flag | throttle | block
  is_active   boolean not null default true
);

create table if not exists public.retention_settings (
  key        text primary key,
  label      text not null,
  days       int not null,
  is_locked  boolean not null default false,  -- legal minimum, admin cannot lower
  note       text,
  updated_at timestamptz not null default now()
);

create table if not exists public.boost_rates (
  code       text primary key,
  label      text not null,
  targeting  text not null,                   -- area | city | search
  days       int not null,
  price_paise bigint not null,
  is_active  boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.city_caps (
  city_id      uuid primary key references public.locations(id) on delete cascade,
  max_active_boosts int not null default 20,
  is_launched  boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table if not exists public.branding_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_settings (
  id         boolean primary key default true check (id),
  enabled    boolean not null default false,
  message    text not null default 'HomzList is under maintenance. We will be back shortly.',
  eta        timestamptz,
  bypass_roles text[] not null default '{super,admin,staff}',
  updated_by uuid references public.staff(profile_id) on delete set null,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------- master data (moderation)
create table if not exists public.blocklist_words (
  id         uuid primary key default gen_random_uuid(),
  word       text not null,
  script     text not null default 'latin',   -- latin | gujarati | devanagari | mixed
  severity   text not null default 'block',   -- block | flag
  applies_to text[] not null default '{listing,chat,bio,requirement}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists blocklist_words_word_key on public.blocklist_words (lower(word));

create table if not exists public.number_patterns (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  pattern    text not null,
  sample     text,
  action     text not null default 'flag',    -- flag | block
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- area_requests already exists; the queue needs a decision trail.
alter table public.area_requests add column if not exists note        text;
alter table public.area_requests add column if not exists resolved_by uuid references public.staff(profile_id) on delete set null;
alter table public.area_requests add column if not exists resolved_at timestamptz;
alter table public.area_requests add column if not exists created_area_id uuid references public.locations(id) on delete set null;

-- ------------------------------------------------------- system / operations
create table if not exists public.cron_jobs (
  code         text primary key,
  name         text not null,
  schedule     text not null,
  description  text,
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  last_status  text,                          -- success | failed | running
  last_duration_ms int,
  next_run_at  timestamptz,
  failure_count int not null default 0
);

create table if not exists public.cron_runs (
  id          uuid primary key default gen_random_uuid(),
  job_code    text not null references public.cron_jobs(code) on delete cascade,
  started_at  timestamptz not null,
  finished_at timestamptz,
  status      text not null default 'success',
  duration_ms int,
  processed   int not null default 0,
  error       text,
  triggered_by text not null default 'schedule'  -- schedule | admin
);
create index if not exists cron_runs_job_idx on public.cron_runs (job_code, started_at desc);

create table if not exists public.health_checks (
  id         uuid primary key default gen_random_uuid(),
  component  text not null,                   -- api | database | redis | storage | queues
  status     text not null default 'healthy',  -- healthy | degraded | down
  detail     text,
  latency_ms int,
  checked_at timestamptz not null default now()
);

create table if not exists public.queue_depths (
  id         uuid primary key default gen_random_uuid(),
  queue      text not null,
  depth      int not null default 0,
  workers    int not null default 0,
  oldest_age_seconds int not null default 0,
  checked_at timestamptz not null default now()
);

create table if not exists public.backups (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'daily',
  status         text not null default 'success',
  size_bytes     bigint,
  started_at     timestamptz not null,
  finished_at    timestamptz,
  restore_drill_at date,
  note           text
);

create table if not exists public.anomaly_events (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                  -- payment_failure_spike | otp_spike | report_spike
  severity    text not null default 'warning',-- warning | error
  message     text not null,
  link_screen text,
  metric      jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid references public.staff(profile_id) on delete set null
);

create table if not exists public.admin_notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  title      text not null,
  body       text,
  link_screen text,
  entity_id  uuid,
  severity   text not null default 'info',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- analytics
create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                  -- the 10 wired events
  profile_id  uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id   uuid,
  city_id     uuid references public.locations(id) on delete set null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists analytics_events_name_idx on public.analytics_events (name, created_at desc);

create table if not exists public.platform_daily_stats (
  day             date primary key,
  signups         int not null default 0,
  listings_created int not null default 0,
  listings_live   int not null default 0,
  inquiries       int not null default 0,
  leads           int not null default 0,
  revenue_paise   bigint not null default 0,
  plan_revenue_paise bigint not null default 0,
  boost_revenue_paise bigint not null default 0,
  topup_revenue_paise bigint not null default 0,
  payment_failures int not null default 0
);

create table if not exists public.city_daily_stats (
  day        date not null,
  city_id    uuid not null references public.locations(id) on delete cascade,
  signups    int not null default 0,
  listings   int not null default 0,
  inquiries  int not null default 0,
  revenue_paise bigint not null default 0,
  primary key (day, city_id)
);

create table if not exists public.funnel_daily (
  day         date primary key,
  visitors    int not null default 0,
  signups     int not null default 0,
  plan_bought int not null default 0,
  listing_posted int not null default 0,
  lead_received  int not null default 0
);

create table if not exists public.story_aggregates (
  day         date not null,
  city_id     uuid not null references public.locations(id) on delete cascade,
  impressions int not null default 0,
  taps        int not null default 0,
  primary key (day, city_id)
);

create table if not exists public.metric_definitions (
  key        text primary key,
  label      text not null,
  definition text not null
);

-- --------------------------------------------------------- trash & exports
create table if not exists public.trash_items (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,                -- listing | requirement | user | chat | photo | cms_page | coupon | project
  entity_id     uuid not null,
  label         text not null,
  deleted_by_kind text not null default 'user', -- user | admin | system
  deleted_by    uuid,
  deleted_by_name text,
  reason        text,
  deleted_at    timestamptz not null default now(),
  purge_at      timestamptz not null default (now() + interval '30 days'),
  restored_at   timestamptz,
  restored_by   uuid references public.staff(profile_id) on delete set null
);
create index if not exists trash_items_type_idx on public.trash_items (entity_type, deleted_at desc);

create table if not exists public.exports (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  entity       text not null,                 -- users | payments | listings | audit | finance
  filters      jsonb not null default '{}'::jsonb,
  format       text not null default 'csv',
  row_count    int not null default 0,
  status       text not null default 'processing', -- processing | ready | expired | failed
  reason       text,
  contains_personal_data boolean not null default false,
  file_key     text,
  requested_by uuid references public.staff(profile_id) on delete set null,
  requested_by_name text not null,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------- RLS on
do $$
declare t text;
begin
  foreach t in array array[
    'seed_ledger','admin_login_attempts','staff_sessions','admin_audit_log','admin_saved_views',
    'review_locks','reject_templates','report_actions','admin_notes','admin_messages','device_bans',
    'impersonation_sessions','account_suspensions','grants','chargebacks','reconciliation_runs',
    'reconciliation_items','support_tickets','ticket_messages','canned_responses','disputes',
    'cms_pages','cms_page_versions','blog_posts','faqs','broadcasts','message_templates','ui_strings',
    'feature_flags','rate_limits','velocity_rules','retention_settings','boost_rates','city_caps',
    'branding_settings','maintenance_settings','blocklist_words','number_patterns','cron_jobs',
    'cron_runs','health_checks','queue_depths','backups','anomaly_events','admin_notifications',
    'analytics_events','platform_daily_stats','city_daily_stats','funnel_daily','story_aggregates',
    'metric_definitions','trash_items','exports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
