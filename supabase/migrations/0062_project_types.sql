-- 0062 — projects get the same treatment migration 0060 gave listings.
--
-- What was actually wrong with the project form:
--
-- 1. THERE WAS NO PROJECT TYPE. A builder posting a plotting scheme, a
--    shopping complex and an apartment tower filled in the identical five
--    steps. The form asked all three for towers and floors, and none of them
--    for the site area — the single number a buyer asks about a scheme first.
--
-- 2. Three option lists lived in the COMPONENT, not the database:
--    BUILD_STATUS, EXEMPT_REASONS and UNIT_NAMES. CLAUDE.md rule 7 names this
--    exact case. A builder with row houses had to pick a unit called "1 BHK"
--    or "Shop", because those seven strings were the whole vocabulary.
--
-- 3. "Possession" was asked of a READY project — the same contradiction
--    migration 0060 fixed on listings, in a second form nobody had looked at.
--
-- Project-specific attributes reuse `field_definitions`, `field_groups` and the
-- one show_if evaluator, so the two forms cannot drift apart again.

begin;

create table if not exists project_types (
  code        text primary key,
  label       text not null,
  category    text not null check (category in ('residential','commercial','plot','mixed')),
  -- Unit names this kind of scheme offers in its "Add unit type" sheet.
  unit_types  text[] not null default '{}',
  field_config jsonb not null default '{}'::jsonb,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table project_types enable row level security;

-- Public master data, exactly like property_types: a guest browsing projects
-- needs the labels. Writes are service-role only (no policy = no client write).
drop policy if exists project_types_read on project_types;
create policy project_types_read on project_types for select using (is_active);

alter table projects add column if not exists project_type text references project_types(code);
alter table projects add column if not exists attributes jsonb not null default '{}'::jsonb;

create index if not exists projects_project_type_idx on projects (project_type) where deleted_at is null;

-- ------------------------------------------------------- project field defs
-- `build_status` and `rera_exempt_reason` move out of the component and into
-- the same table every listing field lives in.
insert into field_definitions (key, label, control, options, placeholder, hint, "group", units, show_if, sort_order, is_active) values
  ('build_status', 'Status', 'chips',
   '[{"value":"booking_open","label":"Booking open"},{"value":"under_construction","label":"Under construction"},{"value":"ready","label":"Ready to move"}]',
   null, null, 'construction', null, null, 80, true),

  ('rera_exempt_reason', 'Exemption reason', 'select',
   '[{"value":"below_threshold","label":"Plot scheme below threshold"},{"value":"pre_rera","label":"Completed before RERA"},{"value":"other","label":"Other"}]',
   null, null, 'construction', null, null, 81, true),

  ('project_land_area', 'Total site area', 'area', '[]', null,
   'The whole scheme''s land, not one unit.', 'area', 'land', null, 82, true),

  ('open_area_percent', 'Open / green area (%)', 'number', '[]', 'e.g. 40', null, 'area', null, null, 83, true),

  ('units_per_floor', 'Units per floor', 'number', '[]', 'e.g. 4', null, 'configuration', null, null, 84, true),

  ('booking_amount', 'Booking amount (₹)', 'number', '[]', 'e.g. 51000', null, 'building', null, null, 85, true),

  ('payment_plan', 'Payment plan', 'select',
   '[{"value":"clp","label":"Construction-linked"},{"value":"dp","label":"Down payment"},{"value":"flexi","label":"Flexi"},{"value":"subvention","label":"Subvention"},{"value":"custom","label":"Custom"}]',
   null, null, 'building', null, null, 86, true),

  -- Only a finished building can hold these certificates; asking an
  -- under-construction scheme for its OC is the possession bug in reverse.
  ('oc_received', 'Occupancy Certificate received', 'toggle', '[]', null, null, 'construction', null,
   '{"field":"build_status","in":["ready"]}', 87, true),

  ('bu_permission', 'B.U. permission received', 'toggle', '[]', null, null, 'construction', null,
   '{"field":"build_status","in":["ready"]}', 88, true),

  ('launch_date', 'Launch date', 'date', '[]', null, null, 'construction', null,
   '{"field":"build_status","in":["booking_open"]}', 89, true),

  ('total_plots', 'Total plots', 'number', '[]', 'e.g. 120', null, 'configuration', null, null, 90, true)
on conflict (key) do update set
  label = excluded.label, control = excluded.control, options = excluded.options,
  placeholder = excluded.placeholder, hint = excluded.hint, "group" = excluded."group",
  units = excluded.units, show_if = excluded.show_if, sort_order = excluded.sort_order, is_active = true;

-- ------------------------------------------------------------- the 8 types
insert into project_types (code, label, category, unit_types, field_config, sort_order) values
  ('apartment', 'Apartment / Flats', 'residential',
   array['1 BHK','2 BHK','3 BHK','3 BHK Premium','4 BHK','5 BHK','Penthouse','Studio'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'units_per_floor',
       'project_land_area','open_area_percent',
       'build_status','launch_date','oc_received','bu_permission',
       'lift','car_parking','bike_parking','parking_type','power_backup','water','fire_safety',
       'gated_society','booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   1),

  ('row_house', 'Row House / Tenement scheme', 'residential',
   array['2 BHK Row House','3 BHK Row House','4 BHK Row House','Duplex'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'project_land_area','open_area_percent',
       'build_status','launch_date','oc_received','bu_permission',
       'car_parking','bike_parking','parking_type','power_backup','water',
       'road_touch','road_width','gated_society','booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   2),

  ('bungalow_scheme', 'Bungalow / Villa scheme', 'residential',
   array['3 BHK Villa','4 BHK Villa','5 BHK Villa','Twin Bungalow'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'project_land_area','open_area_percent',
       'build_status','launch_date','oc_received','bu_permission',
       'car_parking','bike_parking','parking_type','power_backup','water','garden',
       'road_touch','road_width','gated_society','booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   3),

  ('farmhouse_scheme', 'Farmhouse scheme', 'residential',
   array['1 BHK Farmhouse','2 BHK Farmhouse','3 BHK Farmhouse','Plot only'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'project_land_area','open_area_percent',
       'build_status','launch_date',
       'water','electricity','irrigation','power_backup',
       'road_touch','road_width','boundary_wall','fencing','garden',
       'booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   4),

  ('commercial_complex', 'Commercial / Office complex', 'commercial',
   array['Office','Cabin Office','Co-working Suite','Full Floor'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'units_per_floor',
       'project_land_area',
       'build_status','launch_date','oc_received','bu_permission',
       'lift','car_parking','bike_parking','parking_type','power_backup','power_load','water','fire_safety','ac',
       'road_touch','road_width','booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   5),

  ('shopping', 'Shops / Showroom scheme', 'commercial',
   array['Shop','Showroom','Mezzanine Shop','Food Court Unit'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'units_per_floor',
       'project_land_area',
       'build_status','launch_date','oc_received','bu_permission',
       'lift','car_parking','bike_parking','parking_type','power_backup','power_load','water','fire_safety',
       'road_touch','road_width','corner_plot','booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   6),

  ('plotting', 'Plotting scheme (NA plots)', 'plot',
   array['Residential Plot','Commercial Plot','Corner Plot','Farm Plot'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'total_plots',
       'project_land_area','open_area_percent',
       'build_status','launch_date',
       'na_kheti','plot_approval','land_zone','floors_allowed',
       'road_touch','road_width','boundary_wall','fencing',
       'water','electricity','gated_society','booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   7),

  ('mixed', 'Mixed use', 'mixed',
   array['1 BHK','2 BHK','3 BHK','Shop','Showroom','Office'],
   jsonb_build_object(
     'fields', jsonb_build_array(
       'units_per_floor',
       'project_land_area','open_area_percent',
       'build_status','launch_date','oc_received','bu_permission',
       'lift','car_parking','bike_parking','parking_type','power_backup','water','fire_safety',
       'gated_society','booking_amount','payment_plan'),
     'required', jsonb_build_array()),
   8)
on conflict (code) do update set
  label = excluded.label, category = excluded.category, unit_types = excluded.unit_types,
  field_config = excluded.field_config, sort_order = excluded.sort_order, is_active = true;

-- Existing projects predate the column. Every one of them is a flats scheme —
-- it was the only thing the form could describe.
update projects set project_type = 'apartment' where project_type is null;

-- The old free-text exemption reason becomes a code, so the review screen and
-- the admin queue read one vocabulary.
update projects set rera_exempt_reason = 'below_threshold' where rera_exempt_reason = 'Plot scheme below threshold';
update projects set rera_exempt_reason = 'pre_rera'        where rera_exempt_reason = 'Completed before RERA';
update projects set rera_exempt_reason = 'other'           where rera_exempt_reason = 'Other';

-- Possession on a finished project is the listing bug again — clear it.
update projects set possession_date = null where build_status = 'ready' and possession_date is not null;

commit;
