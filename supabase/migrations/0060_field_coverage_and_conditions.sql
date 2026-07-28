-- 0060 — per-type field coverage + real conditional visibility.
--
-- Three things were wrong across every property type:
--
-- 1. TWO controls asked the same question and contradicted each other.
--    `construction_status` was new/resale and `age` was
--    under_construction/new/0-1/1-5/5-10/10+. Picking "New" under Age made
--    "Possession date" appear on a finished home — the exact thing a seller
--    should never be asked. `construction_status` is now the single driver
--    (ready_to_move | under_construction | new_launch); Age hangs off
--    ready-to-move, Possession and RERA off the two unfinished states.
--
-- 2. Conditions could only be `{field, in:[…]}`, so genuinely dependent fields
--    were shown unconditionally: Road width with no Road touch, Parking type
--    with zero parking, the furnishing checklist on a bare-shell shop.
--
-- 3. Sell-only questions were asked of landlords and vice versa, because a type
--    had one flat `fields` list. `sell_fields` joins `rent_fields`.
--
-- Field coverage was then walked type by type: 15 new definitions so a godown
-- can state its loading dock, a plot its permitted floors and land-use zone, a
-- farm its irrigation source, a PG its housekeeping and visitor policy, and any
-- home its power backup and kitchen.

begin;

-- ---------------------------------------------------------------- new fields
insert into field_definitions (key, label, control, options, placeholder, hint, "group", units, show_if, sort_order, is_active) values
  ('power_backup', 'Power backup', 'chips',
   '[{"value":"none","label":"None"},{"value":"inverter","label":"Inverter"},{"value":"partial","label":"Partial (DG)"},{"value":"full","label":"Full backup"}]',
   null, null, 'utilities', null, null, 60, true),

  ('kitchen_type', 'Kitchen', 'chips',
   '[{"value":"modular","label":"Modular"},{"value":"separate","label":"Separate"},{"value":"open","label":"Open"}]',
   null, null, 'construction', null, null, 61, true),

  ('pet_allowed', 'Pets allowed', 'toggle', '[]', null, null, 'rental', null, null, 62, true),

  ('loan_available', 'Approved for bank loan', 'toggle', '[]', null,
   'Buyers filter on this — only turn it on if a bank has approved the property.',
   'building', null, null, 63, true),

  ('fire_safety', 'Fire safety NOC', 'toggle', '[]', null, null, 'utilities', null, null, 64, true),

  ('mezzanine', 'Mezzanine floor', 'toggle', '[]', null, null, 'area', null, null, 65, true),

  ('loading_dock', 'Loading / unloading dock', 'toggle', '[]', null,
   'Truck-height platform for loading goods.', 'utilities', null, null, 66, true),

  ('office_space', 'Office cabin inside', 'toggle', '[]', null, null, 'configuration', null, null, 67, true),

  ('floors_allowed', 'Floors permitted', 'number', '[]', 'e.g. 4',
   'How many floors the local authority permits on this plot.', 'land', null, null, 68, true),

  ('land_zone', 'Land-use zone', 'select',
   '[{"value":"residential","label":"Residential"},{"value":"commercial","label":"Commercial"},{"value":"industrial","label":"Industrial"},{"value":"agricultural","label":"Agricultural"},{"value":"mixed","label":"Mixed use"}]',
   null, null, 'land', null, null, 69, true),

  ('irrigation', 'Irrigation source', 'select',
   '[{"value":"borewell","label":"Borewell"},{"value":"well","label":"Open well"},{"value":"canal","label":"Canal"},{"value":"river","label":"River / stream"},{"value":"rain_fed","label":"Rain-fed"},{"value":"none","label":"None"}]',
   null, null, 'land', null, null, 70, true),

  ('laundry', 'Laundry', 'toggle', '[]', null, null, 'house_rules', null, null, 71, true),

  ('housekeeping', 'Housekeeping', 'toggle', '[]', null, null, 'house_rules', null, null, 72, true),

  ('visitor_policy', 'Visitors', 'chips',
   '[{"value":"allowed","label":"Allowed"},{"value":"restricted","label":"Restricted hours"},{"value":"not_allowed","label":"Not allowed"}]',
   null, null, 'house_rules', null, null, 73, true),

  ('previous_use', 'Previously used as', 'text', '[]', 'e.g. garment showroom',
   'Optional — helps a buyer picture the space.', 'building', null, null, 74, true)
on conflict (key) do update set
  label = excluded.label, control = excluded.control, options = excluded.options,
  placeholder = excluded.placeholder, hint = excluded.hint, "group" = excluded."group",
  show_if = excluded.show_if, sort_order = excluded.sort_order, is_active = true;

