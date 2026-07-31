-- ============================================================================
-- P3 — the six review queues, as views.
--
-- The list engine (lib/admin/list-query.ts) resolves every control to SQL on
-- ONE relation: a filter is `.eq()`, a sort is `.order()`, a search is
-- `.or(ilike)`. The queues need the poster's name, the location label, the
-- cover photo and a risk score — all of which live in other tables. Embedding
-- them in the select (`profiles!inner(name)`) would render fine and then
-- silently fail to sort or search on any of it, which is exactly the "control
-- that renders but controls nothing" §3 forbids.
--
-- So each queue is a view that flattens what its screen draws. The engine gets
-- real columns; the screens get the design's columns; nothing is filtered in
-- the browser.
--
-- RISK SCORE — Doc3: "new account +2, prior reject +2, number-pattern flag +3,
-- reported +3 → sorted high-first + red mark." It is computed here, once, so
-- the queue's badge, the review screen's breakdown and the default sort are the
-- same number. The design's own example adds to 7 (new account + number
-- pattern + prior rejection), which this reproduces exactly.
--
-- SECURITY. `security_invoker = true` so a view can never become a way around
-- the RLS of the table under it, and every view is revoked from anon and
-- authenticated: these are read by the service role behind requireAdmin, and by
-- nothing else.
-- ============================================================================

-- ---- helper: is there a number pattern in this text? -----------------------
-- The blocklist's own `number_patterns` rows are the source of truth (A19 edits
-- them), so moderation and this score cannot drift apart.
create or replace function public.hz_has_number_pattern(p_text text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from number_patterns np
     where np.is_active
       and coalesce(p_text, '') ~ np.pattern
  );
$$;

revoke all on function public.hz_has_number_pattern(text) from public, anon, authenticated;

-- ---- A3 · listings ---------------------------------------------------------
create or replace view public.admin_listing_queue
with (security_invoker = true) as
select
  l.id,
  l.title,
  l.type_code,
  l.status::text                                  as status,
  l.created_at,
  l.submitted_at,
  l.area_label,
  l.reject_count,
  l.is_locked,
  l.edited_since_approval,
  l.flagged_reason,
  l.cover_url,
  l.profile_id                                    as poster_id,
  p.name                                          as poster_name,
  p.role::text                                    as poster_role,
  p.created_at                                    as poster_created_at,
  (p.created_at > now() - interval '7 days')      as poster_is_new,
  c.name                                          as city_name,
  -- Doc3's four risk inputs, and nothing else.
  (
    (case when p.created_at > now() - interval '7 days' then 2 else 0 end)
  + (case when l.reject_count > 0 then 2 else 0 end)
  + (case when hz_has_number_pattern(l.description) or l.flagged_reason is not null then 3 else 0 end)
  + (case when exists (
        select 1 from reports r
         where r.subject_type = 'listing' and r.subject_id = l.id and r.status = 'open'
      ) then 3 else 0 end)
  )                                               as risk_score,
  (select count(*) from reports r
    where r.subject_type = 'listing' and r.subject_id = l.id and r.status = 'open')
                                                  as open_reports,
  rl.locked_by                                    as locked_by,
  s.display_name                                  as locked_by_name,
  rl.expires_at                                   as lock_expires_at
from public.listings l
join public.profiles p on p.id = l.profile_id
left join public.locations c on c.id = l.city_id
left join public.review_locks rl
       on rl.subject_type = 'listing' and rl.subject_id = l.id and rl.expires_at > now()
left join public.staff s on s.profile_id = rl.locked_by
where l.deleted_at is null
  and l.status in ('pending_review','changes_requested','payment_pending','rejected');

-- ---- A5 · requirements -----------------------------------------------------
create or replace view public.admin_requirement_queue
with (security_invoker = true) as
select
  r.id,
  r.status::text                                  as status,
  r.created_at,
  r.submitted_at,
  r.type_code,
  r.kind::text                                    as kind,
  r.bhk,
  r.budget_min_paise,
  r.budget_max_paise,
  r.area_label,
  r.urgency,
  r.notes,
  r.reject_count,
  r.profile_id                                    as poster_id,
  p.name                                          as poster_name,
  p.role::text                                    as poster_role,
  c.name                                          as city_name,
  (
    (case when p.created_at > now() - interval '7 days' then 2 else 0 end)
  + (case when r.reject_count > 0 then 2 else 0 end)
  + (case when hz_has_number_pattern(r.notes) or r.flagged_reason is not null then 3 else 0 end)
  )                                               as risk_score,
  rl.locked_by,
  s.display_name                                  as locked_by_name
from public.requirements r
join public.profiles p on p.id = r.profile_id
left join public.locations c on c.id = r.city_id
left join public.review_locks rl
       on rl.subject_type = 'requirement' and rl.subject_id = r.id and rl.expires_at > now()
