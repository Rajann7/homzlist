-- ============================================================================
-- HomzList — Migration 0027: feed admin banners (P2 "admin banner" slot).
--
-- The P2 feed design shows an admin-controlled banner strip (16:5) above the
-- feed — "Home loans @ 8.4% / Pre-approved in 24 hours" in the mock. It was a
-- design element with NO data source, so `AdminBanner` rendered nothing and the
-- slot was silently absent from the running app.
--
-- Per CLAUDE.md rule 12 (build the table + endpoint, never fake, never leave a
-- placeholder): this is that table. The admin CMS (P15 / Module 11) will manage
-- rows later; until then rows are seeded. The feed reads the single highest-
-- priority ACTIVE banner in its window, server-side. Text/gradient OR image —
-- both driven from here, nothing hardcoded in the component.
-- ============================================================================

create table if not exists public.feed_banners (
  id           uuid primary key default gen_random_uuid(),
  -- Where it shows. Only 'feed' today; kept explicit so search/detail can reuse.
  placement    text not null default 'feed' check (placement in ('feed')),
  title        text not null,                 -- 15px/700 line in the design
  subtitle     text,                          -- 11px/85% line in the design
  -- Optional artwork. NULL → the component paints the design's accent gradient.
  image_url    text,
  -- Tap target. NULL → non-tappable (dismiss only).
  target_url   text,
  is_active    boolean not null default true,
  -- Scheduling window (both nullable = always, within is_active).
  starts_at    timestamptz,
  ends_at      timestamptz,
  sort_order   integer not null default 0,    -- higher wins when several qualify
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists feed_banners_active_idx
  on public.feed_banners (placement, is_active, sort_order desc);

drop trigger if exists feed_banners_updated_at on public.feed_banners;
create trigger feed_banners_updated_at before update on public.feed_banners
  for each row execute function public.set_updated_at();

-- RLS: deny-all to browser roles — the server API (service role) is the only
-- read path, exactly like every other feed table (Module 6).
alter table public.feed_banners enable row level security;

-- Seed the design's banner so the slot renders real content on first run. This
-- is real admin content (a house-ad), not a fake business value — a genuine row
-- the P15 CMS will later edit or replace.
insert into public.feed_banners (placement, title, subtitle, target_url, sort_order)
select 'feed', 'Home loans @ 8.4%', 'Pre-approved in 24 hours', null, 100
where not exists (select 1 from public.feed_banners where title = 'Home loans @ 8.4%');
