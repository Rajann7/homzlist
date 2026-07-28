-- 0061 — the buy/rent side of migration 0060.
--
-- 15 fields were added to the creation form; a seller can now state a power
-- backup, a bank-loan approval, a loading dock, a land-use zone. None of that
-- is worth collecting if no buyer can filter on it, so each one that a buyer
-- would plausibly search by gets a facet. `buckets` stays null — a chips facet
-- with no buckets reads its options straight out of `field_definitions`, so
-- these can never drift from the form's own option lists.

begin;

insert into search_filter_facets (field_key, label, control, buckets, source, column_name, sort_order, is_active) values
  ('power_backup',   'Power backup',   'chips',  null, 'attribute', null, 120, true),
  ('kitchen_type',   'Kitchen',        'chips',  null, 'attribute', null, 121, true),
  ('pet_allowed',    'Pets allowed',   'toggle', null, 'attribute', null, 122, true),
  ('loan_available', 'Bank loan',      'toggle', null, 'attribute', null, 123, true),
  ('fire_safety',    'Fire safety',    'toggle', null, 'attribute', null, 124, true),
  ('mezzanine',      'Mezzanine',      'toggle', null, 'attribute', null, 125, true),
  ('loading_dock',   'Loading dock',   'toggle', null, 'attribute', null, 126, true),
  ('office_space',   'Office cabin',   'toggle', null, 'attribute', null, 127, true),
  ('land_zone',      'Land-use zone',  'chips',  null, 'attribute', null, 128, true),
  ('irrigation',     'Irrigation',     'chips',  null, 'attribute', null, 129, true),
  ('visitor_policy', 'Visitors',       'chips',  null, 'attribute', null, 130, true)
on conflict (field_key) do update set
  label = excluded.label, control = excluded.control, buckets = excluded.buckets,
  source = excluded.source, sort_order = excluded.sort_order, is_active = true;

-- `bore` was retired in 0060 (the `water` chip row already offers Bore / Both,
-- and farmland uses `irrigation`). Its facet and the values it left behind on
-- existing rows go with it — a filter nothing can set, over data no form can
-- produce, is a dead control that still costs a query.
update search_filter_facets set is_active = false where field_key = 'bore';
update listings set attributes = attributes - 'bore' where attributes ? 'bore';

commit;
