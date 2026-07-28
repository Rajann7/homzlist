-- 0070 — icons and colour tones for the redesigned detail screens.
--
-- The redesign shows each section behind a tinted icon and each amenity as an
-- icon tile instead of a line of text. Both of those are per-row facts, so they
-- belong in the same config tables the sections and amenities already come from
-- (CLAUDE.md rule 7) — an admin adding an amenity picks its icon there, and no
-- component carries a hardcoded `{lift: "layers"}` map that goes stale the day
-- someone adds the 21st amenity.
--
-- `icon` is a name from the single outline set (components/ui/Icon.tsx) and
-- `tone` is a Doc1 token family — accent / info / warning / error / neutral —
-- never a hex. A row with no icon renders its fallback, so this is additive:
-- nothing breaks if a future amenity is inserted without one.

alter table public.field_groups add column if not exists icon text;
alter table public.field_groups add column if not exists tone text;
alter table public.amenities   add column if not exists icon text;

-- ---- Form sections --------------------------------------------------------
update public.field_groups set icon = 'grid',     tone = 'accent'  where key = 'configuration';
update public.field_groups set icon = 'area',     tone = 'info'    where key = 'area';
update public.field_groups set icon = 'home',     tone = 'warning' where key = 'construction';
update public.field_groups set icon = 'bulb',     tone = 'info'    where key = 'utilities';
update public.field_groups set icon = 'pin',      tone = 'accent'  where key = 'land';
update public.field_groups set icon = 'building', tone = 'neutral' where key = 'building';
update public.field_groups set icon = 'receipt',  tone = 'warning' where key = 'rental';
update public.field_groups set icon = 'shield',   tone = 'error'   where key = 'house_rules';

-- Anything an admin adds later still renders, with the neutral treatment.
update public.field_groups set icon = coalesce(icon, 'list'), tone = coalesce(tone, 'neutral');

-- ---- Amenities ------------------------------------------------------------
update public.amenities set icon = 'layers'       where code = 'lift';
update public.amenities set icon = 'home'         where code = 'covered_parking';
update public.amenities set icon = 'grid'         where code = 'open_parking';
update public.amenities set icon = 'users'        where code = 'visitor_parking';
update public.amenities set icon = 'shield'       where code = 'security';
update public.amenities set icon = 'camera'       where code = 'cctv';
update public.amenities set icon = 'alert'        where code = 'fire_safety';
update public.amenities set icon = 'bulb'         where code = 'power_backup';
update public.amenities set icon = 'phone'        where code = 'intercom';
update public.amenities set icon = 'area'         where code = 'water_24';
update public.amenities set icon = 'download'     where code = 'rainwater';
update public.amenities set icon = 'sun'          where code = 'garden';
update public.amenities set icon = 'rocket'       where code = 'play_area';
update public.amenities set icon = 'star'         where code = 'clubhouse';
update public.amenities set icon = 'heart'        where code = 'gym';
update public.amenities set icon = 'area'         where code = 'swimming_pool';
update public.amenities set icon = 'globe'        where code = 'wifi';
update public.amenities set icon = 'refund'       where code = 'laundry';
update public.amenities set icon = 'check-circle' where code = 'housekeeping';
update public.amenities set icon = 'shield'       where code = 'temple';

update public.amenities set icon = coalesce(icon, 'check');
