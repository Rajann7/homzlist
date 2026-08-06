-- ============================================================================
-- HomzList — Migration 0128: profiles carry their state
--
-- The last piece of the city-empty widening (0126 requirements, 0127 feed
-- counts). When a viewer's city has no inventory the rails widen to the state,
-- but "Top Builders" / "Top Brokers" could not follow: `searchBrokers` filters
-- on `profiles.city_id` and profiles had no state at all, so a widened request
-- had to drop the location filter entirely and rank over every seller in the
-- country while the cards beside them were state-scoped.
--
-- Same shape as `requirements.state_id` (0126): derived in the DATABASE by
-- trigger, never written by the app — the city can be set from registration,
-- the profile editor, the feed's city chip and the admin panel, and a trigger
-- is the only place none of them can forget.
-- ============================================================================

alter table public.profiles
  add column if not exists state_id uuid references public.locations(id);

comment on column public.profiles.state_id is
  'State the profile''s city sits in. Derived from city_id by trigger — never written by the app. Lets seller search and the feed''s people rails follow the same city -> state widening as the cards.';

create or replace function public.hz_profiles_set_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.city_id is null then
    new.state_id := null;
  elsif tg_op = 'INSERT' or new.city_id is distinct from old.city_id or new.state_id is null then
    -- Shared with requirements (0126): climb locations to the state.
    new.state_id := public.hz_state_of_location(new.city_id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_state on public.profiles;
create trigger profiles_set_state
  before insert or update of city_id on public.profiles
  for each row execute function public.hz_profiles_set_state();

update public.profiles
   set state_id = public.hz_state_of_location(city_id)
 where city_id is not null
   and state_id is distinct from public.hz_state_of_location(city_id);

-- Seller search scans by (state, role, active) in the widened case.
create index if not exists profiles_state_role_idx
  on public.profiles (state_id, role)
  where state = 'active';
