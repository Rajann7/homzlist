-- 0068 — area units become a TABLE.
--
-- CLAUDE.md rule 7 in the one place it was still being broken: the unit list a
-- seller picks from ("sq ft", "Vigha", "Guntha"…) lived in
-- components/listings/FormControls.tsx as two hardcoded arrays, the conversion
-- factors lived in lib/listings/validate.ts as a third copy, and when the feed
-- card started rendering "50 Vigha" it needed a FOURTH. Adding a unit meant
-- editing three files that could each disagree with the others.
--
-- One row per unit now carries everything: the label the form shows, which set
-- it belongs to (a farmhouse's land row offers Vigha, a flat's built-up row
-- does not), the order, and the sq-ft factor every comparison runs on.
--
-- `sqft_factor` is the same number that was in SQFT_PER — nothing is being
-- re-defined here, it is being moved somewhere a human can change it.

begin;

create table if not exists area_units (
  code        text primary key,
  label       text not null,
  -- 'land'  → offered on land/plot/site rows (Vigha, Guntha, Acre…)
  -- 'built' → offered on built-up/carpet rows (metric only)
  -- 'both'  → offered on either
  unit_set    text not null check (unit_set in ('land', 'built', 'both')),
  sqft_factor numeric not null check (sqft_factor > 0),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table area_units enable row level security;

-- Public master data, exactly like property_types: a guest reading a card needs
-- the label. Writes are service-role only (no policy = no client write).
drop policy if exists area_units_read on area_units;
create policy area_units_read on area_units for select using (is_active);

insert into area_units (code, label, unit_set, sqft_factor, sort_order) values
  ('sqft',    'sq ft',   'both',  1,        1),
  ('sqyd',    'sq yard', 'both',  9,        2),
  ('sqm',     'sq m',    'built', 10.7639,  3),
  ('guntha',  'Guntha',  'land',  1089,     4),
  ('vigha',   'Vigha',   'land',  17424,    5),  -- Gujarat vigha ≈ 16 guntha
  ('acre',    'Acre',    'land',  43560,    6),
  ('hectare', 'Hectare', 'land',  107639,   7)
on conflict (code) do update set
  label = excluded.label, unit_set = excluded.unit_set,
  sqft_factor = excluded.sqft_factor, sort_order = excluded.sort_order, is_active = true;

commit;
