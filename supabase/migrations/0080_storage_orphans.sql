-- 0080 — objects that outlive their row.
--
-- Two places in lib/listings/photos.ts already promised "the 7-day orphan
-- sweep will catch it" when a storage delete threw. There was no sweep. And
-- the bigger leak had no comment at all: PURGING a listing or a project (the
-- "Delete now" button, or the 31st-day cron) deletes the row, the photo rows
-- cascade with it — and every object those rows pointed at stays in the bucket
-- forever, paying rent, with nothing left in the database that even knows the
-- key. A project's brochure leaked the same way, out of the PRIVATE bucket.
--
-- The fix is in two halves: purge now deletes the objects BEFORE it deletes
-- the rows (so the keys are still readable), and any delete that fails is
-- recorded here for the cron to retry.
--
-- Deliberately NOT a bucket scanner. A job that enumerates the bucket and
-- deletes whatever it cannot match to a row is one query bug away from wiping
-- live photos; this table only ever holds keys the app itself asked to delete
-- and failed to, so the retry can never touch an object nobody meant to lose.

create table if not exists public.storage_orphans (
  id          uuid primary key default gen_random_uuid(),
  storage_key text        not null,
  bucket      text        not null,
  -- Why it was being deleted, for the audit trail when a key looks wrong.
  reason      text        not null,
  attempts    integer     not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (storage_key, bucket)
);

comment on table public.storage_orphans is
  'Storage objects whose delete failed. Retried by lib/listings/lifecycle.sweepStorageOrphans; never populated by a bucket scan.';

-- The sweep takes the oldest first and skips ones that have already failed too
-- many times.
create index if not exists storage_orphans_retry_idx
  on public.storage_orphans (attempts, created_at);

-- Service-role only. No user, staff or anon role has any business reading a
-- list of storage keys, so this table gets RLS with NO policy at all: the
-- service key bypasses RLS, everything else is denied by default.
alter table public.storage_orphans enable row level security;
