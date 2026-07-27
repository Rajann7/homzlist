-- ============================================================================
-- HomzList — Migration 0058: area filters actually match
--
-- An `area` field is stored as {"value": 1200, "unit": "sqft"} — that is what
-- the form submits and what the unit converter needs. The search RPC read it
-- with `attributes->>key`, which yields the JSON TEXT of that object, and then
-- guarded on a numeric regexp — so the guard failed and the row was excluded.
--
-- The effect: Carpet area and Plot size in the filter sheet silently matched
-- nothing that the real creation form had ever produced. (Older seeded rows
-- stored a bare number and did match, which is why it looked like it worked.)
--
-- `hz_attr_sqft` reads both shapes and converts to sq ft using the same factors
-- as lib/listings/validate.ts, so a plot entered as "3 Vigha" is comparable
-- with one entered as "52,272 sqft". Migration 0057 adds Built-up area and
-- Plot area facets on top of this; without it they would have been dead too.
-- ============================================================================

create or replace function public.hz_attr_sqft(attrs jsonb, key text)
returns numeric
language sql
immutable
as $fn$
  select case
    -- {value, unit} — what the form writes.
    when jsonb_typeof(attrs->key) = 'object' then
      case
        when (attrs->key->>'value') ~ '^[0-9]+(\.[0-9]+)?$' then
          (attrs->key->>'value')::numeric * case coalesce(attrs->key->>'unit', 'sqft')
            when 'sqft'    then 1
            when 'sqyd'    then 9
            when 'sqm'     then 10.7639
            when 'guntha'  then 1089
            when 'vigha'   then 17424
            when 'acre'    then 43560
            when 'hectare' then 107639
            else 1
          end
        else null
      end
    -- A bare number: older rows, and every non-area numeric facet
    -- (floor, road width, frontage, car parking).
    when (attrs->>key) ~ '^[0-9]+(\.[0-9]+)?$' then (attrs->>key)::numeric
    else null
  end;
$fn$;

comment on function public.hz_attr_sqft(jsonb, text) is
  'Numeric value of an attribute, converting an {value,unit} area to sq ft. Null when the attribute is absent or non-numeric.';

CREATE OR REPLACE FUNCTION public.hz_search_listings(p_q text DEFAULT NULL::text, p_intent text DEFAULT NULL::text, p_types text[] DEFAULT NULL::text[], p_area_ids uuid[] DEFAULT NULL::uuid[], p_city_id uuid DEFAULT NULL::uuid, p_budget_min_paise bigint DEFAULT NULL::bigint, p_budget_max_paise bigint DEFAULT NULL::bigint, p_amenities text[] DEFAULT NULL::text[], p_attrs jsonb DEFAULT '{}'::jsonb, p_attr_ranges jsonb DEFAULT '{}'::jsonb, p_attr_flags jsonb DEFAULT '{}'::jsonb, p_negotiable boolean DEFAULT false, p_ready boolean DEFAULT false, p_verified_only boolean DEFAULT false, p_exclude_profile uuid DEFAULT NULL::uuid, p_sort text DEFAULT 'latest'::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_viewer_city_id uuid DEFAULT NULL::uuid, p_viewer_state_id uuid DEFAULT NULL::uuid, p_scope_area_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, total_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
      -- Numeric bucket facets.
      --
      -- `hz_attr_sqft` is what makes an AREA facet work: the form stores an
      -- area as {value, unit}, so `attributes->>key` was the JSON text of that
      -- object, the numeric guard below rejected it, and every listing the real
      -- form had ever created was invisible to the Carpet-area and Plot-size
      -- filters. Scalar facets (floor, road width) are unaffected — the helper
      -- returns a bare number unchanged.
      and (
        select bool_and(
          exists (
            select 1
            from jsonb_array_elements(kv.value) as rng
            where public.hz_attr_sqft(l.attributes, kv.key) is not null
              and (rng->>'min' is null or public.hz_attr_sqft(l.attributes, kv.key) >= (rng->>'min')::numeric)
              and (rng->>'max' is null or public.hz_attr_sqft(l.attributes, kv.key) <= (rng->>'max')::numeric)
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
$function$
;
