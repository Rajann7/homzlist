-- 0095 added `staff.name` without knowing 0088 had already added `display_name`
-- and populated it for every seat. Two columns holding the same fact is how the
-- panel and the audit trail end up disagreeing about an admin's name, so drop
-- the newcomer: `display_name` is the one with data and the one A25 renders.
alter table public.staff drop column if exists name;

-- Same class of overlap, resolved in code rather than schema: `is_active`
-- (0019) and `state` (0088, 'active' | 'pending') both describe a seat. The
-- gate is `is_active` — isStaff(), the new staff_active_needs_email constraint
-- and every permission check read it; `state` only distinguishes an invited
-- seat that has never signed in ("Pending first login" in A25). Keep them in
-- step so a pending seat can never be treated as live.
update public.staff set state = 'pending' where not is_active and state = 'active' and last_login_at is null;
