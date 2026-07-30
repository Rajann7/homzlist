-- A4 renders an ownership-document block with three rows the reviewer compares:
--   Doc type · Name on doc · Name on account
-- and a "⚠ Name mismatch" badge when the first two disagree.
--
-- `listings` stored the doc TYPE and the object KEY, but never the name printed
-- on the document — so the comparison the design asks a reviewer to make had
-- nothing to compare, and the mismatch badge could only ever have been
-- decoration. CLAUDE.md rule 7: build the data source rather than fake the row.
--
-- Nullable on purpose. The seller's upload step does not ask for it yet (that is
-- a Module 5 form change, recorded in docs/PENDING-INTEGRATIONS.md), so A4 shows
-- "Not captured" and withholds the badge instead of inventing a match. Every
-- existing listing therefore reads honestly rather than as "no mismatch".
alter table public.listings
  add column if not exists ownership_proof_name text;

comment on column public.listings.ownership_proof_name is
  'Name as printed on the ownership document, for A4''s name-mismatch check. Null = not captured at upload time.';
