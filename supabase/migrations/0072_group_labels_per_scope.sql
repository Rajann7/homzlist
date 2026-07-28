-- 0072 — a section is titled for the thing it is describing.
--
-- Rajan, 29 Jul 2026, on an Agriculture Land detail: "building, parking — why?"
-- He is right, and it is not one type. `field_groups` is ONE global list of
-- eight sections, so every type inherits the same eight titles no matter what
-- it actually asks for. Audited across all 13 property types and all 8 project
-- types, the titles lie in these places:
--
--   plot_res / plot_com / plot_agri / plot_farm
--     "Parking & utilities"    holds only water + electricity — no parking on a
--                              field, ever.
--     "Building & ownership"   holds facing + ownership + loan — no building.
--   pg
--     "Configuration"          holds beds / sharing / bathroom type.
--     "Construction & interiors" holds furnishing, nothing built.
--     "Building & ownership"   holds society_name alone.
--   every project type
--     "Construction & interiors" holds launch date + OC + BU permission.
--     "Building & ownership"   holds booking amount + payment plan — money
--                              filed under masonry.
--
-- Two fixes, both data:
--
--  1. `booking_amount` and `payment_plan` move to their OWN section. No title
--     could make those two right inside "Building & ownership"; they are not a
--     building fact, they are the payment terms.
--
--  2. `field_groups.scope_labels` — the same section, titled for the scope that
--     is rendering it. Resolution order (lib/listings/groupLabel.ts):
--        project:<category>  →  project  →  <category>  →  the base label
--     so a plotting scheme's water row reads "Water & power", an apartment's
--     reads "Parking & utilities", and neither needs a second group row.
--
-- Read by the detail screens AND by the creation form (both go through
-- groupLabel), so a seller fills in the same section title a buyer reads.

alter table public.field_groups
  add column if not exists scope_labels jsonb not null default '{}'::jsonb;

comment on column public.field_groups.scope_labels is
  'Section title per scope: "project:<category>" | "project" | "<category>". Resolved by lib/listings/groupLabel.ts; falls back to `label`.';

-- ---------------------------------------------------------------------------
-- 1. Payment terms get their own section
-- ---------------------------------------------------------------------------
insert into public.field_groups (key, label, sort_order, is_active, icon, tone)
values ('payment', 'Booking & payment', 9, true, 'receipt', 'accent')
on conflict (key) do update
  set label = excluded.label, icon = excluded.icon, tone = excluded.tone, is_active = true;

update public.field_definitions set "group" = 'payment'
 where key in ('booking_amount', 'payment_plan');

-- ---------------------------------------------------------------------------
-- 2. Per-scope titles
-- ---------------------------------------------------------------------------
update public.field_groups set scope_labels = '{
  "pg": "Room & occupancy"
}'::jsonb where key = 'configuration';

update public.field_groups set scope_labels = '{
  "plot": "Plot dimensions",
  "project:plot": "Site area"
}'::jsonb where key = 'area';

update public.field_groups set scope_labels = '{
  "pg": "Furnishing",
  "project": "Approvals & timeline"
}'::jsonb where key = 'construction';

update public.field_groups set scope_labels = '{
  "plot": "Water & power",
  "pg": "Facilities",
  "project:plot": "Water & power"
}'::jsonb where key = 'utilities';

update public.field_groups set scope_labels = '{
  "plot": "Ownership & approvals",
  "pg": "Building & society",
  "project": "Society & surroundings"
}'::jsonb where key = 'building';
