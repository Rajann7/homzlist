-- 0071 — the key-spec strip becomes a CANDIDATE list, and projects get one too.
--
-- The problem this fixes (Rajan, 29 Jul 2026): the strip was exactly four
-- fields per type, and `detailBlocks` drops any of them the seller left empty.
-- A Flat posted without `floor`, a shop without `frontage`, a plot with only
-- `land_area` therefore rendered a four-column grid with one, two or three
-- tiles filled and the rest blank — the screen looked broken on exactly the
-- listings that are thinnest.
--
-- The fix is in two halves:
--   • HERE — every type lists 8 candidates instead of 4, ordered by how much a
--     buyer of THAT type cares. Every key named below is already in that type's
--     own `fields` list, so this seeds a preference order, it does not invent a
--     field.
--   • lib/listings/dto.ts — takes the first FOUR candidates that actually have
--     a value, and the strip renders exactly as many columns as it got (the
--     component no longer hard-codes four).
--
-- Project types had no `key_specs` at all: the project screen derived its facts
-- strip (towers / floors / total units / available) in the COMPONENT, which is
-- the hardcoding CLAUDE.md rule 7 bans. Their strip is now the same DB-driven
-- list, with `source: 'column'` marking the four that live on `projects` rather
-- than in `attributes`.
--
-- Label contracts with the DTO (lib/listings/dto.ts detailBlocks):
--   "Bedrooms" → prints "3 BHK"        |  "Floor" → "9 / 12" with total_floors
--   any area object ({value,unit})     → printed as a sq-ft number
--   field `floors` on a project        → "G+14"

-- ---------------------------------------------------------------------------
-- Property types
-- ---------------------------------------------------------------------------
update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Baths','icon','bath'),
    jsonb_build_object('field','builtup_area','label','Built-up','icon','area'),
    jsonb_build_object('field','floor','label','Floor','icon','layers'),
    jsonb_build_object('field','carpet_area','label','Carpet','icon','area'),
    jsonb_build_object('field','balconies','label','Balconies','icon','grid'),
    jsonb_build_object('field','furnishing','label','Furnishing','icon','home'),
    jsonb_build_object('field','car_parking','label','Parking','icon','grid')
  )
) where code = 'flat';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Baths','icon','bath'),
    jsonb_build_object('field','builtup_area','label','Built-up','icon','area'),
    jsonb_build_object('field','floor_count','label','Floors','icon','layers'),
    jsonb_build_object('field','plot_area','label','Plot','icon','area'),
    jsonb_build_object('field','balconies','label','Balconies','icon','grid'),
    jsonb_build_object('field','furnishing','label','Furnishing','icon','home'),
    jsonb_build_object('field','car_parking','label','Parking','icon','grid')
  )
) where code in ('bungalow','tenement');

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Baths','icon','bath'),
    jsonb_build_object('field','construction_area','label','Built-up','icon','area'),
    jsonb_build_object('field','land_area','label','Land','icon','area'),
    jsonb_build_object('field','floor_count','label','Floors','icon','layers'),
    jsonb_build_object('field','furnishing','label','Furnishing','icon','home'),
    jsonb_build_object('field','car_parking','label','Parking','icon','grid'),
    jsonb_build_object('field','water','label','Water','icon','bulb')
  )
) where code = 'farmhouse';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Carpet','icon','area'),
    jsonb_build_object('field','cabins','label','Cabins','icon','grid'),
    jsonb_build_object('field','workstations','label','Seats','icon','users'),
    jsonb_build_object('field','floor','label','Floor','icon','layers'),
    jsonb_build_object('field','builtup_area','label','Built-up','icon','area'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','car_parking','label','Parking','icon','grid'),
    jsonb_build_object('field','ac','label','AC','icon','bulb')
  )
) where code = 'office';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Carpet','icon','area'),
    jsonb_build_object('field','frontage','label','Frontage ft','icon','grid'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','floor','label','Floor','icon','layers'),
    jsonb_build_object('field','builtup_area','label','Built-up','icon','area'),
    jsonb_build_object('field','height','label','Height ft','icon','stack'),
    jsonb_build_object('field','shutter_count','label','Shutters','icon','grid'),
    jsonb_build_object('field','car_parking','label','Parking','icon','grid')
  )
) where code = 'shop';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Carpet','icon','area'),
    jsonb_build_object('field','frontage','label','Frontage ft','icon','grid'),
    jsonb_build_object('field','height','label','Height ft','icon','stack'),
    jsonb_build_object('field','floor','label','Floor','icon','layers'),
    jsonb_build_object('field','builtup_area','label','Built-up','icon','area'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','shutter_count','label','Shutters','icon','grid'),
    jsonb_build_object('field','car_parking','label','Parking','icon','grid')
  )
) where code = 'showroom';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','builtup_area','label','Built-up','icon','area'),
    jsonb_build_object('field','height','label','Height ft','icon','stack'),
    jsonb_build_object('field','shutter_count','label','Shutters','icon','grid'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','carpet_area','label','Carpet','icon','area'),
    jsonb_build_object('field','plot_area','label','Plot','icon','area'),
    jsonb_build_object('field','frontage','label','Frontage ft','icon','grid'),
    jsonb_build_object('field','loading_dock','label','Loading dock','icon','grid')
  )
) where code = 'godown';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','land_area','label','Plot area','icon','area'),
    jsonb_build_object('field','plot_length','label','Length ft','icon','grid'),
    jsonb_build_object('field','plot_width','label','Width ft','icon','grid'),
    jsonb_build_object('field','floors_allowed','label','Floors allowed','icon','layers'),
    jsonb_build_object('field','road_width','label','Road ft','icon','pin'),
    jsonb_build_object('field','open_sides','label','Open sides','icon','grid'),
    jsonb_build_object('field','land_zone','label','Zone','icon','shield'),
    jsonb_build_object('field','plot_approval','label','Approval','icon','check-circle')
  )
) where code in ('plot_res','plot_com');

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','land_area','label','Land area','icon','area'),
    jsonb_build_object('field','plot_length','label','Length ft','icon','grid'),
    jsonb_build_object('field','plot_width','label','Width ft','icon','grid'),
    jsonb_build_object('field','road_width','label','Road ft','icon','pin'),
    jsonb_build_object('field','irrigation','label','Irrigation','icon','bulb'),
    jsonb_build_object('field','soil_type','label','Soil','icon','pin'),
    jsonb_build_object('field','water','label','Water','icon','bulb'),
    jsonb_build_object('field','na_kheti','label','NA / Kheti','icon','shield')
  )
) where code in ('plot_agri','plot_farm');

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','total_beds','label','Beds','icon','bed'),
    jsonb_build_object('field','occupancy','label','Sharing','icon','users'),
    jsonb_build_object('field','bathroom_type','label','Bathroom','icon','bath'),
    jsonb_build_object('field','pg_for','label','For','icon','user'),
    jsonb_build_object('field','beds_available','label','Available','icon','check-circle'),
    jsonb_build_object('field','bathrooms','label','Bathrooms','icon','bath'),
    jsonb_build_object('field','food_type','label','Food','icon','home'),
    jsonb_build_object('field','meals','label','Meals','icon','home')
  )
) where code = 'pg';

