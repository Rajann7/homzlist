-- ============================================================================
-- HomzList — Migration 0031: search filter facets (Module 8, P3-S3)
--
-- The P3 filter sheet shows DIFFERENT sections per property type:
--   Flat/Bungalow → BHK · Bathrooms · Furnishing · Floor · Facing
--   Plot          → Area unit · Road width · Corner plot
--   PG/Hostel     → Tenant type · Veg only
--   Shop/Office   → Carpet area · Washrooms
--
-- All of that already exists as real config — `property_types.field_config
-- .fields` says which fields a type has, `field_definitions` says what the
-- control and options are. The filter sheet therefore needs NO hardcoded chip
-- list; it intersects the selected types' field lists with the facets below.
--
-- What this table adds that field_definitions cannot answer: a FILTER is not a
-- FORM. Creating a listing types an exact road width ("30" ft) into a number
-- box; filtering picks a bucket ("30 ft", meaning 25-35). So numeric fields
-- need search buckets, and only some fields are worth filtering on at all.
-- That is a search concern, so it lives in its own table rather than polluting
-- the creation form's config.
-- ============================================================================

create table if not exists public.search_filter_facets (
  field_key   text primary key references public.field_definitions(key) on delete cascade,
  -- Section heading in the sheet. Overrides field_definitions.label when the
  -- search wording differs from the form wording ("Tenant type" vs "PG for").
  label       text,
  -- How the sheet renders it. 'chips' = multi-select from options/buckets,
  -- 'toggle' = a single on/off row, 'range' = the dual slider.
  control     text not null check (control in ('chips','toggle','range')),
  -- For numeric fields: the search buckets. Each is {label, min, max} with
  -- either bound nullable (open-ended). NULL → use field_definitions.options.
  buckets     jsonb,
  -- Where in `listings` the value is compared. 'attribute' = attributes->>key,
  -- 'column' = a real column (area_sqft, price_paise).
  source      text not null default 'attribute' check (source in ('attribute','column')),
  column_name text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists search_filter_facets_order_idx
  on public.search_filter_facets (sort_order) where is_active;

drop trigger if exists search_filter_facets_updated_at on public.search_filter_facets;
create trigger search_filter_facets_updated_at before update on public.search_filter_facets
  for each row execute function public.set_updated_at();

-- RLS: deny-all to browser roles; the server reads it with the service role.
alter table public.search_filter_facets enable row level security;

-- ---- the facets the P3 sheet shows ----------------------------------------
-- Only rows whose field_key actually exists in field_definitions are inserted,
-- so this stays correct if the master data is trimmed later.
insert into public.search_filter_facets (field_key, label, control, buckets, source, column_name, sort_order)
select v.field_key, v.label, v.control, v.buckets::jsonb, v.source, v.column_name, v.sort_order
from (values
  -- Residential (design: revealed by Flat/Bungalow/Tenement/Farmhouse)
  ('bhk',              'BHK',            'chips',  null,                                                                      'attribute', null, 10),
  ('bathrooms',        'Bathrooms',      'chips',  null,                                                                      'attribute', null, 20),
  ('furnishing',       'Furnishing',     'chips',  null,                                                                      'attribute', null, 30),
  ('floor',            'Floor',          'chips',  '[{"label":"Ground","min":0,"max":0},{"label":"1-3","min":1,"max":3},{"label":"4-7","min":4,"max":7},{"label":"8+","min":8,"max":null}]', 'attribute', null, 40),
  ('facing',           'Facing',         'chips',  null,                                                                      'attribute', null, 50),
  -- Plot / land (design: Area unit, Road width, Corner plot)
  ('land_area',        'Plot size',      'chips',  '[{"label":"< 1,000 sqft","min":null,"max":1000},{"label":"1,000-2,000","min":1000,"max":2000},{"label":"2,000-5,000","min":2000,"max":5000},{"label":"5,000+","min":5000,"max":null}]', 'attribute', null, 60),
  ('road_width',       'Road width',     'chips',  '[{"label":"20 ft","min":null,"max":24},{"label":"30 ft","min":25,"max":35},{"label":"40 ft+","min":36,"max":null}]', 'attribute', null, 70),
  ('corner_plot',      'Corner plot only','toggle', null,                                                                     'attribute', null, 80),
  -- PG / hostel (design: Tenant type, Veg only)
  ('pg_for',           'Tenant type',    'chips',  null,                                                                      'attribute', null, 90),
  ('meals',            'Veg meals only', 'toggle', null,                                                                      'attribute', null, 100),
  -- Commercial (design: Carpet area, Washrooms)
  ('carpet_area',      'Carpet area',    'chips',  '[{"label":"< 500 sqft","min":null,"max":500},{"label":"500-1,000","min":500,"max":1000},{"label":"1,000+","min":1000,"max":null}]', 'attribute', null, 110),
  ('washrooms',        'Washrooms',      'chips',  null,                                                                      'attribute', null, 120),
  -- Cross-type "More" toggles the design lists at the bottom of the sheet
  ('construction_status','New construction only','toggle', null,                                                              'attribute', null, 130)
) as v(field_key, label, control, buckets, source, column_name, sort_order)
where exists (select 1 from public.field_definitions fd where fd.key = v.field_key)
on conflict (field_key) do update
  set label = excluded.label, control = excluded.control, buckets = excluded.buckets,
      source = excluded.source, column_name = excluded.column_name, sort_order = excluded.sort_order;
