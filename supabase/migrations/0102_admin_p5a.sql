-- ============================================================================
-- P5a — A13 Plans · A14 Coupons · A15 Grants & trials.
--
-- The three tables already exist and hold real rows (7 plans, 14 coupons, 38
-- grants). What they are missing is what the DESIGN draws on top of them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A14's "Scheduled" chip needs a start date, and its "Scope" column needs
--    to know WHICH plans a coupon applies to.
--
-- `coupons` had `expires_at` and nothing else: a coupon was live the moment it
-- was created, so the design's Scheduled state was unreachable — a chip that
-- could never have a row under it. `applies_to` says plans|boosts|both;
-- `catalog_codes` narrows that to specific products, which is what the design's
-- "₹999 plan only" cell is.
-- ---------------------------------------------------------------------------
alter table public.coupons add column if not exists starts_at timestamptz;
alter table public.coupons add column if not exists catalog_codes text[] not null default '{}';
alter table public.coupons add column if not exists label text;
alter table public.coupons add column if not exists created_by uuid;

comment on column public.coupons.catalog_codes is
  'empty = every product inside applies_to; otherwise only these plan_catalog codes';

-- A code is a code: two coupons with the same one is a race waiting to happen
-- at checkout, and nothing enforced it.
create unique index if not exists coupons_code_uniq on public.coupons (upper(code));

-- ---------------------------------------------------------------------------
-- 2. A13 — the plan card's stats line ("1,204 purchases · ₹12.0L revenue").
--
-- A real aggregate over paid orders, so the number on the card is the number
-- Finance would report. Plans that have never sold appear with zeroes rather
-- than being missing, because the card exists for them either way.
-- ---------------------------------------------------------------------------
create or replace view public.admin_plan_catalog
with (security_invoker = true) as
select
  pc.code,
  pc.kind::text                                   as kind,
  pc.name,
  pc.sub_label,
  pc.price_paise,
  pc.period_days,
  pc.roles,
  pc.features,
  pc.listing_quota,
  pc.requirement_quota,
  pc.requirement_days,
  pc.proposal_quota,
  pc.project_quota,
  pc.requirement_access,
  pc.proposals_expire_with_plan,
  pc.sort_order,
  pc.is_active,
  s.purchases,
  s.revenue_paise,
  -- "Most popular" is the design's badge (template 1200); it is the top seller,
  -- decided here so the screen cannot pick a different plan than Finance would.
  (s.purchases > 0 and s.purchases = (
     select max(s2.purchases) from (
       select count(*) filter (where o2.status = 'paid') as purchases
       from public.orders o2 group by o2.catalog_code
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

-- ---------------------------------------------------------------------------
-- 3. A14 — the coupon table, with its status DERIVED rather than stored.
--
-- The design's four chips (Active · Scheduled · Expired · Exhausted) are four
-- facts about one row, not a status column somebody has to remember to update.
-- A stored status is a status that goes stale the minute a cap fills.
-- ---------------------------------------------------------------------------
create or replace view public.admin_coupon_list
with (security_invoker = true) as
select
  c.id,
  upper(c.code)                                   as code,
  c.label,
  c.discount_type,
  c.discount_value,
  c.max_discount_paise,
  c.min_value_paise,
  c.applies_to::text                              as applies_to,
  c.catalog_codes,
  c.per_user_limit,
  c.usage_cap,
  c.used_count,
  c.starts_at,
  c.expires_at,
  c.is_active,
  c.created_at,
  case
    when c.usage_cap is null or c.usage_cap = 0 then 0
    else least(100, round(c.used_count::numeric * 100 / c.usage_cap))::int
  end                                             as usage_pct,
  case
    when not c.is_active                                            then 'expired'
    when c.usage_cap is not null and c.used_count >= c.usage_cap    then 'exhausted'
    when c.expires_at is not null and c.expires_at < now()          then 'expired'
    when c.starts_at is not null and c.starts_at > now()            then 'scheduled'
    else 'active'
  end                                             as status_key
from public.coupons c;

-- ---------------------------------------------------------------------------
-- 4. A15 — the grants log.
--
-- `grants` records the intent; `user_plans` records the thing it created. The
-- design's "Expires · 8 days left" and its Active/Expired chips are properties
-- of the PLAN, so the two are joined here rather than the screen guessing from
-- duration_days (which says nothing about whether the plan was later revoked).
-- ---------------------------------------------------------------------------
create or replace view public.admin_grant_list
with (security_invoker = true) as
select
  g.id,
  g.profile_id,
  p.name                                          as user_name,
  p.role::text                                    as user_role,
  p.photo_url                                     as user_photo,
  g.kind,
  g.catalog_code,
  g.contents,
  g.duration_days,
  g.reason,
  g.granted_by,
  g.granted_by_name,
  g.user_plan_id,
  g.notified_at,
  g.revoked_at,
  g.created_at,
  up.expires_at,
  up.status::text                                 as plan_status,
  up.listing_quota, up.listing_used,
  up.requirement_quota, up.requirement_used,
  up.proposal_quota, up.proposal_used,
  case
    when g.revoked_at is not null                                   then 'revoked'
    when up.id is null                                              then 'expired'
    when up.status <> 'active'                                      then 'expired'
    when up.expires_at is not null and up.expires_at < now()        then 'expired'
    else 'active'
  end                                             as status_key,
  -- the design colours the row when a trial is nearly out (template 1259)
  (up.expires_at is not null
     and up.expires_at > now()
     and up.expires_at < now() + interval '3 days')                 as expiring_soon
from public.grants g
join public.profiles p on p.id = g.profile_id
left join public.user_plans up on up.id = g.user_plan_id;

do $$
declare v text;
begin
  foreach v in array array['admin_plan_catalog','admin_coupon_list','admin_grant_list'] loop
    execute format('revoke all on public.%I from anon, authenticated', v);
  end loop;
end $$;

create index if not exists orders_catalog_status_idx on public.orders (catalog_code, status);
create index if not exists grants_profile_idx        on public.grants (profile_id, created_at desc);
