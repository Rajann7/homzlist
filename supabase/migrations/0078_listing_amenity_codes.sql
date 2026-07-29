-- 0078 — the same amenity repair, for listings.
--
-- 0077 fixed projects; checking the other side found three live listings
-- carrying LABELS too — ["Lift","Covered parking","24×7 Security"] instead of
-- ["lift","covered_parking","security"] — because ListingForm's chips were also
-- keyed by label. Those tiles drew the fallback tick on the detail screen, and
-- worse: opening such a listing for edit compared labels against codes, so the
-- form re-opened with NONE of the seller's amenities selected, and saving from
-- there would have wiped them.
--
-- Both forms work in codes now, `sanitizeAmenities` converts anything a stale
-- client still sends, and this repairs what is already stored. Idempotent: only
-- values that are not already valid codes are touched.

update public.listings p
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
