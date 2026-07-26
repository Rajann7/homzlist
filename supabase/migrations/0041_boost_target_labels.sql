-- ============================================================================
-- HomzList — Migration 0041: repair boost target labels
--   Doc2 §13 · Module 9
--
-- Before Module 9, `boosts.target_label` was whatever the CLIENT posted at
-- checkout. Two consequences are visible in the dev data:
--
--   · placeholder labels — "This area", "City", "State" — where the P11 boost
--     card is supposed to read "Mavdi, Rajkot" / "Rajkot" / "Gujarat";
--   · flatly WRONG labels — a boost on a Vadodara listing whose label says
--     "Rajkot", because the string travelled from the browser and nothing ever
--     compared it to the listing's own location.
--
-- Checkout now composes the label server-side from the locations table, so new
-- rows are correct by construction. This backfills the existing ones from the
-- resolved ids that migration 0038 wrote, so what the seller reads on the boost
-- card is the place their boost is actually being shown in.
-- ============================================================================

update public.boosts b
   set target_label = coalesce(
     case b.targeting
       when 'india' then 'All India'
       when 'state' then (select name from public.locations where id = b.target_state_id)
       when 'city'  then (select name from public.locations where id = b.target_city_id)
       else nullif(
              concat_ws(', ',
                (select name from public.locations where id = b.target_area_id),
                (select name from public.locations where id = b.target_city_id)
              ), '')
     end,
     b.target_label            -- never blank a label we cannot improve on
   )
 where b.targeting is not null;

-- ============================================================================
-- End 0041_boost_target_labels.sql
-- ============================================================================
