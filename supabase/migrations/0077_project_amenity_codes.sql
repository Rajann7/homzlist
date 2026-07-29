-- 0077 — a project's amenities are CODES, like a listing's.
--
-- Found while re-verifying the preview screen after the icon work (0076): every
-- amenity on every project detail and preview was still drawing the fallback
-- tick, while the same amenity on a property drew its real glyph.
--
-- The cause is in the data, not the icons. `projects.amenities` stores LABELS —
-- ["Lift","CCTV","Gym"] — because ProjectForm pushes `a.label`, while
-- `listings.amenities` stores codes — ["lift","cctv","gym"]. `amenityMeta` is
-- keyed by code, so every lookup missed: no icon, no category, and renaming an
-- amenity in admin would orphan every project that had it.
--
-- Two more consequences, both closed in the same change:
--   • Nothing validated either column. The route kept any 40 strings the browser
--     sent, so a crafted request could publish arbitrary text as an "amenity" on
--     a public page (lib/listings/service.ts sanitizeAmenities now checks both
--     listings and projects against this master list).
--   • ProjectForm sends codes now; it accepts labels on the way in only so an
--     older client can't lose a builder's selection.
--
-- Case-insensitive on the label, and only where the value is not already a
-- valid code, so re-running this is a no-op.

update public.projects p
   set amenities = (
     select array_agg(distinct coalesce(a.code, u.v))
       from unnest(p.amenities) as u(v)
       left join public.amenities a
         on lower(a.label) = lower(trim(u.v))
        and not exists (select 1 from public.amenities c where c.code = u.v)
   )
 where p.amenities is not null
   and array_length(p.amenities, 1) > 0
   and exists (
     select 1 from unnest(p.amenities) as u(v)
     where not exists (select 1 from public.amenities c where c.code = u.v)
   );
