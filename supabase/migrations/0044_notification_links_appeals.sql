-- ============================================================================
-- HomzList — Migration 0044: real deep links + the appeal the design offers
--   Doc2 §5.4 (3 rejects → locked → appeal) · Doc2 §14 (deep-link map per type)
--
-- Two corrections found while wiring the P11 notifications screen:
--
-- 1. The href templates seeded in 0043 pointed at paths this app does not
--    serve. `/property/{id}` is the PUBLIC detail page — but the recipient of
--    "your listing is now live" is the OWNER, whose listing lives at
--    `/listings/{id}`; editing is `/create/form?edit={id}`. A deep link that
--    404s is a dead-end, which rule 10 forbids. Fixed here so every mapped
--    type lands on a route that exists.
--
-- 2. The design's rejected-listing row carries an "Appeal" button. There was
--    nowhere for an appeal to go — the prototype only toasted. Appeals RESOLVE
--    on the admin side (Doc7 §137, P13-15), but the user's half must record a
--    real row or the button is a lie. `moderation_appeals` is that row; the
--    admin resolution screen is tracked in docs/PENDING-INTEGRATIONS.md.
-- ============================================================================

-- ---- 1. deep links that actually resolve ------------------------------------
update public.notification_types set href_template = '/listings/{listingId}'
 where code in ('listing_approved','listing_rejected','still_available');
update public.notification_types set href_template = '/create/form?edit={listingId}'
 where code in ('listing_changes_requested','performance_nudge');
update public.notification_types set href_template = '/listings'
 where code = 'weekly_digest';
-- price-drop / saved-listing rows go to the BUYER, so the public page is right.
update public.notification_types set href_template = '/property/{listingId}'
 where code in ('price_drop','saved_listing_status');
-- The report row's "View status" opens what was reported; the row itself has
-- no target until the Help & Support module (P12) ships a status screen.
update public.notification_types set href_template = null
 where code in ('report_outcome','new_device_login');
-- A saved-search alert carries its own filter query string, built when the
-- alert fires, so the template is only the fallback.
update public.notification_types set href_template = '/search'
 where code = 'saved_search_match';
update public.notification_types set href_template = '/profile'
 where code = 'suspension_lifted';

-- ---- 2. moderation_appeals ---------------------------------------------------
create table if not exists public.moderation_appeals (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null check (subject in ('listing','requirement','project')),
  subject_id  uuid not null,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  reason      text,
  status      text not null default 'open' check (status in ('open','upheld','rejected')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution  text,
  created_at  timestamptz not null default now(),
  -- One open appeal per item per user: tapping Appeal twice is not two appeals.
  unique (subject, subject_id, profile_id)
);
create index if not exists moderation_appeals_status_idx
  on public.moderation_appeals (status, created_at);

alter table public.moderation_appeals enable row level security;

-- ============================================================================
-- End 0044_notification_links_appeals.sql
-- ============================================================================
