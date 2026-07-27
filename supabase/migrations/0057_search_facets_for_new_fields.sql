-- ============================================================================
-- HomzList — Migration 0057: the buy side catches up with the sell side
--
-- Migration 0055 gave every property type the fields it was missing. The filter
-- sheet is built from `search_filter_facets`, which was never extended, so a
-- buyer could not filter on any of them — and, worse, could not filter on
-- BUILT-UP AREA at all, which is the primary area for every residential type
-- and the number the price-per-sqft line is computed from.
--
-- `forTypes` is derived from each type's field list (lib/search/filters.ts), so
-- adding a row here reveals the facet on exactly the types that ask for it —
-- Shell state appears under Office/Shop/Showroom/Godown and nowhere else.
-- ============================================================================

insert into public.search_filter_facets (field_key, label, control, buckets, source, sort_order) values
  -- The one that mattered most: residential listings are compared on built-up.
  ('builtup_area', 'Built-up area', 'chips',
   '[{"label":"< 600 sqft","min":null,"max":600},
     {"label":"600-1,000","min":600,"max":1000},
     {"label":"1,000-1,500","min":1000,"max":1500},
     {"label":"1,500-2,500","min":1500,"max":2500},
     {"label":"2,500+","min":2500,"max":null}]'::jsonb, 'attribute', 15),
  ('plot_area', 'Plot area', 'chips',
   '[{"label":"< 1,000 sqft","min":null,"max":1000},
     {"label":"1,000-2,000","min":1000,"max":2000},
     {"label":"2,000-5,000","min":2000,"max":5000},
     {"label":"5,000+","min":5000,"max":null}]'::jsonb, 'attribute', 16),

  -- Condition and provenance — the first questions on any resale.
  ('construction_status', 'Construction', 'chips', null, 'attribute', 32),
  ('age',                 'Age',          'chips', null, 'attribute', 34),
  ('ownership_type',      'Ownership',    'chips', null, 'attribute', 36),
  ('flooring',            'Flooring',     'chips', null, 'attribute', 38),

  -- Residential extras.
  ('extra_rooms',   'Extra rooms',       'chips',  null, 'attribute', 42),
  ('balconies',     'Balconies',         'chips',  null, 'attribute', 44),
  ('car_parking',   'Car parking',       'chips',
   '[{"label":"1+","min":1,"max":null},{"label":"2+","min":2,"max":null},{"label":"3+","min":3,"max":null}]'::jsonb,
   'attribute', 46),
  ('lift',          'Lift',              'toggle', null, 'attribute', 48),
  ('gated_society', 'Gated society only','toggle', null, 'attribute', 50),

  -- Commercial.
  ('shell_state', 'Shell state', 'chips', null, 'attribute', 62),
  ('ac',          'Air conditioned', 'toggle', null, 'attribute', 64),
  ('frontage',    'Frontage', 'chips',
   '[{"label":"< 15 ft","min":null,"max":15},{"label":"15-25 ft","min":15,"max":25},{"label":"25+ ft","min":25,"max":null}]'::jsonb,
   'attribute', 66),

  -- Plot / land.
  ('na_kheti',      'Land classification', 'chips',  null, 'attribute', 72),
  ('plot_approval', 'Approval',            'chips',  null, 'attribute', 74),
  ('road_touch',    'Road touch only',     'toggle', null, 'attribute', 76),
  ('open_sides',    'Open sides',          'chips',  null, 'attribute', 78),
  ('boundary_wall', 'Boundary wall',       'toggle', null, 'attribute', 80),

  -- PG / Hostel.
  ('occupancy',      'Occupancy', 'chips', null, 'attribute', 92),
  ('bathroom_type',  'Bathroom',  'chips', null, 'attribute', 94),
  ('food_type',      'Food',      'chips', null, 'attribute', 96)
on conflict (field_key) do update set
  label = excluded.label, control = excluded.control, buckets = excluded.buckets,
  source = excluded.source, sort_order = excluded.sort_order, is_active = true;

-- "Veg meals only" is now covered properly by `food_type` (Veg only / Veg &
-- Non-veg); the toggle beside it asked a different question with the same words.
update public.search_filter_facets set label = 'Meals included' where field_key = 'meals';
