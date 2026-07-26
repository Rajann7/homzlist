-- ============================================================================
-- HomzList — Migration 0039: search's boost-first ordering must respect targeting
--   Doc2 §13 (boost targeting) · Doc2 §12 (search) · Module 9
--
-- Migration 0032 gave search its boost-first ORDER BY, but the join predicate was
-- only `status = 'active'` and the current window. So every live boost topped
-- every viewer's results regardless of what the buyer targeted:
--
--   · a "this area only — Mavdi" boost (the cheapest reach) sat at the top of a
--     Raiya Road area page and of every other city's results;
--   · while an "All India" boost got nothing extra for the same money, because
--     the surrounding filters are city/area scoped anyway.
--
-- The targeting ids now exist on `boosts` (migration 0038), so the match belongs
-- in the same join that does the ordering — a service-layer re-sort could not fix
-- it, since the RPC also paginates.
--
-- Additive: the three new params default to NULL, which reproduces the old
-- "everything matches" behaviour for any caller that hasn't been updated.
-- ============================================================================

-- Adding parameters makes a NEW overload rather than replacing the old one, and
-- two candidates with all-default tails are ambiguous to resolve ("function name
-- is not unique"). Drop the 0032 signature explicitly first.
drop function if exists public.hz_search_listings(
  text, text, text[], uuid[], uuid, bigint, bigint, text[], jsonb, jsonb, jsonb,
  boolean, boolean, boolean, uuid, text, integer, integer
);

create or replace function public.hz_search_listings(
  p_q                text    default null,
  p_intent           text    default null,
  p_types            text[]  default null,
  p_area_ids         uuid[]  default null,
  p_city_id          uuid    default null,
  p_budget_min_paise bigint  default null,
  p_budget_max_paise bigint  default null,
  p_amenities        text[]  default null,
  p_attrs            jsonb   default '{}'::jsonb,
  p_attr_ranges      jsonb   default '{}'::jsonb,
  p_attr_flags       jsonb   default '{}'::jsonb,
  p_negotiable       boolean default false,
  p_ready            boolean default false,
  p_verified_only    boolean default false,
  p_exclude_profile  uuid    default null,
  p_sort             text    default 'latest',
  p_limit            integer default 10,
  p_offset           integer default 0,
  -- Module 9: the viewer's location, so a boost only ranks first for the people
  -- it was actually bought for.
  p_viewer_city_id   uuid    default null,
  p_viewer_state_id  uuid    default null,
  -- Areas the SURFACE is scoped to (an area landing page, an area filter). When
  -- present, an `area`-targeted boost must name one of them.
  p_scope_area_ids   uuid[]  default null
)
returns table (id uuid, total_count bigint)
language sql
stable
-- SECURITY INVOKER (the default) is deliberate: this is called with the service
-- role from the server API, which already did authorization. It must NOT be a
-- definer-escalated path that a browser role could reach.
as $$
  with matched as (
    select
      l.id,
      l.price_paise,
      l.live_at,
      l.created_at,
      b.starts_at as boost_started
    from public.listings l
    left join public.boosts b
      on b.listing_id = l.id
     and b.subject_kind = 'listing'
     and b.status = 'active'
     and b.starts_at <= now()
     and (b.ends_at is null or b.ends_at > now())
     -- ---- targeting (Doc2 §13) --------------------------------------------
     -- A viewer with no known location at all sees the national result set, so
     -- every boost applies to them (the same rule as lib/billing/placement.ts;
     -- refusing them all would mean boosts don't exist for guest traffic).
     and (
       b.targeting = 'india'
       or (p_viewer_city_id is null and p_viewer_state_id is null
           and (p_scope_area_ids is null or cardinality(p_scope_area_ids) = 0))
       or (b.targeting = 'state' and p_viewer_state_id is not null
           and b.target_state_id = p_viewer_state_id)
       or (b.targeting = 'city'  and p_viewer_city_id is not null
           and b.target_city_id = p_viewer_city_id)
       or (b.targeting = 'area'  and (
             case
               when p_scope_area_ids is not null and cardinality(p_scope_area_ids) > 0
                 then b.target_area_id = any(p_scope_area_ids)
               else p_viewer_city_id is not null and b.target_city_id = p_viewer_city_id
             end))
     )
    where l.status = 'live'
      and l.availability = 'available'
      -- Free text: title, area label and society name. ILIKE over the trigram
      -- indexes; Unicode-safe (no language config), so Gujarati/Hindi input
      -- matches the same way English does (Doc7 §108).
      and (
        p_q is null or p_q = '' or
        l.title      ilike '%' || p_q || '%' or
        l.area_label ilike '%' || p_q || '%' or
        l.attributes->>'society_name' ilike '%' || p_q || '%'
      )
      and (p_intent   is null or l.kind::text = p_intent)
      and (p_types    is null or cardinality(p_types) = 0 or l.type_code = any(p_types))
      and (p_area_ids is null or cardinality(p_area_ids) = 0 or l.area_id = any(p_area_ids))
      and (p_city_id  is null or l.city_id = p_city_id)
      -- "Price on request" listings have no figure, so a budget filter must
      -- exclude them rather than silently treat them as free.
      and (p_budget_min_paise is null or (l.price_paise is not null and l.price_paise >= p_budget_min_paise))
      and (p_budget_max_paise is null or (l.price_paise is not null and l.price_paise <= p_budget_max_paise))
      -- ALL selected amenities must be present (@> = array contains).
      and (p_amenities is null or cardinality(p_amenities) = 0 or l.amenities @> p_amenities)
      and (not p_negotiable or l.is_negotiable)
      -- "Ready to move" is the possession attribute, not a separate column.
      and (not p_ready or l.attributes->>'possession' in ('ready','immediate')
                       or l.attributes->>'construction_status' = 'resale')
      and (not p_verified_only or exists (
            select 1 from public.verifications v
            where v.profile_id = l.profile_id and v.status = 'approved'
              and v.level in ('id','rera')
          ))
      and (p_exclude_profile is null or l.profile_id <> p_exclude_profile)
      -- Attribute equality facets: OR inside a key, AND across keys.
      and (
        select bool_and(
          exists (
            select 1
            from jsonb_array_elements_text(kv.value) as want(v)
            where l.attributes->>kv.key = want.v
          )
        )
        from jsonb_each(coalesce(p_attrs, '{}'::jsonb)) as kv
      ) is not false
      -- Numeric bucket facets. The regexp guard makes a non-numeric attribute
      -- (bad data) fail the filter instead of raising and killing the query.
      and (
        select bool_and(
          exists (
            select 1
            from jsonb_array_elements(kv.value) as rng
            where l.attributes->>kv.key ~ '^[0-9]+(\.[0-9]+)?$'
              and (rng->>'min' is null or (l.attributes->>kv.key)::numeric >= (rng->>'min')::numeric)
              and (rng->>'max' is null or (l.attributes->>kv.key)::numeric <= (rng->>'max')::numeric)
          )
        )
        from jsonb_each(coalesce(p_attr_ranges, '{}'::jsonb)) as kv
      ) is not false
      -- Boolean attribute toggles (corner plot, veg meals).
      and (
        select bool_and(l.attributes->>kv.key in ('true','yes','1'))
        from jsonb_each(coalesce(p_attr_flags, '{}'::jsonb)) as kv
      ) is not false
  )
  select
    m.id,
    count(*) over () as total_count
  from matched m
  order by
    -- Boosted first, FIFO by boost start (Doc2 §13 search top placement).
    (m.boost_started is null),
    m.boost_started asc nulls last,
    case when p_sort = 'price_asc'  then m.price_paise end asc  nulls last,
    case when p_sort = 'price_desc' then m.price_paise end desc nulls last,
    -- 'latest' and 'nearby' both fall back to recency here; 'nearby' is
    -- expressed by the CASCADE (exact area → adjacent → city), which the
    -- service layer drives by calling this function once per tier.
    coalesce(m.live_at, m.created_at) desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

comment on function public.hz_search_listings is
  'Module 8 search + Module 9 boost targeting: one pass returning ordered ids and the exact total. Boosted listings rank first only for viewers their targeting covers.';

-- ============================================================================
-- End 0039_search_boost_targeting.sql
-- ============================================================================
