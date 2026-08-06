-- ============================================================================
-- HomzList — Migration 0126: requirements carry their state
--
-- `requirements` stored only `city_id`, so "the viewer's city has no live
-- requirements — widen to the rest of the state" was not expressible as a
-- query: the only route was city_id IN (every city of that state), and the
-- India master holds 104k cities. `listings` and `projects` have carried
-- `state_id` since 0005/0056 for exactly this reason; requirements were the
-- odd one out.
--
-- Derived in the DATABASE, not in the create path. Two code paths write a
-- requirement's city (create + edit) and a third (admin master-data re-parent)
-- can move the city itself; a trigger means none of them can forget.
-- ============================================================================

alter table public.requirements
  add column if not exists state_id uuid references public.locations(id);

comment on column public.requirements.state_id is
  'State the requirement''s city sits in. Derived from city_id by trigger — never written by the app. Powers the city-empty → same-state browse fallback.';

-- Climb locations (state → district → taluka → city → area) from a city to its
-- state. STABLE so the trigger and the backfill both plan well.
create or replace function public.hz_state_of_location(p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cur uuid := p_id;
  lvl text;
  par uuid;
begin
  if cur is null then return null; end if;
  for i in 1..6 loop
    select level, parent_id into lvl, par from public.locations where id = cur;
    if lvl is null then return null; end if;
    if lvl = 'state' then return cur; end if;
    if par is null then return null; end if;
    cur := par;
  end loop;
  return null;
end;
$$;

create or replace function public.hz_requirements_set_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.city_id is null then
    new.state_id := null;
  elsif tg_op = 'INSERT' or new.city_id is distinct from old.city_id or new.state_id is null then
    new.state_id := public.hz_state_of_location(new.city_id);
  end if;
  return new;
end;
$$;

drop trigger if exists requirements_set_state on public.requirements;
create trigger requirements_set_state
  before insert or update of city_id on public.requirements
  for each row execute function public.hz_requirements_set_state();

-- Backfill every existing row (including non-live ones — an expired
-- requirement that gets reopened must already carry its state).
update public.requirements
   set state_id = public.hz_state_of_location(city_id)
 where city_id is not null
   and state_id is distinct from public.hz_state_of_location(city_id);

-- The state fallback query: live + active, scoped by state, newest first.
create index if not exists requirements_live_state_idx
  on public.requirements (status, is_active, state_id, created_at desc)
  where status = 'live';

-- The all-India fallback (nobody has picked a city) has no location predicate
-- at all, so it needs its own index.
create index if not exists requirements_live_recent_idx
  on public.requirements (status, is_active, created_at desc)
  where status = 'live';
