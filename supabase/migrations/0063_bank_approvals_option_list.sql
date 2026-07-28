-- 0063 — the last hardcoded option list in the project form.
--
-- `const BANKS = ["SBI", "HDFC", …]` sat in ProjectForm.tsx. Adding a lender a
-- builder actually has a tie-up with meant a code change and a deploy, which is
-- exactly what CLAUDE.md rule 7 forbids. It becomes a field definition like
-- every other option list, so the chips and any future filter read one row.

begin;

insert into field_definitions (key, label, control, options, placeholder, hint, "group", units, show_if, sort_order, is_active) values
  ('bank_approvals', 'Approved by banks', 'multi',
   '[{"value":"SBI","label":"SBI"},{"value":"HDFC","label":"HDFC"},{"value":"ICICI","label":"ICICI"},{"value":"Axis","label":"Axis"},{"value":"Kotak","label":"Kotak"},{"value":"Bank of Baroda","label":"Bank of Baroda"},{"value":"PNB","label":"PNB"},{"value":"Canara","label":"Canara"},{"value":"Union Bank","label":"Union Bank"},{"value":"LIC HFL","label":"LIC HFL"},{"value":"Bajaj Housing","label":"Bajaj Housing"},{"value":"HDFC Ltd","label":"HDFC Ltd"}]',
   null, 'Buyers filter on the lender they already bank with.', 'building', null, null, 91, true)
on conflict (key) do update set
  label = excluded.label, control = excluded.control, options = excluded.options,
  hint = excluded.hint, "group" = excluded."group", sort_order = excluded.sort_order, is_active = true;

commit;
