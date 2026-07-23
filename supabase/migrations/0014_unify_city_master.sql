-- ============================================================================
-- HomzList — Migration 0014: one city master, not two
--
-- Module 2 shipped a flat `cities` table (profiles.city_id → cities.id).
-- Module 4 shipped the real hierarchy in `locations`
-- (state → district → taluka → city → area), which listings, requirements and
-- projects all reference. Both contain "Rajkot", with DIFFERENT ids.
--
-- Consequence, verified in dev before this migration: 26 of 28 profiles had a
-- city_id that matched no `locations` row at all. So "properties from your
-- city", requirement→listing matching (Module 5) and every city-scoped query
-- could never line up — a profile's city and a listing's city were values from
-- two unrelated namespaces.
--
-- `locations` wins: it is the richer model and the one the domain tables use.
-- This migration lifts every `cities` row into the hierarchy (creating the
-- state/district/taluka spine each needs), remaps `profiles.city_id` by name,
-- and repoints the foreign key. `cities` is left in place but emptied of
-- authority — dropping it is a separate, reversible step once the admin
-- master-data screen (Module 11) can manage locations.
-- ============================================================================

-- ---- 1. Make sure every city in `cities` exists in `locations` -------------
-- Each needs a state, and (to keep the cascade well-formed) a district and
-- taluka of the same name, which is how the Rajkot spine was already seeded.
do $$
declare
  c            record;
  v_state_id   uuid;
  v_district_id uuid;
  v_taluka_id  uuid;
  v_city_id    uuid;
begin
  for c in select name, state from public.cities where coalesce(is_active, true) loop
    -- state
    select id into v_state_id from public.locations
      where level = 'state' and lower(name) = lower(c.state) limit 1;
    if v_state_id is null then
      insert into public.locations (name, level, parent_id) values (c.state, 'state', null)
        returning id into v_state_id;
    end if;

    -- district (same name as the city — correct for these metros, and the admin
    -- master-data editor can refine it later)
    select id into v_district_id from public.locations
      where level = 'district' and parent_id = v_state_id and lower(name) = lower(c.name) limit 1;
    if v_district_id is null then
      insert into public.locations (name, level, parent_id) values (c.name, 'district', v_state_id)
        returning id into v_district_id;
    end if;

    -- taluka
    select id into v_taluka_id from public.locations
      where level = 'taluka' and parent_id = v_district_id and lower(name) = lower(c.name) limit 1;
    if v_taluka_id is null then
      insert into public.locations (name, level, parent_id) values (c.name, 'taluka', v_district_id)
        returning id into v_taluka_id;
    end if;

    -- city
    select id into v_city_id from public.locations
      where level = 'city' and parent_id = v_taluka_id and lower(name) = lower(c.name) limit 1;
    if v_city_id is null then
      insert into public.locations (name, level, parent_id) values (c.name, 'city', v_taluka_id);
    end if;
  end loop;
end $$;

-- ---- 2. Remap profiles.city_id: cities.id → locations.id (matched by name) --
alter table public.profiles drop constraint if exists profiles_city_id_fkey;

update public.profiles p
   set city_id = l.id
  from public.cities c
  join public.locations l
    on l.level = 'city' and lower(l.name) = lower(c.name)
 where p.city_id = c.id;

-- Anything still unresolved (a city that vanished from `cities`) is cleared
-- rather than left dangling — a null city is honest, a bad id is not.
update public.profiles p
   set city_id = null
 where p.city_id is not null
   and not exists (select 1 from public.locations l where l.id = p.city_id and l.level = 'city');

-- ---- 3. Point the FK at the real master ------------------------------------
alter table public.profiles
  add constraint profiles_city_id_fkey
  foreign key (city_id) references public.locations(id) on delete set null;

-- ---- 4. Mark the old table as non-authoritative -----------------------------
comment on table public.cities is
  'DEPRECATED (migration 0014). The city master is public.locations WHERE level = ''city''. Kept only so an old query fails loudly rather than reading stale rows; drop once Module 11 master-data lands.';
