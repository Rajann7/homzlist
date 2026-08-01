-- ============================================================================
-- "Most popular" is a badge on A13, and A13 is the PLANS screen.
--
-- 0102 compared purchases across the whole catalog, so the winner was a BOOST
-- (132 sales) and no plan card ever carried the badge the design draws. The
-- comparison belongs inside the row's own kind.
-- ============================================================================
create or replace view public.admin_plan_catalog
with (security_invoker = true) as
select
  pc.code, pc.kind::text as kind, pc.name, pc.sub_label, pc.price_paise,
  pc.period_days, pc.roles, pc.features, pc.listing_quota, pc.requirement_quota,
  pc.requirement_days, pc.proposal_quota, pc.project_quota, pc.requirement_access,
  pc.proposals_expire_with_plan, pc.sort_order, pc.is_active,
  s.purchases, s.revenue_paise,
  (s.purchases > 0 and s.purchases = (
     select max(s2.purchases) from (
       select count(*) filter (where o2.status = 'paid') as purchases
       from public.orders o2
       join public.plan_catalog pc2 on pc2.code = o2.catalog_code
       where pc2.kind = pc.kind
       group by o2.catalog_code
     ) s2
  ))                                              as is_top_seller,
  (select count(*) from public.user_plans up
    where up.catalog_code = pc.code and up.status = 'active') as active_holders
from public.plan_catalog pc
cross join lateral (
  select
    count(*) filter (where o.status = 'paid')                              as purchases,
    coalesce(sum(o.total_paise) filter (where o.status = 'paid'), 0)::bigint as revenue_paise
  from public.orders o
  where o.catalog_code = pc.code
) s;

revoke all on public.admin_plan_catalog from anon, authenticated;
