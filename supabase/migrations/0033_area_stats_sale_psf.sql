-- ============================================================================
-- HomzList — Migration 0033: per-sqft is a SALE metric
--
-- `hz_area_stats` (0032) averaged price-per-sqft over EVERY live listing in an
-- area, sale and rent together. Dividing a ₹28,000 monthly rent by 1,500 sqft
-- gives ₹19, so a single rented flat dragged an area's "Avg ₹5,600/sqft" down
-- by hundreds — and the Areas tab, the autocomplete meta line and the area
-- page's stats strip all read from this function.
--
-- Fix: when the caller does not name an intent, the per-sqft average is
-- computed over SALE listings only (which is what "avg per sqft" means to
-- anyone comparing localities). An explicit `p_intent` still scopes it exactly
-- as asked, so a rent-scoped page can still get a rent-per-sqft if it wants one.
-- Counts and the min/max envelope are unchanged.
-- ============================================================================

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
    -- Per-sqft: sale-only unless the caller explicitly asked for an intent.
    -- Rows without both a price AND an area are excluded so a listing missing
    -- either number cannot pull the average toward zero.
    (select round(avg((l.price_paise / 100.0) / nullif(l.area_sqft,0)))
       from public.listings l
      where l.status='live' and l.availability='available' and l.area_id = p_area_id
        and l.price_paise is not null and coalesce(l.area_sqft,0) > 0
        and l.kind::text = coalesce(p_intent, 'sell')
        and (p_type is null or l.type_code = p_type)),
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
