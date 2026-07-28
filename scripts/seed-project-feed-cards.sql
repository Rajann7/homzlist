-- Dev seed: give the home feed a real spread of PROJECT cards.
--
-- The redesigned project card renders whatever the scheme actually filled in
-- (type, price band, unit names, possession, plots/towers/floors/units, site
-- area). Before this, DEV had four live projects — all of them typed
-- 'apartment' by migration 0062's backfill, only one with any project_units at
-- all — so three of the card's blocks had no row to prove them.
--
-- This lifts two of the create-flow QA schemes (a plotting scheme and a shops
-- scheme, both written by the updated form, both carrying real `attributes`)
-- to live and gives every live project its units. Nothing here is invented for
-- the UI: it is dev content in the same shape the form writes.
--
-- Run:  node scripts/q.mjs -f scripts/seed-project-feed-cards.sql

begin;

-- ---- the two QA schemes go live, with a cover -------------------------------
update projects set
  status   = 'live',
  live_at  = now() - interval '3 hours',
  cover_url = 'https://basghvdzdplrluhczvkl.supabase.co/storage/v1/object/public/listing-photos/demo/land-0.jpg'
where name = 'QA Plotting Scheme Rajkot';

update projects set
  status   = 'live',
  live_at  = now() - interval '6 hours',
  cover_url = 'https://basghvdzdplrluhczvkl.supabase.co/storage/v1/object/public/listing-photos/demo/shop-0.jpg',
  total_units = 60,
  available_units = 18,
  towers = 1,
  floors = 4
where name = 'QA Shopping Scheme Rajkot';

-- ---- units (the price band + the unit chips read these) ---------------------
delete from project_units where project_id in (
  select id from projects where name in (
    'QA Plotting Scheme Rajkot','QA Shopping Scheme Rajkot',
    'Green Meadows Villas','Skyline Business Hub','Skyline Elegance'));

insert into project_units (project_id, unit_type, area_sqft, carpet_sqft, price_from_paise, units_available, available, position)
select p.id, u.unit_type, u.area_sqft, u.carpet_sqft, u.price_paise, u.units_available, u.available, u.position
from projects p
join (values
  ('QA Plotting Scheme Rajkot', 'Residential Plot', 1800, null::int, 3200000000::bigint, 64, true,  0),
  ('QA Plotting Scheme Rajkot', 'Corner Plot',      2400, null::int, 5100000000::bigint, 12, true,  1),
  ('QA Plotting Scheme Rajkot', 'Farm Plot',        4000, null::int, 7800000000::bigint,  6, true,  2),
  ('QA Shopping Scheme Rajkot', 'Shop',              450, 400,       2800000000::bigint, 10, true,  0),
  ('QA Shopping Scheme Rajkot', 'Showroom',         1200, 1050,      9500000000::bigint,  4, true,  1),
  ('QA Shopping Scheme Rajkot', 'Mezzanine Shop',    700, 620,       4200000000::bigint,  4, false, 2),
  ('Green Meadows Villas',      '3 BHK Villa',      2100, 1750,      8500000000::bigint,  4, true,  0),
  ('Green Meadows Villas',      '4 BHK Villa',      2800, 2350,     11500000000::bigint,  3, true,  1),
  ('Skyline Business Hub',      'Office',            900, 780,       5200000000::bigint, 40, true,  0),
  ('Skyline Business Hub',      'Full Floor',       4200, 3600,     22000000000::bigint,  4, true,  1),
  ('Skyline Elegance',          '2 BHK',            1150, 950,       4800000000::bigint, 24, true,  0),
  ('Skyline Elegance',          '3 BHK',            1580, 1310,      7200000000::bigint, 14, true,  1),
  ('Skyline Elegance',          '4 BHK',            2050, 1720,     10500000000::bigint,  4, true,  2)
) as u(project_name, unit_type, area_sqft, carpet_sqft, price_paise, units_available, available, position)
  on u.project_name = p.name;

commit;
