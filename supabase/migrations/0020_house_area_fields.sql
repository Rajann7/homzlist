-- ============================================================================
-- HomzList — Migration 0020: correct area fields for houses & rural land
--
-- Design-lock review (rule 5) flagged that designs/P5 groups Flat + Bungalow +
-- Tenement as `isFlatLike` — i.e. Built-up + Carpet area only, no plot. Rajan
-- asked me to research real Indian practice before changing a whole type.
--
-- Findings (99acres / civiconcepts, Jul 2026):
--   * Built-up / plinth area is how APARTMENTS are sized. INDEPENDENT houses,
--     villas and bungalows are sized by PLOT area (land) PLUS built-up, and
--     increasingly carpet (RERA). A bungalow buyer's first question is the plot
--     size — a field the flat treatment omits entirely.
--   * "Tenement" in Gujarat = a small independent / row house with its own
--     plot, not a flat. So it needs plot area too.
--
-- So the design's flat-grouping is the oversight, and the existing config was
-- half-right (it had plot but no built-up/carpet). This gives houses the real
-- independent-house set: PLOT + BUILT-UP + CARPET(optional), keeping BHK etc.
--
-- Farmhouse: Rajan approved land units. It moves to the `land_area` field
-- (Vigha/Guntha/Acre) for its rural land, keeping a metric construction area.
--
-- Mechanism: units are now a PER-FIELD property, not a per-type flag, so the
-- same form can show Vigha on the land row and sq ft on the construction row.
-- ============================================================================

-- ---- 1. per-field unit set --------------------------------------------------
-- 'land'  → sq ft / sq yard / Vigha / Guntha / Acre   (rural / plots)
-- 'built' → sq ft / sq yard / sq m                    (constructed / urban)
-- null    → falls back to the type's area_units flag (unchanged behaviour)
alter table public.field_definitions
  add column if not exists units text check (units in ('land', 'built'));

update public.field_definitions set units = 'land'  where key = 'land_area';
update public.field_definitions set units = 'built' where key in
  ('plot_area', 'construction_area', 'builtup_area', 'carpet_area');

-- ---- 2. houses: plot + built-up + carpet ------------------------------------

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','balconies','plot_area','builtup_area','carpet_area',
    'floor_count','furnishing','furnishing_details','facing','age','possession',
    'car_parking','bike_parking','parking_type','water','garden',
    'ownership_type','construction_status'),
  'required', jsonb_build_array('bhk','plot_area','builtup_area')
) where code = 'bungalow';

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'bhk','bathrooms','plot_area','builtup_area','carpet_area',
    'furnishing','furnishing_details','facing','age','possession',
    'car_parking','bike_parking','parking_type','water',
    'ownership_type','construction_status'),
  'required', jsonb_build_array('bhk','plot_area','builtup_area')
) where code = 'tenement';

-- ---- 3. farmhouse: rural land in Vigha/Guntha + metric construction ---------

update public.property_types set field_config = jsonb_build_object(
  'fields', jsonb_build_array(
    'land_area','construction_area','bathrooms','furnishing','furnishing_details',
    'bore','garden','facing','age','water','ownership_type'),
  'hidden', jsonb_build_array('bhk'),
  'required', jsonb_build_array('land_area')
) where code = 'farmhouse';

-- carpet_area hint is flat-specific ("recommended for accuracy"); on a house it
-- reads oddly, but it's harmless and stays config-editable. Left as-is.
