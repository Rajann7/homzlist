-- ============================================================================
-- HomzList — Migration 0032: the search query itself (Module 8)
--
-- Doc3 §5: "DB indexed search at launch; Meilisearch = Phase 2." This is that
-- indexed search, as ONE Postgres function rather than a stack of PostgREST
-- calls, for three reasons the app genuinely needs:
--
--   1. EXACT COUNTS. The design shows "142 properties" on the results screen
--      and a live "Show 142 properties" button in the filter sheet. Both must
--      be the true count of the same predicate, not an estimate and not the
--      length of the page — so the count and the page come out of one query.
--   2. TYPED ATTRIBUTE FILTERS. Per-type facets live in `attributes` jsonb as
--      TEXT. "Road width 30 ft" means 25-35, which needs a numeric cast;
--      comparing the text lexicographically (what a PostgREST range filter
--      would do) makes '9' > '40'. Casting belongs in SQL.
--   3. BOOST-FIRST ORDERING. Search top placement is a paid product (Doc2 §13),
--      so the boost join has to be part of the ordering, not a client re-sort.
--
-- Also fixes a data bug this module surfaced: `field_definitions.furnishing`
-- offers the value 'full', but Module 4 wrote 'furnished' on 4 live listings.
-- The "Fully furnished" filter chip could therefore never match anything.
-- ============================================================================

-- ---- 0. Normalise the drifted furnishing value ------------------------------
update public.listings
   set attributes = jsonb_set(attributes, '{furnishing}', '"full"')
 where attributes->>'furnishing' = 'furnished';

-- (`requirements` has no furnishing column — it carries only bhk/budget/type,
--  so there is no matching drift to correct on that side.)

-- ---- 1. The search function -------------------------------------------------
-- Returns one row per matching listing, already ordered and paginated, plus the
-- total count of the whole match set in `total_count` (a window function, so it
-- costs one pass and always agrees with the rows).
--
-- p_attrs        {"bhk":["2","3"],"furnishing":["semi"]}   → exact text match, OR within a key, AND across keys
-- p_attr_ranges  {"road_width":[{"min":25,"max":35}]}      → numeric range, OR within a key
-- p_attr_flags   {"corner_plot":true,"meals":true}         → truthy attribute
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
  p_offset           integer default 0
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
     and b.status = 'active'
     and b.starts_at <= now()
     and (b.ends_at is null or b.ends_at > now())
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
  'Module 8 search (Doc2 §12). Returns ordered, paginated listing ids plus the exact total match count. Service-role callers only — authorization happens in the API layer.';

-- ---- 2. Count-only helper for the filter sheet's live "Show N properties" ---
-- Same predicate, no page. Kept as a thin wrapper so the two numbers can never
-- drift apart from each other.
create or replace function public.hz_search_count(
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
  p_exclude_profile  uuid    default null
)
returns bigint
language sql
stable
as $$
  select coalesce(
    (select total_count from public.hz_search_listings(
       p_q, p_intent, p_types, p_area_ids, p_city_id,
       p_budget_min_paise, p_budget_max_paise, p_amenities,
       p_attrs, p_attr_ranges, p_attr_flags,
       p_negotiable, p_ready, p_verified_only, p_exclude_profile,
       'latest', 1, 0
     ) limit 1),
    0);
$$;

-- ---- 3. Area statistics (area page stats strip + Areas tab + autocomplete) --
-- Every number the area page shows is this one query: listing count, average
-- per-sqft, and the price range. Nothing is estimated in the renderer.
create or replace function public.hz_area_stats(p_area_id uuid, p_type text default null, p_intent text default null)
returns table (
  listing_count bigint,
  avg_per_sqft  numeric,
  min_price     bigint,
  max_price     bigint,
  project_count bigint
)
language sql
stable
as $$
  select
    (select count(*) from public.listings l
      where l.status='live' and l.availability='available' and l.area_id = p_area_id
        and (p_type   is null or l.type_code = p_type)
        and (p_intent is null or l.kind::text = p_intent)),
    -- Per-sqft only over rows that actually have both numbers; a listing with
    -- no area or no price must not drag the average toward zero.
    (select round(avg((l.price_paise / 100.0) / nullif(l.area_sqft,0)))
       from public.listings l
      where l.status='live' and l.availability='available' and l.area_id = p_area_id
        and l.price_paise is not null and coalesce(l.area_sqft,0) > 0
        and (p_type   is null or l.type_code = p_type)
        and (p_intent is null or l.kind::text = p_intent)),
    (select min(l.price_paise) from public.listings l
      where l.status='live' and l.availability='available' and l.area_id = p_area_id
        and l.price_paise is not null
        and (p_type   is null or l.type_code = p_type)
        and (p_intent is null or l.kind::text = p_intent)),
    (select max(l.price_paise) from public.listings l
      where l.status='live' and l.availability='available' and l.area_id = p_area_id
        and l.price_paise is not null
        and (p_type   is null or l.type_code = p_type)
        and (p_intent is null or l.kind::text = p_intent)),
    (select count(*) from public.projects p
      where p.status='live' and p.area_id = p_area_id);
$$;
