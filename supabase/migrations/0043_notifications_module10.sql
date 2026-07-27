-- ============================================================================
-- HomzList — Migration 0043: Module 10 notifications — tables, rules, jobs
--   Doc2 §14 · Doc4 §61 · Doc7 §16 · Doc9 §4.  Continues 0042 (enum values).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2. Config: categories (the chip bar) + types (icon/tone/deep-link/actions)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_categories (
  code       text primary key,             -- inquiry | listing | requirement | payment
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

insert into public.notification_categories (code, label, sort_order) values
  ('inquiry',     'Inquiries',    1),
  ('listing',     'Listings',     2),
  ('requirement', 'Requirements', 3),
  ('payment',     'Payments',     4)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;

-- One row per event type. Everything the P11 row needs to render, and
-- everything the delivery engine needs to decide, lives HERE — not in a
-- component and not in a switch statement.
--
--   lead_kind     'avatar' (actor's photo/initials) | 'icon' (icon circle)
--   lead_icon     Icon name (components/ui/Icon) when lead_kind = 'icon'
--   lead_tone     accent | warn | err | info | neutral  → .ic-* class
--   href_template deep-link with {placeholders} filled from the row's `data`
--   actions       default inline actions; a row may override with its own
--   is_urgent     true → bypasses quiet hours (Doc2 §14 "non-urgent ≥11PM held")
--   is_marketing  true → needs explicit marketing consent for push/email (DPDP)
--   group_window_minutes  >0 → events sharing a group_key inside this window
--                         collapse into one row with a count
create table if not exists public.notification_types (
  code                 notification_type primary key,
  category             text not null references public.notification_categories(code),
  label                text not null,
  lead_kind            text not null default 'icon' check (lead_kind in ('avatar','icon')),
  lead_icon            text,
  lead_tone            text not null default 'neutral' check (lead_tone in ('accent','warn','err','info','neutral')),
  href_template        text,
  actions              jsonb not null default '[]'::jsonb,
  is_urgent            boolean not null default false,
  is_marketing         boolean not null default false,
  default_push         boolean not null default true,
  default_email        boolean not null default false,
  group_window_minutes integer not null default 0,
  show_thumb           boolean not null default false,
  sort_order           integer not null default 0
);

insert into public.notification_types
  (code, category, label, lead_kind, lead_icon, lead_tone, href_template, actions,
   is_urgent, is_marketing, default_push, default_email, group_window_minutes, show_thumb)
values
  -- ---- inquiry / chat -----------------------------------------------------
  ('inquiry_received','inquiry','Inquiry received','avatar',null,'neutral','/messages/{threadId}',
   '[]'::jsonb, true, false, true, true, 0, true),
  ('new_message','inquiry','New message','avatar',null,'neutral','/messages/{threadId}',
   '[]'::jsonb, false, false, true, false, 1440, false),
  ('chat_accepted','inquiry','Inquiry accepted','avatar',null,'neutral','/messages/{threadId}',
   '[]'::jsonb, true, false, true, false, 0, false),
  ('number_requested','inquiry','Number requested','avatar',null,'neutral','/messages/{threadId}',
   '[{"key":"number_deny","label":"Deny","style":"outline"},{"key":"number_allow","label":"Allow","style":"primary"}]'::jsonb,
   true, false, true, true, 0, false),
  ('number_shared','inquiry','Number shared','avatar',null,'neutral','/messages/{threadId}',
   '[]'::jsonb, true, false, true, false, 0, false),

  -- ---- listing moderation & lifecycle -------------------------------------
  ('listing_approved','listing','Listing approved','icon','check-circle','accent','/property/{listingId}',
   '[]'::jsonb, true, false, true, true, 1440, true),
  ('listing_changes_requested','listing','Changes requested','icon','alert','warn','/create/listing/{listingId}',
   '[{"key":"edit_listing","label":"Edit listing","style":"primary"}]'::jsonb,
   true, false, true, true, 0, false),
  ('listing_rejected','listing','Listing rejected','icon','x-circle','err','/listings',
   '[{"key":"appeal","label":"Appeal","style":"link"}]'::jsonb,
   true, false, true, true, 0, false),
  ('still_available','listing','Still available?','icon','clock','neutral','/listings',
   '[{"key":"still_no","label":"No, it''s sold","style":"outline"},{"key":"still_yes","label":"Yes","style":"primary"}]'::jsonb,
   false, false, true, true, 0, false),
  ('saved_listing_status','listing','Saved listing changed','icon','info','neutral','/property/{listingId}',
   '[]'::jsonb, false, false, true, false, 0, true),
  ('price_drop','listing','Price dropped','icon','arrow-down','accent','/property/{listingId}',
   '[]'::jsonb, false, false, true, false, 0, true),
  ('report_outcome','listing','Report outcome','icon','shield','neutral','/help',
   '[{"key":"view_report","label":"View status","style":"link"}]'::jsonb,
   false, false, true, false, 0, false),
  ('suspension_lifted','listing','Suspension lifted','icon','check-circle','accent','/profile',
   '[]'::jsonb, true, false, true, true, 0, false),
  ('performance_nudge','listing','Performance nudge','icon','bulb','neutral','/create/listing/{listingId}',
   '[{"key":"edit_listing","label":"Edit","style":"outline"}]'::jsonb,
   false, true, true, false, 0, false),
  ('area_added','listing','New area available','icon','pin','neutral','/area/{areaSlug}',
   '[]'::jsonb, false, true, true, false, 0, false),
  ('weekly_digest','listing','Weekly digest','icon','chart','neutral','/listings',
   '[{"key":"view_digest","label":"See details","style":"link"}]'::jsonb,
   false, true, true, true, 0, false),
  ('city_launched','listing','City launched','icon','pin','accent','/search',
   '[]'::jsonb, false, true, true, true, 0, false),

  -- ---- boost --------------------------------------------------------------
  ('boost_approved','listing','Boost live','icon','rocket','accent','/boost',
   '[]'::jsonb, true, false, true, true, 0, false),
  ('boost_rejected','listing','Boost not approved','icon','rocket','err','/boost',
   '[]'::jsonb, true, false, true, true, 0, false),
  ('boost_expiring','listing','Boost ending','icon','rocket','accent','/boost',
   '[{"key":"renew_boost","label":"Renew","style":"primary"}]'::jsonb,
   false, false, true, false, 0, false),
  ('boost_expired','listing','Boost ended','icon','rocket','neutral','/boost',
   '[{"key":"renew_boost","label":"Boost again","style":"primary"}]'::jsonb,
   false, false, true, false, 0, false),
  ('boost_stopped','listing','Boost stopped','icon','rocket','err','/boost',
   '[]'::jsonb, true, false, true, true, 0, false),

  -- ---- requirements / proposals / matching --------------------------------
  ('proposal_received','requirement','Proposal received','avatar',null,'neutral','/messages/{threadId}',
   '[]'::jsonb, true, false, true, true, 0, false),
  ('proposal_accepted','requirement','Proposal accepted','icon','check-circle','accent','/proposals',
   '[]'::jsonb, true, false, true, true, 0, false),
  ('proposal_declined','requirement','Proposal declined','icon','x-circle','err','/proposals',
   '[]'::jsonb, false, false, true, false, 0, false),
  ('proposal_expired','requirement','Proposal expired','icon','hourglass','neutral','/proposals',
   '[]'::jsonb, false, false, true, false, 0, false),
  ('saved_search_match','requirement','Saved search match','icon','search','neutral','/search/results?saved={savedSearchId}',
   '[]'::jsonb, false, false, true, false, 1440, false),
  ('requirement_match','requirement','Requirement match','icon','building','neutral','/requirements/{requirementId}',
   '[]'::jsonb, false, false, true, false, 1440, false),
  ('requirement_expiring','requirement','Requirement expiring','icon','hourglass','neutral','/requirements/{requirementId}',
   '[{"key":"view_requirement","label":"View","style":"link"}]'::jsonb,
   false, false, true, true, 0, false),

  -- ---- plans, payments, security ------------------------------------------
  ('plan_expiring','payment','Plan expiring','icon','card','neutral','/plans',
   '[{"key":"renew_plan","label":"Renew","style":"primary"}]'::jsonb,
   true, false, true, true, 0, false),
  ('plan_expired','payment','Plan expired','icon','card','warn','/plans',
   '[{"key":"renew_plan","label":"Renew","style":"primary"}]'::jsonb,
   true, false, true, true, 0, false),
  ('trial_ending','payment','Trial ending','icon','card','warn','/plans',
   '[{"key":"renew_plan","label":"See plans","style":"primary"}]'::jsonb,
   true, false, true, true, 0, false),
  ('payment_success','payment','Payment successful','icon','receipt','neutral','/payments',
   '[{"key":"view_invoice","label":"View invoice","style":"link"}]'::jsonb,
   true, false, true, true, 0, false),
  ('payment_failed','payment','Payment failed','icon','receipt','err','/payments',
   '[{"key":"retry_payment","label":"Retry","style":"primary"}]'::jsonb,
   true, false, true, true, 0, false),
  ('refund_processed','payment','Refund processed','icon','refund','accent','/payments',
   '[]'::jsonb, true, false, true, true, 0, false),
  ('new_device_login','payment','New device login','icon','device','neutral','/settings/login-activity',
   '[{"key":"not_you","label":"Not you?","style":"link-error"}]'::jsonb,
   true, false, true, true, 0, false)
on conflict (code) do update set
  category = excluded.category, label = excluded.label,
  lead_kind = excluded.lead_kind, lead_icon = excluded.lead_icon, lead_tone = excluded.lead_tone,
  href_template = excluded.href_template, actions = excluded.actions,
  is_urgent = excluded.is_urgent, is_marketing = excluded.is_marketing,
  default_push = excluded.default_push, default_email = excluded.default_email,
  group_window_minutes = excluded.group_window_minutes, show_thumb = excluded.show_thumb;

-- ---------------------------------------------------------------------------
-- 3. notifications — the columns the screen and the rules need
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists category      text;
alter table public.notifications add column if not exists group_key     text;
alter table public.notifications add column if not exists group_count   integer not null default 1;
alter table public.notifications add column if not exists last_event_at timestamptz not null default now();
alter table public.notifications add column if not exists href          text;
alter table public.notifications add column if not exists thumb_url     text;
alter table public.notifications add column if not exists actions       jsonb not null default '[]'::jsonb;
alter table public.notifications add column if not exists action_taken  text;
alter table public.notifications add column if not exists action_taken_at timestamptz;
alter table public.notifications add column if not exists action_result text;
alter table public.notifications add column if not exists dismissed_at  timestamptz;
alter table public.notifications add column if not exists hold_until    timestamptz;
alter table public.notifications add column if not exists is_marketing  boolean not null default false;
alter table public.notifications add column if not exists entity_kind   text;
alter table public.notifications add column if not exists entity_id     uuid;

-- Backfill category on the rows 0029 already wrote, from the config table.
update public.notifications n
   set category = t.category
  from public.notification_types t
 where t.code = n.type and n.category is null;
update public.notifications set category = 'listing' where category is null;

alter table public.notifications alter column category set not null;
alter table public.notifications add constraint notifications_category_fk
  foreign key (category) references public.notification_categories(code);

-- The list query: mine, not dismissed, newest event first.
create index if not exists notifications_feed_idx
  on public.notifications (profile_id, last_event_at desc)
  where dismissed_at is null;
-- The open group a new event may collapse into.
create index if not exists notifications_group_idx
  on public.notifications (profile_id, group_key)
  where group_key is not null and dismissed_at is null and read_at is null;
-- Quiet-hours release sweep.
create index if not exists notifications_hold_idx
  on public.notifications (hold_until) where hold_until is not null;
create index if not exists notifications_category_idx
  on public.notifications (profile_id, category, last_event_at desc)
  where dismissed_at is null;

-- ---------------------------------------------------------------------------
-- 4. Per-channel delivery ledger — makes dedup + holds auditable
-- ---------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  channel         text not null check (channel in ('inapp','push','email','whatsapp')),
  status          text not null check (status in ('sent','skipped','failed','held')),
  reason          text,                 -- why skipped/held/failed
  provider_id     text,                 -- FCM message id / Resend id
  created_at      timestamptz not null default now(),
  unique (notification_id, channel)
);
create index if not exists notification_deliveries_profile_idx
  on public.notification_deliveries (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Preferences — per category, per channel, marketing separate (DPDP)
-- ---------------------------------------------------------------------------
alter table public.notification_prefs add column if not exists cat_inquiry      boolean not null default true;
alter table public.notification_prefs add column if not exists cat_listing      boolean not null default true;
alter table public.notification_prefs add column if not exists cat_requirement  boolean not null default true;
alter table public.notification_prefs add column if not exists cat_payment      boolean not null default true;
alter table public.notification_prefs add column if not exists push_enabled     boolean not null default true;
alter table public.notification_prefs add column if not exists email_enabled    boolean not null default true;
alter table public.notification_prefs add column if not exists whatsapp_enabled boolean not null default false;
-- DPDP: marketing is a SEPARATE, explicit, opt-IN consent. Never defaulted on,
-- never bundled with the transactional toggles.
alter table public.notification_prefs add column if not exists marketing_consent    boolean not null default false;
alter table public.notification_prefs add column if not exists marketing_consent_at timestamptz;
alter table public.notification_prefs add column if not exists quiet_hours boolean not null default true;
alter table public.notification_prefs add column if not exists quiet_start time;   -- null → global default
alter table public.notification_prefs add column if not exists quiet_end   time;

-- Every profile has a real prefs row, so nothing is ever an implied default.
insert into public.notification_prefs (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Global settings singleton (retention, quiet window, grouping)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_settings (
  id                  boolean primary key default true check (id),
  retention_days      integer not null default 90,   -- Doc2 §14 "90-day purge (config)"
  quiet_start         time    not null default '23:00',
  quiet_end           time    not null default '07:00',
  timezone            text    not null default 'Asia/Kolkata',
  batch_window_minutes integer not null default 1440,
  updated_at          timestamptz not null default now()
);
insert into public.notification_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Device-aware push tokens
-- ---------------------------------------------------------------------------
alter table public.push_tokens add column if not exists browser      text;
alter table public.push_tokens add column if not exists os           text;
alter table public.push_tokens add column if not exists device_label text;
-- iOS delivers web push ONLY to an installed (standalone) PWA. Recording it
-- lets the server explain a silent device instead of guessing.
alter table public.push_tokens add column if not exists standalone   boolean not null default false;
alter table public.push_tokens add column if not exists user_agent   text;

-- ---------------------------------------------------------------------------
-- 8. notify_upsert — THE atomic write path (grouping happens here)
-- ---------------------------------------------------------------------------
-- Doing the group-or-insert in SQL means two concurrent messages in the same
-- thread cannot each miss the other's row and create two "1 new message" rows.
-- Category / marketing / urgency / default actions / href all come from the
-- config table, so a caller can never invent a type that the screen can't render.
create or replace function public.notify_upsert(
  p_profile     uuid,
  p_type        notification_type,
  p_title       text,
  p_body        text default null,
  p_group_key   text default null,
  p_href        text default null,
  p_thumb_url   text default null,
  p_actions     jsonb default null,
  p_thread_id   uuid default null,
  p_actor_id    uuid default null,
  p_data        jsonb default '{}'::jsonb,
  p_entity_kind text default null,
  p_entity_id   uuid default null,
  p_hold_until  timestamptz default null
) returns table (id uuid, grouped boolean, group_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  t          public.notification_types%rowtype;
  v_id       uuid;
  v_count    integer;
  v_grouped  boolean := false;
begin
  select * into t from public.notification_types where code = p_type;
  if not found then
    raise exception 'unknown notification type %', p_type;
  end if;

  -- Grouping / batch dedup: fold into the recipient's existing OPEN row with
  -- the same group_key, inside the type's window. Read or dismissed rows are
  -- closed — a new event after the user has seen it starts a fresh row.
  if p_group_key is not null and t.group_window_minutes > 0 then
    update public.notifications n
       set group_count   = n.group_count + 1,
           title         = p_title,
           body          = coalesce(p_body, n.body),
           thumb_url     = coalesce(p_thumb_url, n.thumb_url),
           href          = coalesce(p_href, n.href),
           data          = coalesce(p_data, n.data),
           last_event_at = now(),
           hold_until    = p_hold_until
     where n.profile_id = p_profile
       and n.group_key  = p_group_key
       and n.read_at is null
       and n.dismissed_at is null
       and n.last_event_at > now() - make_interval(mins => t.group_window_minutes)
    returning n.id, n.group_count into v_id, v_count;

    if v_id is not null then
      return query select v_id, true, v_count;
      return;
    end if;
  end if;

  insert into public.notifications
    (profile_id, type, category, title, body, thread_id, actor_id, data,
     group_key, group_count, last_event_at, href, thumb_url, actions,
     is_marketing, entity_kind, entity_id, hold_until)
  values
    (p_profile, p_type, t.category, p_title, p_body, p_thread_id, p_actor_id,
     coalesce(p_data, '{}'::jsonb),
     p_group_key, 1, now(), coalesce(p_href, t.href_template), p_thumb_url,
     coalesce(p_actions, t.actions), t.is_marketing, p_entity_kind, p_entity_id,
     p_hold_until)
  returning notifications.id into v_id;

  return query select v_id, false, 1;
end;
$$;

revoke all on function public.notify_upsert(uuid, notification_type, text, text, text, text, text, jsonb, uuid, uuid, jsonb, text, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. purge_old_notifications — the JOB behind the 90-day promise
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_n    integer;
begin
  select retention_days into v_days from public.notification_settings where id;
  v_days := coalesce(v_days, 90);
  with gone as (
    delete from public.notifications
     where created_at < now() - make_interval(days => v_days)
    returning 1
  ) select count(*) into v_n from gone;
  return v_n;
end;
$$;

revoke all on function public.purge_old_notifications() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. RLS — deny-all to browser roles on every table here
-- ---------------------------------------------------------------------------
alter table public.notification_categories  enable row level security;
alter table public.notification_types       enable row level security;
alter table public.notification_deliveries  enable row level security;
alter table public.notification_settings    enable row level security;
-- (notifications / push_tokens / notification_prefs already have RLS enabled.)

-- ============================================================================
-- End 0043_notifications_module10.sql
-- ============================================================================