left join public.staff s on s.profile_id = rl.locked_by
where r.deleted_at is null
  and r.status in ('pending_review','changes_requested','rejected');

-- ---- A6 · boosts -----------------------------------------------------------
-- Only what the design's row draws. A boost in this queue is already PAID —
-- the amount and the payment id are on the row because rejecting it moves money.
create or replace view public.admin_boost_queue
with (security_invoker = true) as
-- `listing_id` is the subject FK for all three kinds (it predates projects and
-- requirements becoming boostable); `subject_kind` says which table it points at.
select
  b.id,
  b.status::text                                  as status,
  b.created_at,
  b.subject_kind::text                            as subject_kind,
  b.listing_id                                    as subject_id,
  b.targeting::text                               as targeting,
  b.target_label,
  b.duration_days,
  b.price_paise,
  b.profile_id                                    as poster_id,
  p.name                                          as poster_name,
  coalesce(l.title, pr.name, rq.area_label)       as subject_title,
  coalesce(l.status::text, pr.status::text, rq.status::text) as subject_status,
  coalesce(l.cover_url, pr.cover_url)             as subject_cover_url,
  l.price_paise                                   as subject_price_paise,
  pay.razorpay_payment_id                         as payment_ref,
  pay.status::text                                as payment_status,
  pay.method                                      as payment_method
from public.boosts b
join public.profiles p on p.id = b.profile_id
left join public.listings l on l.id = b.listing_id and b.subject_kind = 'listing'
left join public.projects pr on pr.id = b.listing_id and b.subject_kind = 'project'
left join public.requirements rq on rq.id = b.listing_id and b.subject_kind = 'requirement'
left join public.orders o on o.id = b.order_id
left join public.payments pay on pay.order_id = o.id and pay.status = 'success'
where b.status in ('pending_approval','pending_payment','rejected');

-- ---- A7 · verifications ----------------------------------------------------
create or replace view public.admin_verification_queue
with (security_invoker = true) as
select
  v.id,
  v.status::text                                  as status,
  v.level::text                                   as level,
  v.doc_type,
  v.doc_key,
  v.rera_number,
  v.valid_till,
  v.reason,
  v.submitted_at,
  v.reviewed_at,
  v.created_at,
  v.profile_id,
  p.name                                          as user_name,
  p.role::text                                    as user_role,
  p.photo_url                                     as user_photo_url
from public.verifications v
join public.profiles p on p.id = v.profile_id;

-- ---- A8 · appeals ----------------------------------------------------------
-- The design's two tabs are two different things wearing one screen: a
-- bio/number auto-flag being appealed, and a listing locked after three
-- rejections asking to be reopened. `kind` is what the tabs filter on.
create or replace view public.admin_appeal_queue
with (security_invoker = true) as
select
  a.id,
  a.status,
  a.created_at,
  a.resolved_at,
  a.resolution,
  a.reason                                        as appeal_text,
  a.subject::text                                 as subject,
  a.subject_id,
  a.profile_id,
  p.name                                          as user_name,
  p.role::text                                    as user_role,
  p.bio                                           as user_bio,
  p.bio_flag_reason,
  case when a.subject = 'auto_flag' then 'flag' else 'reopen' end as kind,
  l.title                                         as listing_title,
  l.reject_count                                  as listing_reject_count,
  l.is_locked                                     as listing_locked,
  l.cover_url                                     as listing_cover_url
from public.moderation_appeals a
join public.profiles p on p.id = a.profile_id
left join public.listings l on l.id = a.subject_id and a.subject = 'listing';

-- ---- A9 · reports ----------------------------------------------------------
-- One row per reported ENTITY, not per report: the design's card says
-- "3 reports" and shows one entity with one set of actions. Grouping in SQL is
-- what makes that count true.
create or replace view public.admin_report_queue
with (security_invoker = true) as
select
  (array_agg(r.id order by r.created_at desc))[1] as id,
  r.subject_type::text                            as subject_type,
  r.subject_id,
  count(*)                                        as report_count,
  min(r.created_at)                               as first_reported_at,
  max(r.created_at)                               as created_at,
  (array_agg(r.reason::text order by r.created_at desc))[1] as reason,
  (array_agg(r.note order by r.created_at desc))[1]        as note,
  'open'                                          as status,
  (count(*) >= 3)                                 as high_priority,
  (array_agg(r.reporter_id order by r.created_at desc))[1] as reporter_id
from public.reports r
where r.status in ('open','reviewing')
group by r.subject_type, r.subject_id;

do $$
declare v text;
begin
  foreach v in array array[
    'admin_listing_queue','admin_requirement_queue','admin_boost_queue',
    'admin_verification_queue','admin_appeal_queue','admin_report_queue'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', v);
  end loop;
end $$;
