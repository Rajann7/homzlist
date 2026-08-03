-- The "Choose a category" sheet shows SEVEN rows (P12). There is an eighth
-- category — Grievance complaint — which the design never puts in the sheet:
-- it is set for you when you arrive from the Grievance Officer page's "Raise a
-- grievance" button, because a grievance carries a different SLA (24h ack,
-- 15-day resolution) and should be reached deliberately, not picked off a list.
--
-- `is_active = false` would be the wrong way to express that: the category is
-- perfectly active, it just is not offered in the picker. So it gets its own
-- flag, and the sheet query filters on this instead of on a magic sort_order.
alter table public.ticket_categories
  add column if not exists show_in_picker boolean not null default true;
