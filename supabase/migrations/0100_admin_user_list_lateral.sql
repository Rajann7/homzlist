-- ============================================================================
-- A10's view, rebuilt so it scales past the seed.
--
-- 0098 built `admin_user_list` out of CTEs: every read aggregated the WHOLE of
-- listings, projects, leads, listing_views and reports and then joined the
-- result to profiles. At 200 users that is 132 ms; the shape is O(all rows)
-- regardless of the page size, so it does not survive 50,000 users.
--
-- LATERAL fixes the common path. Postgres runs each subquery per candidate
-- profile, hitting the indexes 0098 added, so a page of 50 costs 50 index
-- lookups instead of five full aggregations. The derived filter keys
-- (status_key, plan_key, verification_key) still have to be computed for every
-- row a filter tests — that is inherent to filtering on a derived value — but
-- each one is now an index probe rather than a share of a full scan.
--
-- Same columns, same names, same semantics: this is a performance rewrite, and
-- check-admin-p4 re-runs every filter count against it unchanged.
-- ============================================================================

create or replace view public.admin_user_list
with (security_invoker = true) as
select
  p.id,
  p.name,
  coalesce('@' || p.username, '—')                       as handle,
  p.phone,
  p.email,
  p.role::text                                           as role,
  p.state::text                                          as account_state,
  p.photo_url,
  p.bio,
  p.created_at                                           as joined_at,
  p.last_active_at,
  p.is_registered,
  c.name                                                 as city_name,

  -- verification cluster (template 963): P · ID · RERA
  p.is_registered                                        as v_phone,
  v.v_id,
  v.v_rera,
  case
    when v.v_rera         then 'rera'
    when v.v_id           then 'id'
    when p.is_registered  then 'phone'
    else 'none'
  end                                                    as verification_key,

  pl.paid_names                                          as plan_names,
  case
    when pl.has_paid  then 'paid'
    when pl.has_trial then 'trial'
    else 'none'
  end                                                    as plan_key,
  pl.trial_ends_at,

  cnt.listings_count,
  cnt.listings_live,
  cnt.listings_count - cnt.listings_live                 as listings_other,
  cnt.leads_count,
  cnt.views_count,
  cnt.reports_count,
  (p.created_at > now() - interval '7 days')             as is_new,

  case
    when p.state in ('deleted','archived')     then 'deleted'
    when p.state = 'suspended'                 then 'suspended'
    when pl.has_trial and not pl.has_paid      then 'trial'
    else 'active'
  end                                                    as status_key
from public.profiles p
left join public.locations c on c.id = p.city_id

cross join lateral (
  select
    coalesce(
      array_agg(up.name order by up.purchased_at) filter (where not up.is_trial),
      '{}'::text[]
    )                                                     as paid_names,
    coalesce(bool_or(up.is_trial), false)                 as has_trial,
    coalesce(bool_or(not up.is_trial), false)             as has_paid,
    min(up.expires_at) filter (where up.is_trial)         as trial_ends_at
  from public.user_plans up
  where up.profile_id = p.id
    and up.status = 'active'
    and (up.expires_at is null or up.expires_at > now())
) pl

cross join lateral (
  select
    coalesce(bool_or(vr.level = 'id'   and vr.status = 'approved'), false) as v_id,
    coalesce(bool_or(vr.level = 'rera' and vr.status = 'approved'), false) as v_rera
  from public.verifications vr
  where vr.profile_id = p.id
) v

cross join lateral (
  select
    (select count(*) from public.listings l
      where l.profile_id = p.id and l.deleted_at is null)
    + (select count(*) from public.projects pr
        where pr.profile_id = p.id and pr.deleted_at is null)          as listings_count,
    (select count(*) from public.listings l
      where l.profile_id = p.id and l.deleted_at is null and l.status = 'live')
    + (select count(*) from public.projects pr
        where pr.profile_id = p.id and pr.deleted_at is null and pr.status = 'live')
                                                                       as listings_live,
    (select count(*) from public.leads ld where ld.owner_id = p.id)    as leads_count,
    (select count(*) from public.listing_views lv
       join public.listings l2 on l2.id = lv.listing_id
      where l2.profile_id = p.id)                                      as views_count,
    (select count(*) from public.reports r
      where r.subject_type = 'user' and r.subject_id = p.id
        and r.status in ('open','reviewing'))                          as reports_count
) cnt
where p.is_registered = true;

revoke all on public.admin_user_list from anon, authenticated;

-- The indexes the laterals probe. Without these the rewrite is slower, not
-- faster: a per-row subquery over an unindexed column is the worst of both.
create index if not exists listings_profile_idx      on public.listings (profile_id) where deleted_at is null;
create index if not exists projects_profile_idx      on public.projects (profile_id) where deleted_at is null;
create index if not exists leads_owner_idx           on public.leads (owner_id);
create index if not exists verifications_profile_idx on public.verifications (profile_id);
