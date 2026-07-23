-- ============================================================================
-- HomzList — Migration 0017: ownership-proof document types
--
-- designs/P5 section H ("Add ownership proof (optional)") has a Document type
-- select. The listings table already had `ownership_proof_type` and the API
-- already accepted it — there was simply no field definition behind it, so the
-- section was never rendered and the column was always null.
--
-- Option list is exactly the design's, and lives here rather than in the
-- component so a new accepted document is a row (CLAUDE.md §7).
-- ============================================================================

insert into public.field_definitions (key, label, control, options, placeholder, hint, sort_order) values
  ('ownership_proof_type','Document type','select',
   '[{"value":"property_tax","label":"Property tax receipt"},
     {"value":"index_copy","label":"Index copy"},
     {"value":"allotment_letter","label":"Allotment letter"},
     {"value":"poa","label":"Power of Attorney"},
     {"value":"electricity_bill","label":"Electricity bill"},
     {"value":"other","label":"Other"}]'::jsonb,
   null, null, 50)
on conflict (key) do nothing;
