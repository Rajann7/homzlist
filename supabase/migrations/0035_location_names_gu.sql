-- ============================================================================
-- HomzList — Migration 0035: Gujarati location names (bilingual master data)
--
-- Doc7 §166: location names are "English + Gujarati bilingual". Doc7 §108: the
-- search bar accepts "All-Indian-script Unicode input".
--
-- The plumbing for that shipped in 0030 (a trigram index on `name_gu`, and a
-- query path that never transliterates or ASCII-folds the term). But live QA
-- showed `name_gu` was NULL on all 35 rows, so a Gujarati query was accepted,
-- ran cleanly, and matched nothing — the feature was wired but not fed.
--
-- These are the real Gujarati names for the seeded Gujarat locations. The P15
-- admin master-data screen edits them from here; nothing is hardcoded in the
-- search code, which only ever reads the column.
-- ============================================================================

update public.locations l set name_gu = v.gu
from (values
  -- state
  ('state', 'Gujarat',              'ગુજરાત'),
  -- cities
  ('city',  'Rajkot',               'રાજકોટ'),
  ('city',  'Ahmedabad',            'અમદાવાદ'),
  ('city',  'Surat',                'સુરત'),
  ('city',  'Vadodara',             'વડોદરા'),
  -- Rajkot areas
  ('area',  'Mavdi',                'માવડી'),
  ('area',  'University Road',      'યુનિવર્સિટી રોડ'),
  ('area',  'Kalawad Road',         'કાલાવડ રોડ'),
  ('area',  '150 Feet Ring Road',   '૧૫૦ ફૂટ રિંગ રોડ'),
  ('area',  'Raiya Road',           'રૈયા રોડ'),
  ('area',  'Kuvadva Road',         'કુવાડવા રોડ'),
  -- Ahmedabad areas
  ('area',  'Satellite',            'સેટેલાઇટ'),
  ('area',  'Bopal',                'બોપલ'),
  ('area',  'Maninagar',            'મણિનગર'),
  ('area',  'Prahlad Nagar',        'પ્રહલાદ નગર'),
  -- Surat areas
  ('area',  'Vesu',                 'વેસુ'),
  ('area',  'Adajan',               'અડાજણ'),
  ('area',  'Piplod',               'પીપલોદ'),
  ('area',  'Pal',                  'પાલ'),
  -- Vadodara areas
  ('area',  'Alkapuri',             'અલકાપુરી'),
  ('area',  'Gotri',                'ગોત્રી'),
  ('area',  'Manjalpur',            'માંજલપુર'),
  ('area',  'Waghodia Road',        'વાઘોડિયા રોડ')
) as v(level, en, gu)
where l.level = v.level and l.name = v.en and l.name_gu is null;

-- Districts and talukas were created with the same names as their city by
-- migration 0014, so they inherit the city's Gujarati name rather than being
-- left NULL (they are searchable master data too).
update public.locations d
   set name_gu = c.name_gu
  from public.locations c
 where d.level in ('district','taluka')
   and c.level = 'city'
   and c.name = d.name
   and c.name_gu is not null
   and d.name_gu is null;
