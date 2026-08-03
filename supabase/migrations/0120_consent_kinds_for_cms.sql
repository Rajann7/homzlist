-- Re-acceptance could never be recorded.
--
-- `auth_consents.kind` was constrained to the three signup consents
-- ('age18','dpdp','tc') back in 0001. P12's interstitial records consent PER
-- LEGAL PAGE, keyed by the page's slug — 'terms', 'privacy', … — so every
-- insert it made was rejected by the CHECK, and because acceptLegal() ignored
-- the insert error the endpoint answered 200 while writing nothing. The gate
-- would have come back on the user's very next page load, for ever.
--
-- The constraint stays (kind is not free text), widened to the CMS slug shape.
-- A subquery against cms_pages is not allowed in a CHECK, so the rule is the
-- shape: lowercase, hyphenated, ≤ 40 chars.

alter table public.auth_consents drop constraint if exists auth_consents_kind_check;
alter table public.auth_consents
  add constraint auth_consents_kind_check
  check (
    kind in ('age18', 'dpdp', 'tc')
    or (kind ~ '^[a-z][a-z0-9-]{1,39}$')
  );

comment on column public.auth_consents.kind is
  'Signup consents (age18/dpdp/tc) or a cms_pages.slug for a versioned legal re-acceptance (P12 S3e).';
