-- Doc3 §1.1 defines three admin roles — Staff, Admin and Super Admin — but the
-- staff table only ever allowed 'staff' and 'admin', so a Super Admin could not
-- exist at all. Without it there is nobody to manage plans, staff, flags, audit
-- or the evidence SOP, and the "minimum 2 super admins" rule is unenforceable.
alter table public.staff drop constraint if exists staff_level_check;
alter table public.staff add constraint staff_level_check
  check (level = any (array['staff'::text, 'admin'::text, 'super'::text]));
