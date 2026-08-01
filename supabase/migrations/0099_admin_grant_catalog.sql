-- ============================================================================
-- A11 "Grant trial" needs a catalog code that exists.
--
-- FOUND BY THE P4 CHECK: `user_plans.catalog_code` is a FOREIGN KEY into
-- `plan_catalog(code)`, so the grant endpoint's invented `admin_trial` code
-- made every grant fail — a 422 behind a sheet whose success toast the design
-- draws. The existing seeded trials sidestepped it by reusing a real sellable
-- plan (p2999 / p9999), which is worse than it looks: a granted trial then
-- claims to BE the ₹2,999 plan, with that plan's terms, in every screen and
-- every report that groups by catalog_code.
--
-- So the grant gets its own catalog row. `is_active = false` keeps it off the
-- plans screen and out of checkout — it can never be bought — while giving the
-- grant a real, nameable identity and satisfying the constraint honestly.
-- Quotas are 0 because a grant carries its OWN contents, chosen in the sheet.
-- ============================================================================
insert into public.plan_catalog
  (code, kind, name, sub_label, price_paise, period_days, roles, features,
   listing_quota, requirement_quota, proposal_quota, project_quota,
   sort_order, is_active)
values
  ('admin_grant', 'plan', 'Admin grant', 'Granted by the HomzList team', 0, null,
   '{owner,broker,builder}', '{}', 0, 0, 0, 0, 999, false)
on conflict (code) do update
  set name = excluded.name,
      sub_label = excluded.sub_label,
      is_active = false;
