-- A7's RERA panel draws "Open Gujarat RERA portal ↗" — the link a reviewer uses
-- to check a registration number against the authority that issued it. Nothing
-- stored that URL, so the link could only ever have been a hardcoded string in a
-- component that would be wrong the moment HomzList launches in a second state.
--
-- It belongs on the STATE row: RERA is administered per state, so the portal is a
-- property of the state, and the reviewer's city walks up to it (rule 7).
alter table public.locations
  add column if not exists rera_portal_url text;

comment on column public.locations.rera_portal_url is
  'State RERA portal, used by A7 to verify a registration number. Null = no portal recorded, and A7 then draws no link rather than a wrong one.';

-- Gujarat is the only launched state today; A19 (Master Data) is where the rest
-- get added as HomzList expands.
update public.locations
   set rera_portal_url = 'https://gujrera.gujarat.gov.in'
 where level = 'state' and lower(name) = 'gujarat';
