-- ============================================================================
-- HomzList — Migration 0054: pincodes as real master data
--
-- The listing form had a free-text "Pincode (optional)" box, so the column was
-- almost always null and an area page had no postal anchor. Pincode is now
-- REQUIRED and picked from a list, which means the list has to exist: India
-- Post's directory gives every locality its pincode, and a city legitimately
-- has many (Rajkot alone has fourteen).
--
-- One pincode per row would have forced a city to pretend it has one, so the
-- relation gets its own table. `locations.pincode` stays as the node's PRIMARY
-- pincode (what an area page and an SEO title use); `location_pincodes` is the
-- full set, and is what the form's dropdown reads.
--
-- Seeded by scripts/seed-india-locations.mjs from the GeoNames IN dump
-- (CC-BY 4.0) — 36 states, 658 districts, ~7.2k talukas, ~105k cities/villages,
-- ~51k areas, 19,238 pincodes.
-- ============================================================================

create table if not exists public.location_pincodes (
  location_id uuid not null references public.locations(id) on delete cascade,
  pincode     text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  primary key (location_id, pincode)
);

-- The form asks "which pincodes does this city have?" on every render of the
-- location section, so that lookup is the one that must be indexed.
create index if not exists location_pincodes_pin_idx on public.location_pincodes (pincode);

-- Deny-all to browsers; served through the API like the rest of the master data.
alter table public.location_pincodes enable row level security;

-- ---- search support --------------------------------------------------------
-- With a hundred thousand villages in the table, a picker cannot render its
-- parent's children and let the user scroll. Both the trigram indexes
-- (migration 0030) and this prefix index are used: prefix for "starts with",
-- trigram for "contains".
create index if not exists locations_name_prefix_idx
  on public.locations (level, lower(name) text_pattern_ops);

-- A city's children are fetched by parent on every step of the cascade.
create index if not exists locations_parent_name_idx
  on public.locations (parent_id, level, name) where is_active;
