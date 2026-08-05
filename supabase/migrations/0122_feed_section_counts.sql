-- The carousel home feed (P2, 5 Aug 2026 — Rajan) needs to know, BEFORE it
-- renders anything, how many live rows exist per property type and per project
-- type in the viewer's city. That number decides two things at once:
--
--   • whether a rail exists at all — a type with 0 live rows must render
--     NOTHING (no heading, no empty state, no gap), and
--   • the rail's subtitle ("12 available in Rajkot"), which is a real count,
--     never a hardcoded one (CLAUDE.md rule 12).
--
-- Doing that from the app meant one count query per type — 13 property types +
-- 8 project types = 21 round trips on every feed load, and it would grow every
-- time master data gains a row. This is the same answer in one round trip.
--
-- The scoping rules are the FEED's rules, restated here so the counts can never
-- disagree with what the rails then fetch (lib/feed/service.ts getFeed):
--   listings → status live + availability available, city-scoped, never the
--              viewer's own, Buy/Rent filter applied;
--   projects → status live, city-scoped, never the viewer's own, and only in
--              the unfiltered feed (a Buy/Rent chip hides projects entirely).
--
-- `p_filter` is 'all' | 'buy' | 'rent' — the same three values the feed API
-- accepts. Anything else is treated as 'all' by the CASE below rather than
-- returning a silently empty set.

create or replace function public.hz_feed_type_counts(
  p_city uuid default null,
  p_viewer uuid default null,
  p_filter text default 'all'
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
     and (p_city is null or l.city_id = p_city)
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
     and (p_city is null or p.city_id = p_city)
     and (p_viewer is null or p.profile_id <> p_viewer)
     -- Projects never appear under a Buy/Rent chip — same rule as getFeed.
     and coalesce(p_filter, 'all') not in ('buy', 'rent')
   group by p.project_type;
$$;

-- Server-only: the feed calls this with the service client. No anon/authenticated
-- grant — a browser has no business asking the database for inventory counts.
revoke all on function public.hz_feed_type_counts(uuid, uuid, text) from public;
grant execute on function public.hz_feed_type_counts(uuid, uuid, text) to service_role;

comment on function public.hz_feed_type_counts(uuid, uuid, text) is
  'Per-type live counts for the P2 carousel feed: which rails exist and what their subtitle says. Mirrors getFeed scoping exactly.';

-- The counts scan by (status, city, type). These are the indexes that keeps the
-- aggregate cheap as inventory grows; both are partial, so they stay small.
create index if not exists listings_live_city_type_idx
  on public.listings (city_id, type_code, kind)
  where status = 'live' and availability = 'available';

create index if not exists projects_live_city_type_idx
  on public.projects (city_id, project_type)
  where status = 'live';
