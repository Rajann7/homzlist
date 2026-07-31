-- Admin exports need somewhere to live, and it must not be either existing
-- bucket.
--
-- `listing-photos` is PUBLIC — an export of user phone numbers behind a
-- permanent public URL is a data leak. `private-docs` is private but its mime
-- allowlist is deliberately tight (images + pdf) because it holds user-uploaded
-- ownership proofs and ID scans; widening it to accept spreadsheets to make an
-- admin feature work would loosen a guard on a completely unrelated upload path.
--
-- So: a third bucket, private, that accepts exactly the two formats the design's
-- export modal offers. 50 MB covers the engine's 50,000-row cap.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-exports', 'admin-exports', false,
  52428800,
  array[
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are created on purpose: nothing but the service-role
-- client may touch this bucket, and the only code holding that key is the admin
-- API, after requireAdmin(). Downloads go through a short-lived signed URL.
