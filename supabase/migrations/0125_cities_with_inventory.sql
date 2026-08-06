-- Auto-open cities by inventory (Rajan, Aug 2026): a city gets its browse pages
-- (hub / landing / area / search) once it carries >= N live, available listings,
-- not only when an admin flips is_launched. `browsable()` in lib/seo/slugs.ts is
-- the single gate, and it runs on EVERY root catch-all hit (misses included),
-- so it must not pull the whole listings table across the wire to tally in JS.
--
-- This is that tally done in the database: one indexed aggregate returning only
-- the qualifying city ids (a handful), instead of streaming 50k city_id rows.
-- Scoping mirrors the landing page's own predicate exactly (status live +
-- availability available), so a city can never "open" on inventory the page
-- would not actually show.

create or replace function public.hz_cities_with_inventory(p_min int default 3)
returns table (city_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select l.city_id
    from public.listings l
   where l.status = 'live'
     and l.availability = 'available'
     and l.city_id is not null
   group by l.city_id
  having count(*) >= greatest(coalesce(p_min, 3), 1);
$$;

-- Server-only: the SEO gate calls this with the service client. A browser has no
-- business enumerating which cities cross the launch floor.
revoke all on function public.hz_cities_with_inventory(int) from public;
grant execute on function public.hz_cities_with_inventory(int) to service_role;

comment on function public.hz_cities_with_inventory(int) is
  'City ids with >= p_min live+available listings — the inventory half of browsable() (lib/seo/slugs.ts). Mirrors the landing page predicate.';

-- The group-by scans (city_id) over the live+available partition. The existing
-- partial index listings_live_city_type_idx (city_id, type_code, kind) leads on
-- city_id, so the aggregate is index-only-ish; no new index needed.
