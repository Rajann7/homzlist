-- 0069 — the detail screen's key-spec strip and highlight rail, per type.
--
-- `listingDetailDTO` has built both from `property_types.field_config.key_specs`
-- and `.highlights` since migration 0023, and BOTH KEYS HAVE ALWAYS BEEN NULL on
-- every one of the thirteen types. So `keySpecs` and `highlights` came back as
-- empty arrays on every listing ever created, and the detail screen's headline
-- element — the four-tile bed / bath / sqft / floor strip — has never rendered
-- for anybody. It is not a code bug; the config it reads was never seeded.
--
-- Which fields appear stays a DATABASE decision (CLAUDE.md rule 7): every field
-- named below is already in that type's own `fields` list, so this seeds the
-- selection, it does not invent a new one. An admin changing a row here moves
-- the screen with no deploy.
--
-- Three labels are contracts with the DTO (lib/listings/dto.ts detailBlocks):
--   "Sqft"     — the value is an area object, rendered as a sq-ft number
--   "Bedrooms" — the value is rendered as "3 BHK"
--   "Floor"    — rendered as "4 / 12" when the row also carries total_floors
-- Every other label prints its resolved option label as-is.

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Baths','icon','bath'),
    jsonb_build_object('field','builtup_area','label','Sqft','icon','area'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')
  ),
  'highlights', jsonb_build_array('furnishing','construction_status','facing','age')
) where code = 'flat';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Baths','icon','bath'),
    jsonb_build_object('field','builtup_area','label','Sqft','icon','area'),
    jsonb_build_object('field','floor_count','label','Floors','icon','layers')
  ),
  'highlights', jsonb_build_array('furnishing','construction_status','facing','age')
) where code in ('bungalow','tenement');

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Baths','icon','bath'),
    jsonb_build_object('field','construction_area','label','Sqft','icon','area'),
    jsonb_build_object('field','floor_count','label','Floors','icon','layers')
  ),
  'highlights', jsonb_build_array('furnishing','construction_status','facing','age')
) where code = 'farmhouse';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Sqft','icon','area'),
    jsonb_build_object('field','cabins','label','Cabins','icon','grid'),
    jsonb_build_object('field','workstations','label','Seats','icon','users'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')
  ),
  'highlights', jsonb_build_array('shell_state','construction_status','facing','age')
) where code = 'office';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Sqft','icon','area'),
    jsonb_build_object('field','frontage','label','Frontage ft','icon','grid'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')
  ),
  'highlights', jsonb_build_array('shell_state','construction_status','facing','age')
) where code = 'shop';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Sqft','icon','area'),
    jsonb_build_object('field','frontage','label','Frontage ft','icon','grid'),
    jsonb_build_object('field','height','label','Height ft','icon','stack'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')
  ),
  'highlights', jsonb_build_array('shell_state','construction_status','facing','age')
) where code = 'showroom';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','builtup_area','label','Sqft','icon','area'),
    jsonb_build_object('field','height','label','Height ft','icon','stack'),
    jsonb_build_object('field','shutter_count','label','Shutters','icon','grid'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath')
  ),
  'highlights', jsonb_build_array('shell_state','construction_status','facing','age')
) where code = 'godown';

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','land_area','label','Sqft','icon','area'),
    jsonb_build_object('field','plot_length','label','Length ft','icon','grid'),
    jsonb_build_object('field','plot_width','label','Width ft','icon','grid'),
    jsonb_build_object('field','floors_allowed','label','Floors allowed','icon','layers')
  ),
  'highlights', jsonb_build_array('land_zone','plot_approval','na_kheti','facing')
) where code in ('plot_res','plot_com');

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','land_area','label','Sqft','icon','area'),
    jsonb_build_object('field','plot_length','label','Length ft','icon','grid'),
    jsonb_build_object('field','plot_width','label','Width ft','icon','grid'),
    jsonb_build_object('field','road_width','label','Road ft','icon','pin')
  ),
  'highlights', jsonb_build_array('soil_type','plot_approval','na_kheti','facing')
) where code in ('plot_agri','plot_farm');

update public.property_types set field_config = field_config || jsonb_build_object(
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','total_beds','label','Beds','icon','bed'),
    jsonb_build_object('field','occupancy','label','Sharing','icon','users'),
    jsonb_build_object('field','bathroom_type','label','Bathroom','icon','bath'),
    jsonb_build_object('field','pg_for','label','For','icon','user')
  ),
  'highlights', jsonb_build_array('furnishing','food_type','meals')
) where code = 'pg';

-- Projects are deliberately NOT given a `highlights` list here: nothing reads
-- one for a project (`projectDTO` builds no highlight rail), and seeding config
-- that no code consumes is the same dead weight as the empty key_specs this
-- migration exists to fix. A project's own answers — land area, open area,
-- booking amount — are rendered in full by the detail screen's grouped blocks.
