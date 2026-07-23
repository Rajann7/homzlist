-- ============================================================================
-- HomzList — Migration 0015: the project-form fields the design asks for
--
-- P6 S5 Step 2 (add-unit sheet) collects: unit name · BUILT-UP area · CARPET
-- area · price from · UNITS AVAILABLE (stepper) · floor plan. `project_units`
-- had built-up (`area_sqft`) and a boolean `available`, but no carpet figure
-- and no per-unit count — so "Carpet 920 sqft · 12 available", which the design
-- prints on every unit card, could not be rendered from data.
--
-- Step 5 also collects a pincode alongside the location cascade; `listings`
-- already stores one, `projects` did not.
-- ============================================================================

alter table public.project_units
  add column if not exists carpet_sqft      integer check (carpet_sqft is null or carpet_sqft > 0),
  -- How many of this unit type are still on sale. `available` (boolean) stays as
  -- the on/off switch the builder flips; this is the number shown next to it.
  add column if not exists units_available  integer check (units_available is null or units_available >= 0);

alter table public.projects
  add column if not exists pincode text;
