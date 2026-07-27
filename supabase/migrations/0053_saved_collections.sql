-- ============================================================================
-- HomzList — Migration 0053: saved collections + price snapshot (P10 S1 Saved)
--
-- The feed heart already persists to `saves` (0026). The P10 Saved screen adds
-- two things on top, both of which need real storage, not frontend state:
--
--  1. PRIVATE collections — the chip row ("All", "For parents", "Investment"…).
--     A save belongs to at most one collection; uncategorised saves show only
--     under "All". `save_collections` is per-user and RLS deny-all (server-only).
--
--  2. The "N saved properties changed" alert — needs the price AT SAVE TIME to
--     tell a real drop from the price simply being what it always was. We snapshot
--     it on the save row; a drop is `current price < saved_price`, and sold/rented
--     is read live from the listing. Existing saves are backfilled to the current
--     price so they never show a false drop.
-- ============================================================================

create table if not exists public.save_collections (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists save_collections_profile_idx on public.save_collections (profile_id, created_at);
-- Two collections with the same name would be indistinguishable in the chip row.
create unique index if not exists save_collections_name_uniq on public.save_collections (profile_id, lower(name));

alter table public.saves
  add column if not exists collection_id      uuid references public.save_collections(id) on delete set null,
  add column if not exists saved_price_paise  bigint;

create index if not exists saves_collection_idx on public.saves (collection_id) where collection_id is not null;

-- Backfill the snapshot for saves made before this migration: seed to the
-- listing's current price so nothing reads as a "drop" retroactively.
update public.saves s
   set saved_price_paise = l.price_paise
  from public.listings l
 where s.listing_id = l.id
   and s.saved_price_paise is null;

alter table public.save_collections enable row level security;
