-- ============================================================================
-- HomzList — Migration 0055: field GROUPS, and the fields each type was missing
--
-- Two problems this fixes, both visible on the create form.
--
-- 1. NO STRUCTURE. `field_config.fields` is one flat list, rendered in
--    whatever order the array happened to be in, under a single "<Type>
--    details" heading. A Flat asked for BHK, then bathrooms, then built-up
--    area, then floor, then furnishing, then parking, then maintenance — nine
--    unrelated questions in one column. Fields now carry a GROUP, groups have
--    a fixed order, and the form renders one titled block per group. The order
--    is the same for every type, so a seller who has listed a flat already
--    knows where to look when they list a shop.
--
-- 2. MISSING FIELDS. Walked type by type against what the listing actually has
--    to state. An Office could not say how many cabins it has, a Shop could not
--    give its shutter count or height, a Plot could not give its dimensions or
--    its NA/TP approval, a Godown had no plot area or road access, and a PG
--    could not say how many beds are free or whether the bathroom is attached.
--    Every one of those is a question a buyer asks in the first message.
--
-- Everything here is DATA: no client code names any of these fields, so this
-- migration alone changes what the form asks (Doc2 §5.1).
-- ============================================================================

-- ---- 1. groups -------------------------------------------------------------
create table if not exists public.field_groups (
  key        text primary key,
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

alter table public.field_groups enable row level security;

insert into public.field_groups (key, label, sort_order) values
  ('configuration', 'Configuration',        1),
  ('area',          'Area & dimensions',    2),
  ('construction',  'Construction & interiors', 3),
  ('utilities',     'Parking & utilities',  4),
  ('land',          'Land & plot',          5),
  ('building',      'Building & ownership', 6),
  ('rental',        'Rental terms',         7),
  ('house_rules',   'House rules',          8)
on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order;

alter table public.field_definitions
  add column if not exists "group" text references public.field_groups(key);

-- Existing definitions, filed into the new groups.
update public.field_definitions set "group" = 'configuration'
  where key in ('bhk','bathrooms','balconies','washrooms','floor','total_floors','floor_count',
                'pg_for','occupancy','extra_rooms');
update public.field_definitions set "group" = 'area'
  where key in ('carpet_area','builtup_area','super_builtup_area','plot_area','construction_area',
                'land_area','frontage','height');
update public.field_definitions set "group" = 'construction'
  where key in ('construction_status','age','possession','shell_state','furnishing',
                'furnishing_details','flooring','rera_id');
update public.field_definitions set "group" = 'utilities'
  where key in ('car_parking','bike_parking','parking_type','lift','water','bore','power_load',
                'shutter_count','ac');
update public.field_definitions set "group" = 'land'
  where key in ('na_kheti','road_touch','road_width','corner_plot','fencing');
update public.field_definitions set "group" = 'building'
  where key in ('society_name','maintenance','ownership_type','facing','garden','overlooking');
update public.field_definitions set "group" = 'rental'
  where key in ('deposit','available_from','maintenance_included','tenant_preference','notice_period');
update public.field_definitions set "group" = 'house_rules'
  where key in ('rules','meals');
-- Ownership proof is section H of the form, not a per-type detail field.
update public.field_definitions set "group" = null where key = 'ownership_proof_type';

-- ---- 2. a real date control -------------------------------------------------
-- "Available from" was a TEXT box with the placeholder "YYYY-MM-DD", so it
-- collected "next month", "immediate" and "1/2/26" — none of which the
-- available_from DATE column can store, so the value was silently dropped.
alter table public.field_definitions drop constraint if exists field_definitions_control_check;
alter table public.field_definitions add constraint field_definitions_control_check
  check (control in ('chips','select','multi','stepper','toggle','number','text','area','date'));

update public.field_definitions
   set control = 'date', placeholder = null, hint = 'Leave blank if it''s available now'
 where key = 'available_from';

-- ---- 3. the fields each type was missing ------------------------------------
insert into public.field_definitions (key, label, control, options, placeholder, hint, show_if, units, "group", sort_order) values
  -- Residential
  ('super_builtup_area','Super built-up area','area','[]',null,'What the builder charges on — usually 20-30% above carpet',null,'built','area',18),
  ('flooring','Flooring','select',
   '[{"value":"vitrified","label":"Vitrified tiles"},{"value":"marble","label":"Marble"},{"value":"granite","label":"Granite"},{"value":"ceramic","label":"Ceramic tiles"},{"value":"wooden","label":"Wooden"},{"value":"mosaic","label":"Mosaic"},{"value":"cement","label":"Cement"}]',
   null,null,null,null,'construction',24),
  ('extra_rooms','Extra rooms','multi',
   '[{"value":"pooja","label":"Pooja room"},{"value":"study","label":"Study"},{"value":"servant","label":"Servant room"},{"value":"store","label":"Store room"},{"value":"terrace","label":"Private terrace"},{"value":"basement","label":"Basement"}]',
   null,null,null,null,'configuration',7),
  ('overlooking','Overlooking','multi',
   '[{"value":"garden","label":"Garden / Park"},{"value":"road","label":"Main road"},{"value":"club","label":"Clubhouse"},{"value":"pool","label":"Swimming pool"},{"value":"lake","label":"Lake / River"},{"value":"open","label":"Open land"}]',
   null,null,null,null,'building',48),
  -- RERA only means anything while the build is unfinished.
  ('rera_id','RERA number','text','[]','PR/GJ/RAJKOT/…','Required by law on an under-construction sale',
   '{"field":"construction_status","in":["new"]}',null,'construction',28),

  -- Commercial
  ('cabins','Cabins','stepper','[]',null,null,null,null,'configuration',11),
  ('workstations','Workstations','number','[]','24',null,null,null,'configuration',12),
  ('pantry','Pantry','toggle','[]',null,null,null,null,'utilities',44),
  ('conference_room','Conference room','toggle','[]',null,null,null,null,'configuration',13),
  ('lease_duration','Lease duration','select',
   '[{"value":"11m","label":"11 months"},{"value":"1y","label":"1 year"},{"value":"3y","label":"3 years"},{"value":"5y","label":"5 years"},{"value":"9y","label":"9 years"},{"value":"negotiable","label":"Negotiable"}]',
   null,null,null,null,'rental',45),
  ('lock_in','Lock-in period','select',
   '[{"value":"none","label":"None"},{"value":"3m","label":"3 months"},{"value":"6m","label":"6 months"},{"value":"1y","label":"1 year"},{"value":"2y","label":"2 years"},{"value":"3y","label":"3 years"}]',
   null,null,null,null,'rental',46),

  -- Plot / land
  ('plot_length','Plot length (ft)','number','[]','60',null,null,null,'area',30),
  ('plot_width','Plot width (ft)','number','[]','40',null,null,null,'area',31),
  ('open_sides','Open sides','chips',
   '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"}]',
   null,null,null,null,'land',35),
  ('boundary_wall','Boundary wall','toggle','[]',null,null,null,null,'land',36),
  ('plot_approval','Approval','select',
   '[{"value":"na","label":"NA order"},{"value":"na_tp","label":"NA + TP approved"},{"value":"rera","label":"RERA approved"},{"value":"gram_panchayat","label":"Gram Panchayat"},{"value":"none","label":"Not approved yet"}]',
   null,null,null,null,'land',37),
  ('electricity','Electricity connection','toggle','[]',null,null,null,null,'utilities',47),
  ('soil_type','Soil type','select',
   '[{"value":"black","label":"Black"},{"value":"red","label":"Red"},{"value":"alluvial","label":"Alluvial"},{"value":"sandy","label":"Sandy"},{"value":"loamy","label":"Loamy"}]',
   null,null,null,null,'land',38),

  -- PG / Hostel
  ('total_beds','Total beds','number','[]','24',null,null,null,'configuration',15),
  ('beds_available','Beds available','number','[]','6',null,null,null,'configuration',16),
  ('bathroom_type','Bathroom','chips',
   '[{"value":"attached","label":"Attached"},{"value":"shared","label":"Shared"}]',
   null,null,null,null,'configuration',17),
  ('food_type','Food','chips',
   '[{"value":"veg","label":"Veg only"},{"value":"both","label":"Veg & Non-veg"}]',
   null,null,'{"field":"meals","in":["true"]}',null,'house_rules',52),
  ('gate_timing','Gate closes at','text','[]','11:00 PM',null,null,null,'house_rules',53),
  ('gated_society','Gated society','toggle','[]',null,null,null,null,'building',49)
on conflict (key) do update set
  label = excluded.label, control = excluded.control, options = excluded.options,
  placeholder = excluded.placeholder, hint = excluded.hint, show_if = excluded.show_if,
  units = excluded.units, "group" = excluded."group", sort_order = excluded.sort_order;

-- ---- 4. per-type field lists ------------------------------------------------
-- Walked one type at a time. `fields` is the full set the type asks for,
-- `required` the ones that block a submit, `rent_fields` the extras that only
-- appear when the listing is for rent (the client used to hardcode those four),
-- `key_specs` the detail screen's tile strip and `highlights` its chip row.

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','extra_rooms','floor','total_floors',
    'carpet_area','builtup_area','super_builtup_area',
    'construction_status','rera_id','age','possession','furnishing','furnishing_details','flooring',
    'car_parking','bike_parking','parking_type','lift','water',
    'society_name','gated_society','maintenance','facing','overlooking','ownership_type'),
  'required', jsonb_build_array('bhk','builtup_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Bathrooms','icon','bath'),
    jsonb_build_object('field','builtup_area','label','Sqft','icon','area'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')),
  'highlights', jsonb_build_array('furnishing','facing','possession','construction_status','age','ownership_type')
) where code = 'flat';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','extra_rooms','floor_count',
    'plot_area','builtup_area','carpet_area','plot_length','plot_width',
    'construction_status','rera_id','age','possession','furnishing','furnishing_details','flooring',
    'car_parking','bike_parking','parking_type','water','bore',
    'road_touch','road_width','corner_plot','boundary_wall',
    'society_name','gated_society','facing','garden','overlooking','ownership_type'),
  'required', jsonb_build_array('bhk','plot_area','builtup_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Bathrooms','icon','bath'),
    jsonb_build_object('field','builtup_area','label','Sqft','icon','area')),
  'highlights', jsonb_build_array('furnishing','facing','possession','construction_status','age','ownership_type')
) where code = 'bungalow';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','extra_rooms','floor_count',
    'plot_area','builtup_area','carpet_area',
    'construction_status','age','possession','furnishing','furnishing_details','flooring',
    'car_parking','bike_parking','parking_type','water',
    'road_touch','road_width','corner_plot',
    'society_name','facing','ownership_type'),
  'required', jsonb_build_array('bhk','plot_area','builtup_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Bathrooms','icon','bath'),
    jsonb_build_object('field','builtup_area','label','Sqft','icon','area')),
  'highlights', jsonb_build_array('furnishing','facing','possession','construction_status','age','ownership_type')
) where code = 'tenement';

