-- ============================================================================
-- HomzList — Migration 0007: record which bucket each object lives in.
--
-- Media currently sits in Supabase Storage and moves to Cloudflare R2 later.
-- Storing the bucket per row means the migration can find every object, and a
-- half-finished migration is still readable (rows resolve against whichever
-- bucket they actually live in).
-- ============================================================================

alter table public.listing_photos
  add column if not exists bucket text not null default 'listing-photos';

alter table public.listings
  add column if not exists ownership_proof_bucket text not null default 'private-docs';

alter table public.projects
  add column if not exists brochure_bucket text not null default 'private-docs';

-- Lets the R2 migration sweep find anything not yet moved.
create index if not exists photos_bucket_idx on public.listing_photos (bucket);
