-- ============================================================================
-- Claiming a review lock, atomically.
--
-- The design shows "Priya Shah is reviewing this listing (started 3 min ago)"
-- with the row greyed out and a "Skip to next" — which only means anything if
-- two admins opening the same listing at the same instant cannot both be told
-- they hold it. Read-then-write from the app cannot promise that; a single
-- statement can.
--
-- INSERT … ON CONFLICT DO UPDATE … WHERE takes the lock only when it is free
-- (expired) or already mine. When the WHERE fails, no row comes back, and the
-- caller reads the existing holder instead — which is exactly the design's
-- locked state, arrived at without a race.
--
-- Locks are short (10 minutes, the table's own default) and heartbeated by the
-- open review screen, so a closed tab or a crashed browser frees the item
-- rather than parking it forever. That matters more than it sounds: an
-- unreleasable lock on a queue item is a listing nobody can ever approve.
-- ============================================================================

create or replace function public.hz_claim_review_lock(
  p_subject_type text,
  p_subject_id   uuid,
  p_staff_id     uuid,
  p_ttl_seconds  int default 600
)
returns table (locked_by uuid, locked_at timestamptz, expires_at timestamptz, is_mine boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_row review_locks%rowtype;
begin
  insert into review_locks (subject_type, subject_id, locked_by, locked_at, expires_at)
  values (p_subject_type, p_subject_id, p_staff_id, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (subject_type, subject_id) do update
     set locked_by  = excluded.locked_by,
         locked_at  = case when review_locks.locked_by = excluded.locked_by
                           then review_locks.locked_at   -- keep "started N min ago" honest
                           else excluded.locked_at end,
         expires_at = excluded.expires_at
   where review_locks.expires_at <= now()
      or review_locks.locked_by = excluded.locked_by
  returning * into v_row;

  if found then
    return query select v_row.locked_by, v_row.locked_at, v_row.expires_at, true;
    return;
  end if;

  -- Someone else holds it: report who, so the screen can name them.
  return query
    select rl.locked_by, rl.locked_at, rl.expires_at, false
      from review_locks rl
     where rl.subject_type = p_subject_type and rl.subject_id = p_subject_id;
end;
$$;

revoke all on function public.hz_claim_review_lock(text, uuid, uuid, int)
  from public, anon, authenticated;

-- Releasing is only ever allowed for the holder — an admin cannot free someone
-- else's item just because they can name it.
create or replace function public.hz_release_review_lock(
  p_subject_type text,
  p_subject_id   uuid,
  p_staff_id     uuid
)
returns boolean
language sql security definer set search_path = public as $$
  with gone as (
    delete from review_locks
     where subject_type = p_subject_type
       and subject_id = p_subject_id
       and locked_by = p_staff_id
    returning 1
  )
  select exists (select 1 from gone);
$$;

revoke all on function public.hz_release_review_lock(text, uuid, uuid)
  from public, anon, authenticated;

create index if not exists review_locks_expiry_idx on public.review_locks (expires_at);
