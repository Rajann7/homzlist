-- Ticket numbers need a real allocator.
--
-- The first attempt counted the rows and added one. That is wrong twice over:
-- the numbers already in the table were not allocated contiguously (seeds,
-- deletions), so `2800 + count + 1` lands on a number that already exists and
-- the unique index rejects the insert — which surfaced live as "Submit ticket"
-- doing nothing at all, for every user. And even with a correct starting point,
-- read-then-write races between two concurrent submissions.
--
-- A sequence solves both. It is started past whatever is already in the table,
-- so it can never collide with the seeded rows, and nextval() is atomic.

do $$
declare max_n bigint;
begin
  select coalesce(max(nullif(regexp_replace(number, '^TKT-', ''), '')::bigint), 2840)
    into max_n
    from public.support_tickets
   where number ~ '^TKT-[0-9]+$';

  if not exists (select 1 from pg_class where relname = 'ticket_number_seq' and relkind = 'S') then
    execute format('create sequence public.ticket_number_seq start with %s', max_n + 1);
  else
    execute format('select setval(''public.ticket_number_seq'', %s, true)', greatest(max_n, 2840));
  end if;
end $$;

create or replace function public.hz_next_ticket_number()
returns text language sql volatile set search_path = public as $$
  select 'TKT-' || nextval('public.ticket_number_seq')::text;
$$;
revoke all on function public.hz_next_ticket_number() from public;
