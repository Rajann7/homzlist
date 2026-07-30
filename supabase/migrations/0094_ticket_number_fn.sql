-- 0094 — next_ticket_number()
--
-- P12 promises a ticket number the instant you submit, and the number is
-- human-facing (#TKT-2841). Allocating it from a Postgres sequence inside the
-- database — rather than reading a max() and adding one in application code —
-- is what makes two simultaneous submissions impossible to collide.
--
-- SECURITY DEFINER with a pinned search_path, and EXECUTE granted only to the
-- service role: the anon/authenticated roles cannot burn sequence values.

create or replace function public.next_ticket_number()
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select 'TKT-' || nextval('public.support_ticket_seq')::text;
$$;

revoke all on function public.next_ticket_number() from public, anon, authenticated;
grant execute on function public.next_ticket_number() to service_role;
