-- ============================================================================
-- HomzList — Migration 0059: repair hz_attr_sqft's numeric guard
--
-- 0058 shipped the guard as '^[0-9]+(.[0-9]+)?$'. The dot is UNESCAPED, so it
-- matches any character: "12x34" passed the guard and then hit ::numeric, which
-- raises 22P02. That function runs inside `hz_search_listings` for every
-- numeric-bucket facet, and the filter is one correlated statement over all
-- live rows — so a SINGLE listing carrying a malformed area value would make
-- the whole filtered search fail for every buyer using a Carpet/Built-up/Plot
-- area filter, until someone found the row. A stored denial of service.
--
-- 0058 is corrected at source for anywhere that hasn't run it yet; this exists
-- so an environment that already applied the broken version heals on the next
-- `migrate` instead of needing a manual fix.
--
-- The server also validates area values before storing them now
-- (lib/listings/validate.ts) — this regex must not be the only thing standing
-- between a hand-made payload and a cast error.
-- ============================================================================

create or replace function public.hz_attr_sqft(attrs jsonb, key text)
returns numeric
language sql
immutable
as $fn$
  select case
    -- {value, unit} — what the creation form writes.
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
