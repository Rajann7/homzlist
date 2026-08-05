-- A live row without a `live_at` is unreachable.
--
-- The feed orders and PAGES on `live_at`. A listing that is live and available
-- but has `live_at = null` is counted by every count query, sorts by its
-- created_at (the code coalesces), lands somewhere in the middle of page 2 or
-- 3 — and is then dropped by the cursor, because `live_at < <ts>` is never true
-- for NULL. Three such rows existed; the Tenement and Shop rails each announced
-- one more listing than they could ever hand out, and nothing in the app could
-- reach those listings at all.
--
-- `live_at` means "the moment it entered the feed". For a row that IS in the
-- feed the value is not optional, so this backfills the ones that slipped
-- through and then stops it happening again.

-- 1. Backfill. created_at is the honest fallback: it is what the code was
--    already coalescing to when it sorted these rows.
update public.listings
   set live_at = created_at
 where status = 'live' and live_at is null;

update public.projects
   set live_at = created_at
 where status = 'live' and live_at is null;

-- 2. Keep it true. A trigger, not a CHECK constraint: publishing happens from
--    several paths (moderation approve, un-hide, un-archive, seeds) and the
--    invariant should be repaired at the write rather than rejected — a listing
--    that is otherwise fine must not fail to go live over a missing timestamp.
create or replace function public.hz_set_live_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'live' and new.live_at is null then
    new.live_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists listings_set_live_at on public.listings;
create trigger listings_set_live_at
  before insert or update on public.listings
  for each row execute function public.hz_set_live_at();

drop trigger if exists projects_set_live_at on public.projects;
create trigger projects_set_live_at
  before insert or update on public.projects
  for each row execute function public.hz_set_live_at();

comment on function public.hz_set_live_at() is
  'Guarantees the feed invariant: anything with status=live has a live_at, because the feed orders and paginates on it.';
