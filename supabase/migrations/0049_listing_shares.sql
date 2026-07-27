-- ============================================================================
-- HomzList — Migration 0049: listing shares
--
-- P9 S5 (Listing insights) draws four metric cards: Views · Saves · Shares ·
-- Leads. Three of them have had a real query behind them since Modules 4–6;
-- SHARES had no table at all, so the card could only ever have been a hardcoded
-- number (CLAUDE.md §7 bans exactly that).
--
-- The screen's own footnote states the rule this table has to satisfy:
--
--   "Your own views and shares aren't counted."
--
-- so the owner's own shares are rejected server-side before an insert is even
-- attempted, the same way `recordListingView` skips the owner.
--
-- Dedupe mirrors `listing_views` (0018): one row per (listing, sharer, channel,
-- IST day). Copying a link four times to paste it in four places is one share
-- of that listing to that channel for the day, and the unique index IS the
-- dedupe, so there is no read-modify-write race. `sharer_key` is the profile id
-- for a signed-in user or a salted hash of ip+ua for a guest — never a raw IP
-- (Doc9: no PII in analytics).
-- ============================================================================

create table if not exists public.listing_shares (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  -- profile id, or sha256(ip|ua|salt) for a guest. Opaque either way.
  sharer_key  text not null,
  -- Which destination the share sheet used. Constrained so a client cannot
  -- invent channels and fragment the metric.
  channel     text not null check (channel in ('copy', 'whatsapp', 'native')),
  shared_on   date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at  timestamptz not null default now()
);

-- One share per sharer per listing per channel per IST day.
create unique index if not exists listing_shares_unique_per_day
  on public.listing_shares (listing_id, sharer_key, channel, shared_on);

-- The insights card counts by listing, so the join column needs an index.
create index if not exists listing_shares_listing_idx
  on public.listing_shares (listing_id);

-- RLS on every table (CLAUDE.md). Deny-all for clients exactly like
-- `listing_views`: the count is owner-only data and is read through the
-- service-role server after the ownership gate, never straight from a browser.
alter table public.listing_shares enable row level security;

comment on table public.listing_shares is
  'P9 S5 Shares metric — one row per sharer/listing/channel/IST day; owner''s own shares are not recorded.';
