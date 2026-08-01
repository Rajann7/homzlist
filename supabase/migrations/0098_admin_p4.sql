-- ============================================================================
-- P4 — A10 Users · A11 User detail · A12 Listings master · A31 Impersonation.
--
-- Same principle as 0095: the list engine resolves every control to SQL on ONE
-- relation, so a screen that draws the poster's name, the city, a plan label
-- and a verification cluster needs those as REAL COLUMNS. Embedding them in the
-- select would render fine and then silently refuse to sort, search or filter
-- on any of it — the "control that renders but controls nothing" §3 forbids.
--
-- Both views are `security_invoker = true` and revoked from anon/authenticated:
-- they are read by the service role behind requireAdmin(), by nothing else.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. "Remove story" needs something to remove.
--
-- Stories are DERIVED (lib/feed/stories.ts): anything that went live in the
-- last 24h in the viewer's city is a story segment. So the listing panel's
-- "Remove story" button (template 1416) had nothing it could write — the story
-- would have come straight back on the next feed read. This flag is what the
-- button sets and what the story query now excludes.
-- ---------------------------------------------------------------------------
alter table public.listings add column if not exists story_suppressed_at timestamptz;
alter table public.projects add column if not exists story_suppressed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Balance adjustments (A11 "Adjust balance", template 1740).
--
-- The sheet moves a quota up or down and demands a reason. Writing that
-- straight onto user_plans.*_quota and nowhere else would leave "+5 proposals"
-- indistinguishable from "they bought a bigger plan" a week later. Every
-- adjustment is a row here AND a change to the plan it targets.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_adjustments (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  user_plan_id  uuid references public.user_plans(id) on delete set null,
  kind          consumption_kind not null,
  delta         int not null,
  reason        text not null,
  actor_id      uuid,
  actor_name    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists plan_adjustments_profile_idx
  on public.plan_adjustments (profile_id, created_at desc);
alter table public.plan_adjustments enable row level security;
-- No policy: service-role only. The user-facing app never reads this table; the
-- effect it has (a bigger quota) is already visible on user_plans.

-- ---------------------------------------------------------------------------
-- 3. Account merges (A11 → "Merge accounts", template 1766).
--
-- The sheet's own copy is the contract: listings and balances move to the
-- primary, the other account is SUSPENDED not deleted, chats stay where they
-- are. That is three mutations across three tables — without a record of the
-- merge, "why does this suspended account have no listings" is unanswerable.
-- ---------------------------------------------------------------------------
create table if not exists public.account_merges (
  id            uuid primary key default gen_random_uuid(),
  primary_id    uuid not null references public.profiles(id) on delete cascade,
  merged_id     uuid not null references public.profiles(id) on delete cascade,
  moved         jsonb not null default '{}'::jsonb,
  reason        text,
  actor_id      uuid,
  actor_name    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists account_merges_primary_idx on public.account_merges (primary_id);
alter table public.account_merges enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Impersonation (A31) — the table exists (0088); it needs the one-shot
--    handoff and an expiry so a forgotten session cannot stay open forever.
-- ---------------------------------------------------------------------------
alter table public.impersonation_sessions
  add column if not exists expires_at timestamptz;
alter table public.impersonation_sessions
  add column if not exists ended_reason text;
create index if not exists impersonation_live_idx
  on public.impersonation_sessions (staff_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- 5. A10 — the users list.
--
-- Every column the design's row draws (template 1024-1046) is here as a real
-- column, plus the four keys its filter pills need (`status_key`, `plan_key`,
-- `verification_key`, `city_name`). A filter pill that cannot become an
-- `.in()` on a column is a pill that does nothing.
-- ---------------------------------------------------------------------------
create or replace view public.admin_user_list
with (security_invoker = true) as
with plan_now as (
  select
    up.profile_id,
    array_agg(up.name order by up.purchased_at) filter (where not up.is_trial) as paid_names,
    bool_or(up.is_trial)                                                       as has_trial,
    bool_or(not up.is_trial)                                                   as has_paid,
    min(up.expires_at) filter (where up.is_trial)                              as trial_ends_at
  from public.user_plans up
  where up.status = 'active'
    and (up.expires_at is null or up.expires_at > now())
  group by up.profile_id
),
listing_now as (
  select
    l.profile_id,
    count(*)                                                as total,
    count(*) filter (where l.status = 'live')               as live
  from public.listings l
  where l.deleted_at is null
  group by l.profile_id
),
project_now as (
  select pr.profile_id,
         count(*)                                  as total,
         count(*) filter (where pr.status = 'live') as live
  from public.projects pr
  where pr.deleted_at is null
  group by pr.profile_id
),
lead_now as (
  select owner_id as profile_id, count(*) as total from public.leads group by owner_id
),
view_now as (
  select l.profile_id, count(*) as total
  from public.listing_views v
  join public.listings l on l.id = v.listing_id
  group by l.profile_id
),
report_now as (
  select r.subject_id as profile_id, count(*) as total
  from public.reports r
  where r.subject_type = 'user' and r.status in ('open','reviewing')
  group by r.subject_id
),
verif as (
  select
    profile_id,
    bool_or(level = 'id'   and status = 'approved') as v_id,
    bool_or(level = 'rera' and status = 'approved') as v_rera
  from public.verifications
  group by profile_id
)
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
  coalesce(v.v_id, false)                                as v_id,
  coalesce(v.v_rera, false)                              as v_rera,
  case
    when coalesce(v.v_rera, false) then 'rera'
    when coalesce(v.v_id, false)   then 'id'
    when p.is_registered           then 'phone'
    else 'none'
  end                                                    as verification_key,

  -- plans (the design prints the plan NAMES as chips, or "No plan")
  coalesce(pl.paid_names, '{}'::text[])                  as plan_names,
  case
    when coalesce(pl.has_paid, false)  then 'paid'
    when coalesce(pl.has_trial, false) then 'trial'
    else 'none'
  end                                                    as plan_key,
  pl.trial_ends_at,

  coalesce(ln.total, 0) + coalesce(pn.total, 0)          as listings_count,
  coalesce(ln.live, 0)  + coalesce(pn.live, 0)           as listings_live,
  (coalesce(ln.total,0) + coalesce(pn.total,0))
    - (coalesce(ln.live,0) + coalesce(pn.live,0))        as listings_other,
  coalesce(ld.total, 0)                                  as leads_count,
  coalesce(vw.total, 0)                                  as views_count,
  coalesce(rp.total, 0)                                  as reports_count,
  (p.created_at > now() - interval '7 days')             as is_new,

  -- the design's own status chip, and the key its filter narrows on
  case
    when p.state in ('deleted','archived')          then 'deleted'
    when p.state = 'suspended'                      then 'suspended'
    when coalesce(pl.has_trial, false)
         and not coalesce(pl.has_paid, false)       then 'trial'
    else 'active'
  end                                                    as status_key
from public.profiles p
left join public.locations c on c.id = p.city_id
left join plan_now    pl on pl.profile_id = p.id
left join listing_now ln on ln.profile_id = p.id
left join project_now pn on pn.profile_id = p.id
left join lead_now    ld on ld.profile_id = p.id
left join view_now    vw on vw.profile_id = p.id
left join report_now  rp on rp.profile_id = p.id
left join verif       v  on v.profile_id  = p.id
where p.is_registered = true;

-- ---------------------------------------------------------------------------
-- 6. A12 — the listings master.
--
-- ALL statuses, unlike A3's queue, and both kinds of posting. Builders post
-- PROJECTS, not listings (CLAUDE.md's builder change), so a "Listings" master
-- built over `listings` alone would show an admin every Owner and Broker post
-- and none of a Builder's — the exact rows most likely to need a compliance
-- edit. The union gives one table with one set of columns, which is what the
-- design draws; `kind` is the only thing that differs.
-- ---------------------------------------------------------------------------
create or replace view public.admin_listing_master
with (security_invoker = true) as
select
  l.id,
  'listing'::text                                    as kind,
  l.title,
  l.type_code,
  coalesce(pt.label, l.type_code)                    as type_label,
  l.kind::text                                       as deal_kind,
  l.price_paise,
  l.price_on_request,
  l.area_label,
  c.name                                             as city_name,
  l.profile_id                                       as poster_id,
  p.name                                             as poster_name,
  p.role::text                                       as poster_role,
  l.status::text                                     as raw_status,
  l.availability::text                               as availability,
  case
    when l.deleted_at is not null                    then 'trash'
    when l.availability = 'sold'                     then 'sold'
    when l.availability = 'rented'                   then 'rented'
    when l.status = 'live'                           then 'live'
    when l.status in ('pending_review','payment_pending','draft') then 'pending'
    when l.status = 'changes_requested'              then 'changes'
    when l.status = 'rejected'                       then 'rejected'
    when l.status = 'hidden'                         then 'hidden'
    when l.status = 'archived'                       then 'archived'
    else l.status::text
  end                                                as status_key,
  l.cover_url,
  l.created_at,
  l.live_at,
  l.deleted_at,
  (select count(*) from public.listing_views v where v.listing_id = l.id)   as views_count,
  (select count(*) from public.leads ld where ld.listing_id = l.id)         as leads_count,
  exists (
    select 1 from public.boosts b
     where b.subject_kind = 'listing' and b.listing_id = l.id
       and b.status = 'active' and b.ends_at > now()
  )                                                  as is_boosted,
  (select count(*) from public.reports r
    where r.subject_type = 'listing' and r.subject_id = l.id
      and r.status in ('open','reviewing'))          as reports_count,
  (l.still_available_asked_at is not null)           as expiry_prompted,
  (l.story_suppressed_at is null and l.live_at > now() - interval '24 hours') as has_story
from public.listings l
join public.profiles p on p.id = l.profile_id
left join public.locations c on c.id = l.city_id
left join public.property_types pt on pt.code = l.type_code
where l.status <> 'draft'

union all

select
  pr.id,
  'project'::text                                    as kind,
  pr.name                                            as title,
  coalesce(pr.project_type, 'project')               as type_code,
  coalesce(ptp.label, 'Project')                     as type_label,
  'sell'::text                                       as deal_kind,
  (select min(u.price_from_paise) from public.project_units u where u.project_id = pr.id) as price_paise,
  false                                              as price_on_request,
  pr.area_label,
  c.name                                             as city_name,
  pr.profile_id                                      as poster_id,
  p.name                                             as poster_name,
  p.role::text                                       as poster_role,
  pr.status::text                                    as raw_status,
  'available'::text                                  as availability,
  case
    when pr.deleted_at is not null                   then 'trash'
    when pr.status = 'live'                          then 'live'
    when pr.status in ('pending_review','payment_pending','draft') then 'pending'
    when pr.status = 'changes_requested'             then 'changes'
    when pr.status = 'rejected'                      then 'rejected'
    when pr.status = 'hidden'                        then 'hidden'
    when pr.status = 'archived'                      then 'archived'
    else pr.status::text
  end                                                as status_key,
  pr.cover_url,
  pr.created_at,
  pr.live_at,
  pr.deleted_at,
  0::bigint                                          as views_count,
  (select count(*) from public.leads ld where ld.project_id = pr.id)        as leads_count,
  exists (
    select 1 from public.boosts b
     where b.subject_kind = 'project' and b.listing_id = pr.id
       and b.status = 'active' and b.ends_at > now()
  )                                                  as is_boosted,
  (select count(*) from public.reports r
    where r.subject_type = 'project' and r.subject_id = pr.id
      and r.status in ('open','reviewing'))          as reports_count,
  false                                              as expiry_prompted,
  (pr.story_suppressed_at is null and pr.live_at > now() - interval '24 hours') as has_story
from public.projects pr
join public.profiles p on p.id = pr.profile_id
left join public.locations c on c.id = pr.city_id
left join public.project_types ptp on ptp.code = pr.project_type
where pr.status <> 'draft';

do $$
declare v text;
begin
  foreach v in array array['admin_user_list','admin_listing_master'] loop
    execute format('revoke all on public.%I from anon, authenticated', v);
  end loop;
end $$;

-- Indexes the two views scan hardest.
create index if not exists listing_views_listing_idx on public.listing_views (listing_id);
create index if not exists leads_listing_idx         on public.leads (listing_id);
create index if not exists leads_project_idx         on public.leads (project_id);
create index if not exists reports_subject_idx       on public.reports (subject_type, subject_id, status);
create index if not exists user_plans_profile_active_idx
  on public.user_plans (profile_id) where status = 'active';