-- ---------------------------------------------------------------------------
-- Project types — `source: 'column'` reads the projects row, not `attributes`.
-- ---------------------------------------------------------------------------
update public.project_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','towers','label','Towers','icon','building','source','column'),
    jsonb_build_object('field','floors','label','Floors','icon','layers','source','column'),
    jsonb_build_object('field','total_units','label','Total units','icon','grid','source','column'),
    jsonb_build_object('field','available_units','label','Available','icon','check-circle','source','column'),
    jsonb_build_object('field','units_per_floor','label','Per floor','icon','grid'),
    jsonb_build_object('field','project_land_area','label','Land area','icon','area'),
    jsonb_build_object('field','open_area_percent','label','Open area %','icon','pin'),
    jsonb_build_object('field','booking_amount','label','Booking','icon','receipt')
  )
) where code in ('apartment','mixed','commercial_complex','shopping');

update public.project_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','total_units','label','Total units','icon','grid','source','column'),
    jsonb_build_object('field','available_units','label','Available','icon','check-circle','source','column'),
    jsonb_build_object('field','project_land_area','label','Land area','icon','area'),
    jsonb_build_object('field','open_area_percent','label','Open area %','icon','pin'),
    jsonb_build_object('field','floors','label','Floors','icon','layers','source','column'),
    jsonb_build_object('field','car_parking','label','Parking','icon','grid'),
    jsonb_build_object('field','water','label','Water','icon','bulb'),
    jsonb_build_object('field','booking_amount','label','Booking','icon','receipt')
  )
) where code in ('row_house','bungalow_scheme','farmhouse_scheme');

update public.project_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','total_plots','label','Total plots','icon','grid'),
    jsonb_build_object('field','project_land_area','label','Land area','icon','area'),
    jsonb_build_object('field','floors_allowed','label','Floors allowed','icon','layers'),
    jsonb_build_object('field','road_width','label','Road ft','icon','pin'),
    jsonb_build_object('field','open_area_percent','label','Open area %','icon','pin'),
    jsonb_build_object('field','land_zone','label','Zone','icon','shield'),
    jsonb_build_object('field','available_units','label','Available','icon','check-circle','source','column'),
    jsonb_build_object('field','booking_amount','label','Booking','icon','receipt')
  )
) where code = 'plotting';
