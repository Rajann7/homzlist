-- ============================================================================
-- HomzList — Migration 0056: projects get the full location chain
--
-- A project carried only state_id / city_id / area_id, because the form only
-- ever offered an AREA picker scoped to whatever city was on the builder's
-- profile. With the real India Post master seeded (migration 0054) the builder
-- picks state → district → taluka → city → area like everyone else, and the
-- middle of that chain needs somewhere to live — otherwise a district or taluka
-- page can list properties but never the projects inside it.
--
-- Nullable because existing rows predate the chain; the create path fills all
-- five from now on, and `resolveLocationChain` can rebuild the rest by walking
-- `parent_id` upward for the old ones.
-- ============================================================================

alter table public.projects
  add column if not exists district_id uuid references public.locations(id),
  add column if not exists taluka_id   uuid references public.locations(id);

create index if not exists projects_district_idx on public.projects (district_id) where status = 'live';
create index if not exists projects_taluka_idx   on public.projects (taluka_id)   where status = 'live';

-- Backfill from what is already known: walk up from the city.
update public.projects p
   set taluka_id   = t.id,
       district_id = d.id
  from public.locations c
  join public.locations t on t.id = c.parent_id and t.level = 'taluka'
  join public.locations d on d.id = t.parent_id and d.level = 'district'
 where p.city_id = c.id
   and c.level = 'city'
   and (p.taluka_id is null or p.district_id is null);
