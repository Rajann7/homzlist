-- ============================================================================
-- A2 Dashboard — the aggregates, as SQL.
--
-- Every number on the dashboard is a GROUP BY over a table the panel does not
-- otherwise page through: seven queue depths, four metrics against the same
-- weekday a week ago, and a revenue series split three ways. Doing that from
-- the app would be ~40 PostgREST round trips per page load, and the "vs last
-- Thursday" comparison would be computed in TypeScript from rows the server
-- already had to scan — a business value derived in the client, which
-- CLAUDE.md bans outright.
--
-- All three are SECURITY DEFINER and revoked from anon/authenticated: they read
-- across every user's data, so only the service role (behind requireAdmin) may
-- call them. RLS on the underlying tables is therefore not the gate here — the
-- grant is.
--
-- "Today" is Asia/Kolkata everywhere, the same timezone the rest of the app
-- formats in. A dashboard that rolls over at UTC midnight would show "today"
-- ending at 5:30 AM local, which is simply wrong for the people reading it.
-- ============================================================================

-- ---- 1. Queue tiles (row 1) + the sidebar's badge counts --------------------
-- One row per queue: how many are waiting, and when the oldest arrived. The
-- statuses here are the queue definitions themselves — the same predicate the
-- queue SCREEN must use in P3, so tile and screen can never disagree.
create or replace function public.hz_admin_queue_tiles()
returns table (queue text, pending bigint, oldest timestamptz)
language sql stable security definer set search_path = public as $$
  select 'listings',      count(*), min(created_at) from listings      where status = 'pending_review' and deleted_at is null
  union all
  select 'requirements',  count(*), min(created_at) from requirements  where status = 'pending_review'
  union all
  select 'boosts',        count(*), min(created_at) from boosts        where status = 'pending_approval'
  union all
  select 'verifications', count(*), min(created_at) from verifications where status = 'pending'
  union all
  select 'appeals',       count(*), min(created_at) from moderation_appeals where status = 'open'
  union all
  select 'reports',       count(*), min(created_at) from reports       where status = 'open'
  union all
  select 'tickets',       count(*), min(created_at) from support_tickets where status = 'open'
$$;

revoke all on function public.hz_admin_queue_tiles() from public, anon, authenticated;

-- ---- 2. Today's stats vs the same weekday last week (row 2) -----------------
-- The design's delta is "vs last Thu", not "vs yesterday" — weekday-over-
-- weekday, because signups and payments have a strong weekly shape and a
-- Monday compared to a Sunday says nothing.
--
-- `series` is the last 7 days INCLUDING today, oldest first: the sparkline next
-- to each value. It is the same metric as the headline, so the bars and the
-- number can never drift apart.
create or replace function public.hz_admin_daily_metrics(p_days int default 7)
returns table (
  day date,
  signups bigint,
  listings_created bigint,
  inquiries bigint,
  revenue_paise bigint
)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
             (timezone('Asia/Kolkata', now())::date - (p_days - 1)),
             timezone('Asia/Kolkata', now())::date,
             interval '1 day'
           )::date as day
  )
  select
    d.day,
    (select count(*) from profiles p
       where timezone('Asia/Kolkata', p.created_at)::date = d.day),
    (select count(*) from listings l
       where timezone('Asia/Kolkata', l.created_at)::date = d.day),
    (select count(*) from inquiries i
       where timezone('Asia/Kolkata', i.created_at)::date = d.day),
    (select coalesce(sum(pay.amount_paise), 0) from payments pay
       where pay.status = 'success'
         and timezone('Asia/Kolkata', pay.created_at)::date = d.day)
  from days d
  order by d.day;
$$;

revoke all on function public.hz_admin_daily_metrics(int) from public, anon, authenticated;

-- ---- 3. Revenue series, split plan / boost / top-up (row 4) -----------------
-- The design's chart has three stacked segments and a 7d/30d/6m switch. The
-- switch is a real query per range, not a client re-slice of one payload:
--   day    → one bucket per day
--   week   → one bucket per week (30d shows five)
--   month  → one bucket per month (6m shows six)
-- Only captured payments count. A failed or pending payment is not revenue,
-- and a refunded one is revenue that was taken back — refunds are their own
-- line in A16 Finance and deliberately do not silently reduce this chart.
create or replace function public.hz_admin_revenue_series(
  p_bucket  text default 'day',
  p_buckets int  default 7
)
returns table (bucket_start date, plan_paise bigint, boost_paise bigint, topup_paise bigint)
language sql stable security definer set search_path = public as $$
  with step as (
    select case p_bucket when 'month' then interval '1 month'
                         when 'week'  then interval '1 week'
                         else interval '1 day' end as iv,
           case p_bucket when 'month' then 'month'
                         when 'week'  then 'week'
                         else 'day' end as unit
  ),
  buckets as (
    select generate_series(
             date_trunc((select unit from step),
                        timezone('Asia/Kolkata', now())) - (p_buckets - 1) * (select iv from step),
             date_trunc((select unit from step), timezone('Asia/Kolkata', now())),
             (select iv from step)
           ) as bucket_start
  ),
  paid as (
    select date_trunc((select unit from step),
                      timezone('Asia/Kolkata', pay.created_at)) as bucket_start,
           o.kind::text as kind,
           pay.amount_paise
      from payments pay
      join orders o on o.id = pay.order_id
     where pay.status = 'success'
  )
  select b.bucket_start::date,
         coalesce(sum(p.amount_paise) filter (where p.kind = 'plan'),  0),
         coalesce(sum(p.amount_paise) filter (where p.kind = 'boost'), 0),
         coalesce(sum(p.amount_paise) filter (where p.kind = 'topup'), 0)
    from buckets b
    left join paid p on p.bucket_start = b.bucket_start
   group by b.bucket_start
   order by b.bucket_start;
$$;

revoke all on function public.hz_admin_revenue_series(text, int) from public, anon, authenticated;
