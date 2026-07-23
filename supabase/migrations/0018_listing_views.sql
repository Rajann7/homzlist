-- ============================================================================
-- HomzList — Migration 0018: listing views
--
-- The profile header has always rendered a "Views" tile, and it was a literal
-- `views: 0` in the API — a stat with no query behind it (CLAUDE.md §7 bans
-- exactly that). Its own tooltip already states the rule it needs:
--
--   "Views = unique property detail opens per day. Your own views aren't
--    counted."
--
-- So: one row per (listing, viewer, day). The unique index IS the dedupe — an
-- upsert that conflicts is a no-op, which means a buyer refreshing the page
-- twenty times still counts once, with no read-modify-write race.
--
-- `viewer_key` is the profile id for a signed-in viewer, or a salted hash of
-- ip+ua for a guest. A raw IP is never stored (Doc9 — no PII in analytics).
-- ============================================================================

create table if not exists public.listing_views (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  -- profile id, or sha256(ip|ua|salt) for a guest. Opaque either way.
  viewer_key  text not null,
  viewed_on   date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at  timestamptz not null default now()
);

-- One view per viewer per listing per IST day (Doc2 §13).
create unique index if not exists listing_views_unique_per_day
  on public.listing_views (listing_id, viewer_key, viewed_on);

-- The profile stat aggregates by owner, so the join column needs an index.
create index if not exists listing_views_listing_idx
  on public.listing_views (listing_id);

alter table public.listing_views enable row level security;