-- -------------------------------------------- one driver for property status
update field_definitions set
  label = 'Property status',
  control = 'chips',
  options = '[{"value":"ready_to_move","label":"Ready to move"},{"value":"under_construction","label":"Under construction"},{"value":"new_launch","label":"New launch"}]'
where key = 'construction_status';

-- Age is a RESALE question. It used to carry under_construction/new, which is
-- what let an unfinished build also claim an age.
update field_definitions set
  label = 'Age of property',
  options = '[{"value":"0-1","label":"Under 1 year"},{"value":"1-5","label":"1–5 years"},{"value":"5-10","label":"5–10 years"},{"value":"10+","label":"10+ years"}]',
  show_if = '{"field":"construction_status","in":["ready_to_move"]}'
where key = 'age';

update field_definitions set
  label = 'Possession by',
  show_if = '{"field":"construction_status","in":["under_construction","new_launch"]}'
where key = 'possession';

update field_definitions set
  hint = 'Mandatory for under-construction projects.',
  show_if = '{"field":"construction_status","in":["under_construction","new_launch"]}'
where key = 'rera_id';

-- ------------------------------------------------- the rest of the conditions
-- The checklist is driven by `furnishing` on a home and by `shell_state` on a
-- commercial unit — the same field reached from two different drivers.
update field_definitions set
  show_if = '{"any":[{"field":"furnishing","in":["semi","full"]},{"field":"shell_state","in":["warm","fitted"]}]}'
where key = 'furnishing_details';

update field_definitions set show_if = '{"field":"road_touch","eq":true}' where key = 'road_width';

update field_definitions set
  show_if = '{"any":[{"field":"car_parking","gt":0},{"field":"bike_parking","gt":0}]}'
where key = 'parking_type';

update field_definitions set show_if = '{"field":"meals","eq":true}' where key = 'food_type';

-- A PG that closes its gate needs a time; one that doesn't, doesn't.
update field_definitions set
  label = 'Gate closes at', placeholder = 'e.g. 10:30 PM',
  show_if = '{"field":"visitor_policy","in":["restricted","not_allowed"]}'
where key = 'gate_timing';

update field_definitions set show_if = '{"field":"total_beds","gt":0}' where key = 'beds_available';

-- `bore` duplicated the `water` chip row (which already offers Bore / Both) on
-- every type that had both. Irrigation replaced it on farmland.
update field_definitions set is_active = false where key = 'bore';

-- ------------------------------------------- backfill the status/age rewrite
-- Existing rows carried the old vocabulary. Age's two non-age values ARE the
-- status, so they move across and clear themselves; the old new/resale pair
-- both described a finished building.
update listings set attributes = jsonb_set(attributes - 'age', '{construction_status}', '"under_construction"')
where attributes->>'age' = 'under_construction';

update listings set attributes = jsonb_set(attributes - 'age', '{construction_status}', '"new_launch"')
where attributes->>'age' = 'new';

update listings set attributes = jsonb_set(attributes, '{construction_status}', '"ready_to_move"')
where attributes->>'construction_status' in ('new', 'resale');

-- A possession date on a finished property is exactly what the old rule let
-- through; it is now unreachable in the UI, so it must not survive in the data.
update listings set attributes = attributes - 'possession'
where attributes ? 'possession'
  and coalesce(attributes->>'construction_status', '') not in ('under_construction', 'new_launch');

update listings set attributes = attributes - 'road_width'
where attributes ? 'road_width' and coalesce(attributes->>'road_touch', 'false') <> 'true';

