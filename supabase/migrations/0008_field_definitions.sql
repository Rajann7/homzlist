-- ============================================================================
-- HomzList — Migration 0008: field definitions + amenities as DATA
--
-- Doc2 §5.1 requires "new types = config only". Until now the SERVER decided
-- which fields a property type shows, but the OPTIONS inside each field (BHK
-- values, furnishing levels, facing directions, parking, ownership, PG rules…)
-- were hardcoded in a React file — so adding one option still needed a code
-- change and a deploy.
--
-- These tables move that last piece into the database. The form becomes a pure
-- renderer of what the server sends.
-- ============================================================================

create table if not exists public.field_definitions (
  key          text primary key,            -- 'bhk', 'furnishing', 'land_area' …
  label        text not null,
  -- How the client renders it: chips | select | toggle | number | text | area
  control      text not null check (control in ('chips','select','toggle','number','text','area')),
  options      jsonb not null default '[]'::jsonb,   -- [{value,label}, …]
  placeholder  text,
  hint         text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Amenity master list (Doc2 §5.1). Grouped so the picker can section them.
create table if not exists public.amenities (
  code       text primary key,
  label      text not null,
  category   text not null default 'general',
  -- Which property categories offer it; empty = all.
  categories text[] not null default '{}',
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

drop trigger if exists field_definitions_updated_at on public.field_definitions;
create trigger field_definitions_updated_at before update on public.field_definitions
  for each row execute function public.set_updated_at();

-- ---- seed: exactly the definitions previously hardcoded in fields.tsx ------
insert into public.field_definitions (key, label, control, options, placeholder, hint, sort_order) values
  ('bhk','BHK','chips','[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5+","label":"5+"}]',null,null,1),
  ('bathrooms','Bathrooms','chips','[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4+","label":"4+"}]',null,null,2),
  ('balconies','Balconies','chips','[{"value":"0","label":"0"},{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3+","label":"3+"}]',null,null,3),
  ('floor','Floor','number','[]','4',null,4),
  ('total_floors','Total floors','number','[]','7',null,5),
  ('floor_count','Floors','number','[]','2',null,6),
  ('furnishing','Furnishing','chips','[{"value":"unfurnished","label":"Unfurnished"},{"value":"semi","label":"Semi-furnished"},{"value":"full","label":"Fully furnished"}]',null,null,7),
  ('furnishing_details','What''s included','select','[{"value":"AC","label":"AC"},{"value":"Wardrobe","label":"Wardrobe"},{"value":"Fridge","label":"Fridge"},{"value":"Geyser","label":"Geyser"},{"value":"Washing machine","label":"Washing machine"},{"value":"Modular kitchen","label":"Modular kitchen"},{"value":"Beds","label":"Beds"},{"value":"Sofa","label":"Sofa"}]',null,null,8),
  ('lift','Lift','toggle','[]',null,null,9),
  ('parking','Parking','select','[{"value":"none","label":"None"},{"value":"2w","label":"2-wheeler"},{"value":"4w","label":"4-wheeler"},{"value":"both","label":"Both"},{"value":"covered","label":"Covered"},{"value":"open","label":"Open"}]',null,null,10),
  ('maintenance','Maintenance (₹/month)','number','[]','1500',null,11),
  ('society_name','Society name','text','[]','Green Valley Heights',null,12),
  ('facing','Facing','select','[{"value":"East","label":"East"},{"value":"West","label":"West"},{"value":"North","label":"North"},{"value":"South","label":"South"},{"value":"North-East","label":"North-East"},{"value":"North-West","label":"North-West"},{"value":"South-East","label":"South-East"},{"value":"South-West","label":"South-West"}]',null,null,13),
  ('age','Age of property','select','[{"value":"new","label":"New construction"},{"value":"0-1","label":"Under 1 year"},{"value":"1-5","label":"1-5 years"},{"value":"5-10","label":"5-10 years"},{"value":"10+","label":"10+ years"}]',null,null,14),
  ('water','Water source','chips','[{"value":"bore","label":"Bore"},{"value":"municipal","label":"Municipal"},{"value":"both","label":"Both"}]',null,null,15),
  ('garden','Garden','toggle','[]',null,null,16),
  ('bore','Bore well','toggle','[]',null,null,17),
  ('construction_status','Construction status','chips','[{"value":"new","label":"New construction"},{"value":"resale","label":"Resale"}]',null,null,18),
  ('ownership_type','Ownership','select','[{"value":"Freehold","label":"Freehold"},{"value":"Leasehold","label":"Leasehold"},{"value":"POA","label":"POA"}]',null,null,19),
  ('plot_area','Plot area','area','[]',null,'Converted automatically for search',20),
  ('construction_area','Construction area','area','[]',null,'Converted automatically for search',21),
  ('carpet_area','Carpet area','area','[]',null,'Converted automatically for search',22),
  ('land_area','Land area','area','[]',null,'Converted automatically for search',23),
  ('washrooms','Washrooms','chips','[{"value":"0","label":"0"},{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3+","label":"3+"}]',null,null,24),
  ('shell_state','Shell state','chips','[{"value":"bare","label":"Bare shell"},{"value":"warm","label":"Warm shell"},{"value":"fitted","label":"Fully fitted"}]',null,null,25),
  ('frontage','Frontage (ft)','number','[]','20',null,26),
  ('height','Height (ft)','number','[]','18',null,27),
  ('shutter_count','Shutters','number','[]','2',null,28),
  ('power_load','Power load (KW)','number','[]','25',null,29),
  ('na_kheti','Land classification','chips','[{"value":"na","label":"NA"},{"value":"kheti","label":"Kheti"}]',null,null,30),
  ('road_touch','Road touch','toggle','[]',null,null,31),
  ('road_width','Road width (ft)','number','[]','30',null,32),
  ('corner_plot','Corner plot','toggle','[]',null,null,33),
  ('fencing','Fencing','toggle','[]',null,null,34),
  ('pg_for','PG for','chips','[{"value":"boys","label":"Boys"},{"value":"girls","label":"Girls"},{"value":"any","label":"Anyone"}]',null,null,35),
  ('occupancy','Occupancy','chips','[{"value":"single","label":"Single"},{"value":"double","label":"Double"},{"value":"triple","label":"Triple"},{"value":"dorm","label":"Dormitory"}]',null,null,36),
  ('meals','Meals included','toggle','[]',null,null,37),
  ('ac','AC','toggle','[]',null,null,38),
  ('notice_period','Notice period','select','[{"value":"15d","label":"15 days"},{"value":"1m","label":"1 month"},{"value":"2m","label":"2 months"}]',null,null,39),
  ('rules','House rules','text','[]','No smoking, gate closes at 11pm',null,40),
  ('deposit','Security deposit (₹)','number','[]','50000',null,41),
  ('available_from','Available from','text','[]','YYYY-MM-DD',null,42),
  ('maintenance_included','Maintenance included in rent','toggle','[]',null,null,43),
  ('tenant_preference','Tenant preference','select','[{"value":"Family","label":"Family"},{"value":"Bachelors","label":"Bachelors"},{"value":"Company","label":"Company"},{"value":"Veg only","label":"Veg only"}]',null,null,44)
on conflict (key) do nothing;

insert into public.amenities (code, label, category, categories, sort_order) values
  ('lift','Lift','building','{residential,commercial}',1),
  ('covered_parking','Covered parking','parking','{}',2),
  ('open_parking','Open parking','parking','{}',3),
  ('security','24×7 Security','safety','{}',4),
  ('cctv','CCTV','safety','{}',5),
  ('power_backup','Power backup','building','{}',6),
  ('water_24','24hr water','building','{residential,pg}',7),
  ('garden','Garden','outdoor','{residential}',8),
  ('play_area','Children play area','outdoor','{residential}',9),
  ('gym','Gym','lifestyle','{residential}',10),
  ('clubhouse','Clubhouse','lifestyle','{residential}',11),
  ('swimming_pool','Swimming pool','lifestyle','{residential}',12),
  ('temple','Temple','lifestyle','{residential}',13),
  ('rainwater','Rainwater harvesting','building','{}',14),
  ('visitor_parking','Visitor parking','parking','{residential}',15),
  ('intercom','Intercom','building','{residential}',16),
  ('fire_safety','Fire safety','safety','{residential,commercial}',17),
  ('wifi','Wi-Fi','lifestyle','{pg}',18),
  ('laundry','Laundry','lifestyle','{pg}',19),
  ('housekeeping','Housekeeping','lifestyle','{pg}',20)
on conflict (code) do nothing;

-- ---- RLS (deny-all to browsers; served through the API) --------------------
alter table public.field_definitions enable row level security;
alter table public.amenities         enable row level security;
