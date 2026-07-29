-- 0076 — icons that mean what they show.
--
-- Rajan, 29 Jul 2026: "Gym has a HEART icon — check what icon EVERY type is
-- showing, globally; don't just fix the one I pointed at."
--
-- He is right, and the heart was the least of it. Audited across all 20
-- amenities, 9 field groups and the 47 distinct key-spec entries on 13 property
-- types + 8 project types: every name is valid (nothing crashes), and the
-- MEANINGS were assigned from whatever glyph the set already had, because the
-- set had no domain vocabulary in it. What a buyer was actually reading:
--
--   gym            → heart          swimming pool → area (a square grid)
--   water (×6)     → bulb           car parking (×10) → grid
--   rainwater      → download       24h water     → area
--   laundry        → refund (↺)     lift          → layers
--   wi-fi          → globe          garden        → sun
--   play area      → rocket 🚀      housekeeping  → check-circle
--   covered/open/visitor parking → home / grid / users
--   AC             → bulb           meals, food   → home
--   furnishing     → home           temple        → shield
--
-- components/ui/Icon.tsx gains the 25 real glyphs first (car, droplet, rain,
-- dumbbell, pool, washer, elevator, wifi, tree, playground, sofa, snowflake,
-- utensils, broom, flame, ruler, height, road, temple, truck, door, sprout,
-- percent, map, balcony, shutter), all in the same 24×24 / 1.5px outline
-- family. This maps the data onto them.
--
-- Icons stay a DATABASE decision (CLAUDE.md rule 7): an admin renaming one here
-- moves every screen with no deploy, and an unknown name now falls back to a
-- dot instead of throwing.

-- ---------------------------------------------------------------------------
-- 1. Amenities — all 20
-- ---------------------------------------------------------------------------
update public.amenities set icon = v.icon
  from (values
    ('gym',             'dumbbell'),
    ('swimming_pool',   'pool'),
    ('clubhouse',       'sofa'),
    ('temple',          'temple'),
    ('wifi',            'wifi'),
    ('laundry',         'washer'),
    ('housekeeping',    'broom'),
    ('garden',          'tree'),
    ('play_area',       'playground'),
    ('lift',            'elevator'),
    ('power_backup',    'bulb'),
    ('water_24',        'droplet'),
    ('rainwater',       'rain'),
    ('intercom',        'phone'),
    ('covered_parking', 'car'),
    ('open_parking',    'car'),
    ('visitor_parking', 'car'),
    ('cctv',            'camera'),
    ('fire_safety',     'flame'),
    ('security',        'shield')
  ) as v(code, icon)
 where public.amenities.code = v.code;

-- ---------------------------------------------------------------------------
-- 2. Section headers — "Booking & payment" was sharing the rent receipt, and
--    a plot's land section reads better as a map than a map PIN.
-- ---------------------------------------------------------------------------
update public.field_groups set icon = 'card'  where key = 'payment';
update public.field_groups set icon = 'map'   where key = 'land';
update public.field_groups set icon = 'sofa'  where key = 'construction';

-- ---------------------------------------------------------------------------
-- 3. Key-spec strips — every type, both tables.
--
-- `jsonb_set` per entry would need the index; rebuilding the array with the
-- icon replaced by field name is both shorter and idempotent.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.fix_spec_icons(cfg jsonb) returns jsonb
language sql immutable as $$
  select case when cfg -> 'key_specs' is null then cfg else
    jsonb_set(cfg, '{key_specs}', (
      select coalesce(jsonb_agg(
        case coalesce(e ->> 'field', '')
          when 'car_parking'       then jsonb_set(e, '{icon}', '"car"')
          when 'bike_parking'      then jsonb_set(e, '{icon}', '"car"')
          when 'water'             then jsonb_set(e, '{icon}', '"droplet"')
          when 'irrigation'        then jsonb_set(e, '{icon}', '"droplet"')
          when 'ac'                then jsonb_set(e, '{icon}', '"snowflake"')
          when 'furnishing'        then jsonb_set(e, '{icon}', '"sofa"')
          when 'meals'             then jsonb_set(e, '{icon}', '"utensils"')
          when 'food_type'         then jsonb_set(e, '{icon}', '"utensils"')
          when 'balconies'         then jsonb_set(e, '{icon}', '"balcony"')
          when 'shutter_count'     then jsonb_set(e, '{icon}', '"shutter"')
          when 'loading_dock'      then jsonb_set(e, '{icon}', '"truck"')
          when 'cabins'            then jsonb_set(e, '{icon}', '"door"')
          when 'height'            then jsonb_set(e, '{icon}', '"height"')
          when 'frontage'          then jsonb_set(e, '{icon}', '"ruler"')
          when 'plot_length'       then jsonb_set(e, '{icon}', '"ruler"')
          when 'plot_width'        then jsonb_set(e, '{icon}', '"ruler"')
          when 'open_sides'        then jsonb_set(e, '{icon}', '"ruler"')
          when 'road_width'        then jsonb_set(e, '{icon}', '"road"')
          when 'soil_type'         then jsonb_set(e, '{icon}', '"sprout"')
          when 'land_zone'         then jsonb_set(e, '{icon}', '"map"')
          when 'na_kheti'          then jsonb_set(e, '{icon}', '"map"')
          when 'open_area_percent' then jsonb_set(e, '{icon}', '"percent"')
          when 'booking_amount'    then jsonb_set(e, '{icon}', '"card"')
          else e
        end
        order by ord), '[]'::jsonb)
      from jsonb_array_elements(cfg -> 'key_specs') with ordinality as t(e, ord)
    ))
  end;
$$;

update public.property_types set field_config = pg_temp.fix_spec_icons(field_config);
update public.project_types  set field_config = pg_temp.fix_spec_icons(field_config);