-- ------------------------------------------------------- per-type field sets
-- Ordering inside each array IS the on-screen order within its group, so these
-- read top-to-bottom the way the form does.

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','extra_rooms','floor','total_floors',
    'carpet_area','builtup_area','super_builtup_area',
    'construction_status','possession','rera_id','age','furnishing','furnishing_details','kitchen_type','flooring',
    'car_parking','bike_parking','parking_type','lift','water','power_backup',
    'society_name','gated_society','maintenance','facing','overlooking'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period','pet_allowed'),
  'required', jsonb_build_array('bhk','builtup_area')
) where code = 'flat';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','extra_rooms','floor_count',
    'plot_area','builtup_area','carpet_area','plot_length','plot_width',
    'construction_status','possession','rera_id','age','furnishing','furnishing_details','kitchen_type','flooring',
    'car_parking','bike_parking','parking_type','water','power_backup',
    'road_touch','road_width','corner_plot','boundary_wall',
    'society_name','gated_society','facing','garden','overlooking'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period','pet_allowed'),
  'required', jsonb_build_array('bhk','plot_area','builtup_area')
) where code = 'bungalow';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','extra_rooms','floor_count',
    'plot_area','builtup_area','carpet_area','plot_length','plot_width',
    'construction_status','possession','rera_id','age','furnishing','furnishing_details','kitchen_type','flooring',
    'car_parking','bike_parking','parking_type','water','power_backup',
    'road_touch','road_width','corner_plot',
    'society_name','gated_society','facing','garden'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period','pet_allowed'),
  'required', jsonb_build_array('bhk','plot_area','builtup_area')
) where code = 'tenement';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','extra_rooms','floor_count',
    'land_area','construction_area',
    'construction_status','possession','age','furnishing','furnishing_details','kitchen_type','flooring',
    'car_parking','water','power_backup','electricity',
    'road_touch','road_width','boundary_wall','fencing','irrigation',
    'facing','garden','overlooking'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period','pet_allowed'),
  'required', jsonb_build_array('land_area'),
  'area_units', true
) where code = 'farmhouse';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'cabins','workstations','conference_room','washrooms','floor','total_floors',
    'carpet_area','builtup_area','super_builtup_area','mezzanine',
    'construction_status','possession','rera_id','age','shell_state','furnishing_details','flooring',
    'car_parking','bike_parking','parking_type','lift','ac','pantry','power_load','power_backup','fire_safety','water',
    'society_name','maintenance','facing','previous_use'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in','notice_period'),
  'required', jsonb_build_array('carpet_area')
) where code = 'office';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'washrooms','floor','total_floors',
    'carpet_area','builtup_area','frontage','height','mezzanine',
    'construction_status','possession','age','shell_state','furnishing_details','flooring',
    'car_parking','bike_parking','parking_type','shutter_count','ac','power_load','power_backup','water','electricity','fire_safety',
    'road_touch','road_width','corner_plot',
    'society_name','maintenance','facing','previous_use'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in','notice_period'),
  'required', jsonb_build_array('carpet_area')
) where code = 'shop';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'washrooms','floor','total_floors',
    'carpet_area','builtup_area','super_builtup_area','frontage','height','mezzanine',
    'construction_status','possession','age','shell_state','furnishing_details','flooring',
    'car_parking','bike_parking','parking_type','shutter_count','lift','ac','power_load','power_backup','water','electricity','fire_safety',
    'road_touch','road_width','corner_plot',
    'society_name','maintenance','facing','previous_use'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in','notice_period'),
  'required', jsonb_build_array('carpet_area')
) where code = 'showroom';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'washrooms','floor','office_space',
    'carpet_area','builtup_area','plot_area','frontage','height','mezzanine',
    'construction_status','possession','age','shell_state',
    'shutter_count','loading_dock','power_load','power_backup','water','electricity','fire_safety','car_parking',
    'road_touch','road_width','corner_plot','boundary_wall',
    'maintenance','facing','previous_use'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in','notice_period'),
  'required', jsonb_build_array('carpet_area')
) where code = 'godown';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'land_area','plot_length','plot_width',
    'na_kheti','plot_approval','land_zone','floors_allowed','road_touch','road_width','corner_plot','open_sides','fencing','boundary_wall',
    'water','electricity',
    'society_name','gated_society','facing'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array(),
  'required', jsonb_build_array('land_area'),
  'area_units', true
) where code in ('plot_res', 'plot_com');

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'land_area','plot_length','plot_width',
    'na_kheti','plot_approval','soil_type','irrigation','road_touch','road_width','corner_plot','fencing','boundary_wall',
    'water','electricity',
    'facing'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array(),
  'required', jsonb_build_array('land_area'),
  'area_units', true
) where code = 'plot_agri';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'land_area','plot_length','plot_width',
    'na_kheti','plot_approval','soil_type','irrigation','road_touch','road_width','fencing','boundary_wall',
    'water','electricity',
    'facing','garden'),
  'sell_fields', jsonb_build_array('ownership_type','loan_available'),
  'rent_fields', jsonb_build_array(),
  'required', jsonb_build_array('land_area'),
  'area_units', true
) where code = 'plot_farm';

update property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'pg_for','occupancy','total_beds','beds_available','bathroom_type','bathrooms',
    'furnishing','furnishing_details',
    'ac','car_parking','bike_parking','parking_type','lift','water','power_backup',
    'society_name',
    'meals','food_type','laundry','housekeeping','visitor_policy','gate_timing','rules'),
  'sell_fields', jsonb_build_array(),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','notice_period'),
  'required', jsonb_build_array('pg_for','occupancy')
) where code = 'pg';

commit;
