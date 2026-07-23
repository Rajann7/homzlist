-- ============================================================================
-- HomzList — Migration 0016: close the listing-form gaps against designs/P5
--
-- A manual walk of the Flat form against the design turned up fields that the
-- design specifies and the config never carried:
--
--   * NO area field at all on `flat` — the design has Built-up area (required)
--     and Carpet area (optional). Commercial types got carpet_area, plots got
--     land_area, and the single most-listed residential type got neither.
--   * "What's included" was a SINGLE select. It is a furnishing checklist —
--     a semi-furnished flat with AC + wardrobes + geyser could record one item.
--     The design has it as a multi-check, shown only once furnishing is set.
--   * Parking collapsed count and cover-type into one list
--     (None/2-wheeler/4-wheeler/Both/Covered/Open), so "2 covered cars and a
--     bike" was unsayable. The design has two steppers + a type chip row.
--   * Age had no "Under construction", and therefore nowhere for the
--     possession date the design reveals underneath it.
--
-- Two mechanisms arrive with it, both config-driven so the form stays a pure
-- renderer (Doc2 §5.1):
--   `show_if`  — a field appears only when another field holds one of N values.
--   `required` — per-type required keys, instead of validate.ts hardcoding
--                which field names matter.
-- ============================================================================

-- ---- 1. new controls + conditional visibility ------------------------------

alter table public.field_definitions drop constraint if exists field_definitions_control_check;
alter table public.field_definitions add constraint field_definitions_control_check
  check (control in ('chips','select','multi','stepper','toggle','number','text','area'));

-- {"field":"furnishing","in":["semi","full"]} — null means always shown.
alter table public.field_definitions add column if not exists show_if jsonb;

-- ---- 2. field definitions the design calls for -----------------------------

insert into public.field_definitions (key, label, control, options, placeholder, hint, sort_order) values
  ('builtup_area','Built-up area','area','[]',null,'Converted automatically for search',19)
on conflict (key) do nothing;

insert into public.field_definitions (key, label, control, options, placeholder, hint, sort_order) values
  ('car_parking','Car parking','stepper','[]',null,null,10),
  ('bike_parking','Two-wheeler parking','stepper','[]',null,null,10),
  ('parking_type','Parking type','chips',
   '[{"value":"covered","label":"Covered"},{"value":"open","label":"Open"}]',null,null,10)
on conflict (key) do nothing;

-- Possession only makes sense while the build is unfinished, so it hangs off
-- `age`. The design's sample dates ('Dec 2025', 'Jun 2026') are already in the
-- past — seeded as forward-rolling half-years instead; see PENDING-INTEGRATIONS.
insert into public.field_definitions (key, label, control, options, placeholder, hint, sort_order, show_if) values
  ('possession','Possession date','select',
   '[{"value":"2026-12","label":"Dec 2026"},{"value":"2027-06","label":"Jun 2027"},{"value":"2027-12","label":"Dec 2027"},{"value":"2028-06","label":"Jun 2028"},{"value":"later","label":"Later / not fixed"}]',
   null,null,14,
   '{"field":"age","in":["under_construction","new"]}'::jsonb)
on conflict (key) do nothing;

-- Corrections to definitions that already existed.
update public.field_definitions set
  label   = 'Furnishing included',
  control = 'multi',
  options = '[{"value":"AC","label":"AC"},{"value":"Wardrobes","label":"Wardrobes"},{"value":"Fridge","label":"Fridge"},{"value":"Geyser","label":"Geyser"},{"value":"Modular kitchen","label":"Modular kitchen"},{"value":"Beds","label":"Beds"},{"value":"Sofa","label":"Sofa"},{"value":"Curtains","label":"Curtains"}]'::jsonb,
  show_if = '{"field":"furnishing","in":["semi","full"]}'::jsonb
where key = 'furnishing_details';

update public.field_definitions
   set options = '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3+","label":"3+"}]'::jsonb
 where key = 'bathrooms';

update public.field_definitions
   set options = '[{"value":"under_construction","label":"Under construction"},{"value":"new","label":"New construction"},{"value":"0-1","label":"0–1 year"},{"value":"1-5","label":"1–5 years"},{"value":"5-10","label":"5–10 years"},{"value":"10+","label":"10+ years"}]'::jsonb
 where key = 'age';

update public.field_definitions
   set options = '[{"value":"municipal","label":"Municipal"},{"value":"bore","label":"Bore"},{"value":"both","label":"Both"}]'::jsonb
 where key = 'water';

update public.field_definitions
   set hint = 'Helps buyers find your listing'
 where key = 'society_name';

update public.field_definitions
   set hint = 'Carpet area is recommended for accuracy'
 where key = 'carpet_area';

-- `parking` is superseded by the car/bike/type trio. Existing listings keep the
-- attribute they already stored; it just stops being offered on new forms.
update public.field_definitions set is_active = false where key = 'parking';

-- ---- 3. per-type field lists -----------------------------------------------
-- Order mirrors designs/P5 section B.

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','builtup_area','carpet_area','floor','total_floors',
    'furnishing','furnishing_details','facing','age','possession',
    'car_parking','bike_parking','parking_type','water','lift',
    'maintenance','society_name','ownership_type','construction_status'),
  'required', jsonb_build_array('bhk','builtup_area')
) where code = 'flat';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','plot_area','construction_area','floor_count',
    'furnishing','furnishing_details','facing','age','possession',
    'car_parking','bike_parking','parking_type','water','garden',
    'ownership_type','construction_status'),
  'required', jsonb_build_array('bhk','plot_area')
) where code = 'bungalow';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','plot_area','construction_area',
    'furnishing','furnishing_details','facing','age','possession',
    'car_parking','bike_parking','parking_type','water',
    'ownership_type','construction_status'),
  'required', jsonb_build_array('bhk','plot_area')
) where code = 'tenement';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'plot_area','construction_area','bathrooms','furnishing','furnishing_details',
    'bore','garden','facing','age','water','ownership_type'),
  'hidden', jsonb_build_array('bhk'),
  'required', jsonb_build_array('plot_area')
) where code = 'farmhouse';

-- Commercial keeps its own field list; only the dead `parking` key is swapped.
update public.property_types set field_config = jsonb_set(
  field_config,
  '{fields}',
  (select jsonb_agg(x) from (
     select case when f = '"parking"'::jsonb then '"car_parking"'::jsonb else f end as x
     from jsonb_array_elements(field_config->'fields') f
   ) s)
) where code in ('office','shop','showroom')
  and field_config->'fields' @> '["parking"]'::jsonb;

-- Existing `required` behaviour preserved for everything validate.ts used to
-- hardcode, now stated as config.
update public.property_types
   set field_config = field_config || jsonb_build_object('required', jsonb_build_array('carpet_area'))
 where code in ('office','shop','showroom','godown')
   and not (field_config ? 'required');

update public.property_types
   set field_config = field_config || jsonb_build_object('required', jsonb_build_array('land_area'))
 where code in ('plot_res','plot_com','plot_agri','plot_farm')
   and not (field_config ? 'required');