-- A farmhouse HAS bedrooms. `hidden: [bhk]` meant the one thing a family asks
-- about first could not be stated.
update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','extra_rooms',
    'land_area','construction_area',
    'age','furnishing','furnishing_details','flooring',
    'car_parking','water','bore','electricity',
    'road_touch','road_width','boundary_wall','fencing',
    'facing','garden','ownership_type'),
  'required', jsonb_build_array('land_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','bhk','label','Bedrooms','icon','bed'),
    jsonb_build_object('field','bathrooms','label','Bathrooms','icon','bath'),
    jsonb_build_object('field','construction_area','label','Sqft','icon','area')),
  'highlights', jsonb_build_array('furnishing','facing','age','garden','ownership_type')
) where code = 'farmhouse';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'cabins','workstations','conference_room','washrooms','floor','total_floors',
    'carpet_area','builtup_area','super_builtup_area',
    'construction_status','age','possession','shell_state','furnishing','furnishing_details',
    'car_parking','bike_parking','lift','ac','pantry','power_load',
    'society_name','maintenance','facing','ownership_type'),
  'required', jsonb_build_array('carpet_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Sqft','icon','area'),
    jsonb_build_object('field','cabins','label','Cabins','icon','layers'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')),
  'highlights', jsonb_build_array('shell_state','furnishing','facing','age','ownership_type')
) where code = 'office';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'washrooms','floor','total_floors',
    'carpet_area','builtup_area','frontage','height',
    'construction_status','age','possession','shell_state','furnishing',
    'car_parking','bike_parking','shutter_count','ac','power_load',
    'road_touch','road_width','corner_plot',
    'society_name','maintenance','facing','ownership_type'),
  'required', jsonb_build_array('carpet_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Sqft','icon','area'),
    jsonb_build_object('field','frontage','label','Frontage','icon','layers'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')),
  'highlights', jsonb_build_array('shell_state','corner_plot','facing','age','ownership_type')
) where code = 'shop';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'washrooms','floor','total_floors',
    'carpet_area','builtup_area','frontage','height',
    'construction_status','age','possession','shell_state','furnishing',
    'car_parking','bike_parking','shutter_count','lift','ac','power_load',
    'road_touch','road_width','corner_plot',
    'society_name','maintenance','facing','ownership_type'),
  'required', jsonb_build_array('carpet_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Sqft','icon','area'),
    jsonb_build_object('field','frontage','label','Frontage','icon','layers'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath'),
    jsonb_build_object('field','floor','label','Floor','icon','layers')),
  'highlights', jsonb_build_array('shell_state','corner_plot','facing','age','ownership_type')
) where code = 'showroom';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'washrooms','floor',
    'carpet_area','plot_area','frontage','height',
    'construction_status','age','possession','shell_state',
    'shutter_count','power_load','water','electricity','car_parking',
    'road_touch','road_width','corner_plot','boundary_wall',
    'maintenance','facing','ownership_type'),
  'required', jsonb_build_array('carpet_area'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','lease_duration','lock_in'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','carpet_area','label','Sqft','icon','area'),
    jsonb_build_object('field','height','label','Height','icon','layers'),
    jsonb_build_object('field','shutter_count','label','Shutters','icon','layers'),
    jsonb_build_object('field','washrooms','label','Washrooms','icon','bath')),
  'highlights', jsonb_build_array('shell_state','road_touch','age','ownership_type')
) where code = 'godown';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'land_area','plot_length','plot_width',
    'na_kheti','plot_approval','road_touch','road_width','corner_plot','open_sides','fencing','boundary_wall',
    'water','electricity',
    'society_name','gated_society','facing','ownership_type'),
  'required', jsonb_build_array('land_area'),
  'area_units', true,
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','land_area','label','Sqft','icon','area'),
    jsonb_build_object('field','plot_length','label','Length','icon','layers'),
    jsonb_build_object('field','plot_width','label','Width','icon','layers'),
    jsonb_build_object('field','road_width','label','Road','icon','layers')),
  'highlights', jsonb_build_array('na_kheti','plot_approval','corner_plot','facing','ownership_type')
) where code in ('plot_res','plot_com');

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'land_area','plot_length','plot_width',
    'na_kheti','plot_approval','soil_type','road_touch','road_width','corner_plot','fencing','boundary_wall',
    'bore','water','electricity',
    'facing','ownership_type'),
  'required', jsonb_build_array('land_area'),
  'area_units', true,
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','land_area','label','Sqft','icon','area'),
    jsonb_build_object('field','road_width','label','Road','icon','layers')),
  'highlights', jsonb_build_array('na_kheti','plot_approval','soil_type','bore','ownership_type')
) where code = 'plot_agri';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'land_area','plot_length','plot_width',
    'na_kheti','plot_approval','soil_type','road_touch','road_width','fencing','boundary_wall',
    'bore','water','electricity',
    'facing','garden','ownership_type'),
  'required', jsonb_build_array('land_area'),
  'area_units', true,
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','land_area','label','Sqft','icon','area'),
    jsonb_build_object('field','road_width','label','Road','icon','layers')),
  'highlights', jsonb_build_array('na_kheti','plot_approval','soil_type','bore','ownership_type')
) where code = 'plot_farm';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'pg_for','occupancy','total_beds','beds_available','bathroom_type','bathrooms',
    'furnishing','furnishing_details',
    'ac','car_parking','bike_parking','water',
    'society_name',
    'meals','food_type','gate_timing','rules'),
  'required', jsonb_build_array('pg_for','occupancy'),
  'rent_fields', jsonb_build_array('deposit','available_from','maintenance_included','tenant_preference','notice_period'),
  'key_specs', jsonb_build_array(
    jsonb_build_object('field','occupancy','label','Occupancy','icon','bed'),
    jsonb_build_object('field','beds_available','label','Beds free','icon','bed'),
    jsonb_build_object('field','bathroom_type','label','Bathroom','icon','bath')),
  'highlights', jsonb_build_array('pg_for','furnishing','meals','food_type','ac')
) where code = 'pg';
