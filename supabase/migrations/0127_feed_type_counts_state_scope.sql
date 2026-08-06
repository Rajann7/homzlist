-- ============================================================================
-- HomzList — Migration 0127: feed type counts can scope by STATE
--
-- `hz_feed_type_counts` (0122) decides which rails exist and what their
-- subtitle says. It only understood a city, which was fine while the only
-- viewers with a scope were signed-in users whose city we had opened.
--
-- Two things changed that:
--   • the guest city chip is now real (it reaches the server), so a visitor can
--     pick a city with no inventory at all;
--   • Doc4 §9's "new-city empty (+nearby auto)" widens such a request to the
--     rest of the state, the same way requirements do (0126).
--
-- The counts have to widen with it, or the rails would be built from a
-- city-scoped count of 0 and the feed would render nothing while the widened
-- item queries had plenty to show.
--
-- Contract: the caller passes EITHER p_city (normal) OR p_state (widened),
-- never both. `listings.state_id` / `projects.state_id` have existed since
-- 0005 / 0056, so this stays an indexed predicate.
-- ============================================================================

create or replace function public.hz_feed_type_counts(
  p_city uuid default null,
  p_viewer uuid default null,
  p_filter text default 'all',
  p_state uuid default null
)
returns table (scope text, code text, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  select 'property'::text as scope, l.type_code::text as code, count(*)::bigint as n
    from public.listings l
   where l.status = 'live'
     and l.availability = 'available'
     and l.type_code is not null
     and (
       case
         when p_city is not null then l.city_id = p_city
         when p_state is not null then l.state_id = p_state
         else true
       end
     )
     and (p_viewer is null or l.profile_id <> p_viewer)
     and (
       coalesce(p_filter, 'all') not in ('buy', 'rent')
       -- `kind` is an enum; the CASE yields text, so the comparison is cast.
       or l.kind::text = case when p_filter = 'buy' then 'sell' else 'rent' end
     )
   group by l.type_code

  union all

  select 'project'::text as scope, p.project_type::text as code, count(*)::bigint as n
    from public.projects p
   where p.status = 'live'
     and p.project_type is not null
     and (
       case
         when p_city is not null then p.city_id = p_city
         when p_state is not null then p.state_id = p_state
         else true
       end
     )
     and (p_viewer is null or p.profile_id <> p_viewer)
     -- Projects never appear under a Buy/Rent chip — same rule as getFeed.
     and coalesce(p_filter, 'all') not in ('buy', 'rent')
   group by p.project_type;
$$;

revoke all on function public.hz_feed_type_counts(uuid, uuid, text, uuid) from public;
grant execute on function public.hz_feed_type_counts(uuid, uuid, text, uuid) to service_role;

comment on function public.hz_feed_type_counts(uuid, uuid, text, uuid) is
  'Per-type live counts for the P2 carousel feed: which rails exist and what their subtitle says. Mirrors getFeed scoping exactly, including the city-empty -> state widening (Doc4 section 9).';

-- The 3-arg signature is what 0122 created; PostgreSQL keeps it as a separate
-- overload, so drop it or every call becomes ambiguous.
drop function if exists public.hz_feed_type_counts(uuid, uuid, text);

-- The widened aggregate scans by (state, type) — the city-scoped indexes from
-- 0122 do not cover it.
create index if not exists listings_live_state_type_idx
  on public.listings (state_id, type_code, kind)
  where status = 'live' and availability = 'available';

create index if not exists projects_live_state_type_idx
  on public.projects (state_id, project_type)
  where status = 'live';
