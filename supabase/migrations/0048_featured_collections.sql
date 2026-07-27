-- ============================================================================
-- HomzList — Migration 0048: Featured collections (P9 S1 + S2)
--   designs/P9 "Sheets.featured" and the visitor-profile circle row · Doc4 §44.
-- ============================================================================
--
-- The profile has ONE curation surface: the featured circles under the
-- Edit-profile row. A short-lived `listings.pinned_at` column existed on the DEV
-- database between these two migrations; it was removed there directly along
-- with the migration that added it, so no database that has not already run it
-- ever creates the column. Nothing else referenced it.

-- ---------------------------------------------------------------------------
-- Featured collections — the named circles on the own profile ("Ready to move",
-- "Under ₹50 L", …). A collection is just a name plus an ordered set of the
-- owner's own listings; the design shows the name under a 64px circle.
-- ---------------------------------------------------------------------------
create table if not exists public.featured_collections (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);

create index if not exists featured_collections_profile_idx
  on public.featured_collections (profile_id, created_at);

-- Membership. `on delete cascade` on listing_id is what keeps a collection
-- honest when a listing is deleted for good — no dangling member, no tile that
-- opens nothing. Whether a member is still VISIBLE (live) is decided at read
-- time, the same rule the rest of the profile uses.
create table if not exists public.featured_collection_items (
  collection_id uuid not null references public.featured_collections(id) on delete cascade,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  position      integer not null default 0,
  primary key (collection_id, listing_id)
);

create index if not exists featured_collection_items_collection_idx
  on public.featured_collection_items (collection_id, position);

-- RLS on every table (CLAUDE.md). Deny-all for clients exactly like the rest of
-- the schema: reads and writes go through the service-role server AFTER the
-- session gate has authorized them, never straight from a browser.
alter table public.featured_collections enable row level security;
alter table public.featured_collection_items enable row level security;

comment on table public.featured_collections is
  'P9 S1 featured circles — owner-curated named groups of their own listings.';
