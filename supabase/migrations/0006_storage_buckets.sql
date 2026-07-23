-- ============================================================================
-- HomzList — Migration 0006: Supabase Storage buckets (interim media store)
--
-- Media lives in Supabase Storage until Cloudflare R2 credentials exist; the
-- storage layer (lib/storage.ts) then switches driver by config alone and the
-- objects are migrated across (docs/PENDING-INTEGRATIONS.md).
--
-- Two buckets, deliberately different:
--   listing-photos : PUBLIC read. Listing imagery is public content once a
--                    listing is live, and it needs to be CDN-cacheable.
--   private-docs   : PRIVATE. Ownership proofs, RERA docs, ID scans. Readable
--                    ONLY through short-lived signed URLs (Doc2 §5.1, Doc9 §17).
--
-- Uploads never go direct-from-browser-with-a-user-token: the server mints a
-- signed upload URL per file, so the browser is authorised for exactly one
-- server-chosen key and nothing else (Doc9 §9).
-- ============================================================================

-- ---- buckets ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos', 'listing-photos', true,
  26214400,  -- 25MB/file (Doc2 §5.2)
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-docs', 'private-docs', false,
  10485760,  -- 10MB (ownership proofs / brochures)
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---- RLS on storage.objects ------------------------------------------------
-- Supabase enables RLS on storage.objects by default. We add NO policies for
-- anon/authenticated, which means browser clients cannot list, write or delete
-- objects directly with their session token. The only write path is a
-- server-minted signed upload URL, and the only private-read path is a
-- server-minted signed download URL — both issued by our API after it has
-- checked ownership. service_role bypasses RLS and is server-only (Doc9 §4).
--
-- Public READ of listing-photos is granted by the bucket's `public = true`
-- flag (served by the storage CDN), not by a policy on storage.objects.

-- Drop any permissive policies a previous setup may have left behind, so the
-- deny-all posture can't be silently weakened.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'homzlist_%'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;
