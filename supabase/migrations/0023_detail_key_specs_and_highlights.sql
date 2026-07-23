-- ============================================================================
-- HomzList — Migration 0023: key-spec strip + highlight chips for P4 detail
--
-- designs/P4 "S1 PROPERTY DETAIL" has two blocks the app never rendered:
--
--   * the 4-tile key-spec strip  (Bedrooms · Bathrooms · Sqft · Floor)
--   * the highlight chip row     (Semi-furnished · East facing · Ready to move)
--
-- Which fields fill those blocks is a per-property-type presentation decision —
-- a Shop has no BHK, a Plot has no floor — so it belongs in the same
-- admin-editable field_config the form already reads, NOT hardcoded in the
-- detail component (CLAUDE.md §7: option lists come from a config table).
--
--   field_config.key_specs  : [{ field, label, icon }]  — max 4, in order
--   field_config.highlights : [field, ...]              — chip row, in order
--
-- Values are still resolved through field_definitions at render time, so a
-- label change in the admin config flows through to the detail screen.
-- ============================================================================

-- Bedrooms / Bathrooms / area / floor, but only where the type actually has
-- the field. `icon` names match components/ui/Icon.tsx.
with spec(field, label, icon, ord) as (
  values
    ('bhk',              'Bedrooms',  'bed',    1),
    ('bathrooms',        'Bathrooms', 'bath',   2),
    ('washrooms',        'Washrooms', 'bath',   2),
    ('builtup_area',     'Sqft',      'area',   3),
    ('carpet_area',      'Sqft',      'area',   3),
    ('plot_area',        'Sqft',      'area',   3),
    ('land_area',        'Sqft',      'area',   3),
    ('construction_area','Sqft',      'area',   3),
    ('floor',            'Floor',     'layers', 4),
    ('frontage',         'Frontage',  'layers', 4),
    ('shutter_count',    'Shutters',  'layers', 4)
),
picked as (
  select
    t.code,
    s.field, s.label, s.icon, s.ord,
    row_number() over (partition by t.code, s.ord order by s.field) as rank_in_slot
  from public.property_types t
  join spec s
    on s.field in (select jsonb_array_elements_text(t.field_config->'fields'))
),
key_specs as (
  select code,
         jsonb_agg(jsonb_build_object('field', field, 'label', label, 'icon', icon)
                   order by ord) as specs
  from picked
  where rank_in_slot = 1          -- one field per slot (first area field wins)
  group by code
)
update public.property_types t
   set field_config = jsonb_set(t.field_config, '{key_specs}', k.specs, true)
  from key_specs k
 where k.code = t.code;

-- Highlight chips: the "what is it like" fields, in the design's order.
with hl(field, ord) as (
  values ('furnishing', 1), ('facing', 2), ('possession', 3),
         ('construction_status', 4), ('age', 5), ('ownership_type', 6),
         ('occupancy', 7), ('shell_state', 8), ('na_kheti', 9)
),
picked as (
  select t.code, jsonb_agg(h.field order by h.ord) as fields
  from public.property_types t
  join hl h on h.field in (select jsonb_array_elements_text(t.field_config->'fields'))
  group by t.code
)
update public.property_types t
   set field_config = jsonb_set(t.field_config, '{highlights}', p.fields, true)
  from picked p
 where p.code = t.code;

-- Types that matched nothing still need the keys present, so the DTO never has
-- to guess whether "absent" means "not configured" or "none".
update public.property_types
   set field_config = jsonb_set(field_config, '{key_specs}', '[]'::jsonb, true)
 where field_config->'key_specs' is null;

update public.property_types
   set field_config = jsonb_set(field_config, '{highlights}', '[]'::jsonb, true)
 where field_config->'highlights' is null;
