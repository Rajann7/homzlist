-- ============================================================================
-- HomzList — Migration 0037: the automatic response-time chip
--
-- Doc2 §11 specifies an AUTO response-time chip on a seller's profile, and the
-- P3 "Brokers & Builders" row reads "24 listings · Usually responds in 2 hours".
-- `profiles.response_label` has existed since Module 2 and was NULL on all 35
-- rows, because nothing ever computed it — so the search row honestly rendered
-- just the listing count and the design's second half never appeared.
--
-- This is the thing that computes it. Median (not mean) first-reply latency per
-- seller, over their recent threads: one all-night reply must not brand someone
-- a slow responder, and the median is what "usually" actually means.
--
-- Definition of a "first reply": the first message a seller sends in a thread
-- AFTER the other participant's first message. Threads the seller never
-- answered are deliberately EXCLUDED from the median rather than counted as
-- infinite — but a seller who has answered fewer than 3 threads gets NO label
-- at all, because two data points is not "usually".
-- ============================================================================

create or replace function public.hz_recompute_response_labels()
returns integer
language plpgsql
as $$
declare
  v_updated integer := 0;
begin
  with first_other as (
    -- The first inbound message per (thread, seller): the earliest message in
    -- that thread sent by somebody else.
    select
      tp.profile_id            as seller_id,
      m.thread_id,
      min(m.created_at)        as asked_at
    from public.thread_participants tp
    join public.chat_messages m
      on m.thread_id = tp.thread_id
     and m.sender_id <> tp.profile_id
     and not m.deleted_all
    group by tp.profile_id, m.thread_id
  ),
  first_reply as (
    -- The seller's earliest message in that thread that came AFTER it.
    select
      fo.seller_id,
      fo.thread_id,
      fo.asked_at,
      min(m.created_at) as replied_at
    from first_other fo
    join public.chat_messages m
      on m.thread_id = fo.thread_id
     and m.sender_id = fo.seller_id
     and m.created_at > fo.asked_at
     and not m.deleted_all
    group by fo.seller_id, fo.thread_id, fo.asked_at
  ),
  medians as (
    select
      seller_id,
      count(*) as answered,
      percentile_cont(0.5) within group (
        order by extract(epoch from (replied_at - asked_at)) / 60.0
      ) as median_minutes
    from first_reply
    -- Only recent behaviour: a reply time from a year ago says nothing about
    -- how this seller behaves today.
    where asked_at > now() - interval '90 days'
    group by seller_id
  ),
  labelled as (
    select
      seller_id,
      case
        -- Fewer than 3 answered threads → no claim (NULL), never a guess.
        when answered < 3 then null
        when median_minutes < 60 then
          'Usually responds in ' || greatest(round(median_minutes)::int, 1) || ' min'
        when median_minutes < 1440 then
          'Usually responds in ' || round(median_minutes / 60.0)::int || ' hour'
            || case when round(median_minutes / 60.0)::int = 1 then '' else 's' end
        else
          'Usually responds in ' || round(median_minutes / 1440.0)::int || ' day'
            || case when round(median_minutes / 1440.0)::int = 1 then '' else 's' end
      end as label
    from medians
  )
  update public.profiles p
     set response_label = l.label
    from labelled l
   where p.id = l.seller_id
     and p.response_label is distinct from l.label;

  get diagnostics v_updated = row_count;

  -- Clear the label on anyone who no longer qualifies (went quiet, or their
  -- threads aged out of the 90-day window). A stale "responds in 2 hours" on a
  -- seller who stopped replying is worse than no chip.
  update public.profiles p
     set response_label = null
   where p.response_label is not null
     and not exists (
       select 1
         from public.thread_participants tp
         join public.chat_messages m on m.thread_id = tp.thread_id
        where tp.profile_id = p.id
          and m.created_at > now() - interval '90 days'
     );

  return v_updated;
end $$;

comment on function public.hz_recompute_response_labels is
  'Doc2 §11 auto response-time chip. Median first-reply latency over the last 90 days; NULL below 3 answered threads. Called by the daily search cron.';

-- Run it once now so the column reflects the chat history that already exists.
select public.hz_recompute_response_labels();
