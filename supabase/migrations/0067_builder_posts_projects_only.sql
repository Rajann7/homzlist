-- ============================================================================
-- HomzList — Migration 0067: a Builder posts PROJECTS and nothing else
--
-- Product decision (2026-07-28, overrides Doc2 §2's role table): the Builder
-- role sells one thing — the project. Sell, Rent and Requirement are OFF for
-- builders: they may not post new ones, and the ones already out there come
-- down.
--
-- Owner and Broker are untouched by this file. So are projects, proposals and
-- requirement VIEWING (the ₹2,999 plan) — a builder still answers requirements
-- matched to their projects, they just don't post their own.
--
-- Four parts:
--   1. property_types.roles      — no type is postable by a builder any more,
--      which is what POST /listings actually checks (app/api/v1/listings).
--   2. plan_catalog p999         — the ₹999 Listing Plan leaves the builder's
--      catalog. It sells a listing slot + a requirement post, neither of which
--      a builder can now spend; leaving it on sale would take money for
--      something the server refuses to deliver.
--   3. existing builder listings — every non-deleted one goes `hidden`.
--   4. existing builder requirements — paused (is_active = false).
--
-- Plus the money half of (3): a boost bought for one of those listings can
-- never run now, so any still `pending_approval` is `rejected`, which is what
-- the hourly refund sweep in lib/billing/reconcile.ts claims and refunds
-- (never refunded inline — migration 0011).
-- ============================================================================

-- ---- 1. no property type is builder-postable -------------------------------
update public.property_types
   set roles = array_remove(roles, 'builder')
 where 'builder' = any (roles);

-- ---- 2. the ₹999 plan is Owner/Broker only ---------------------------------
update public.plan_catalog
   set roles = array_remove(roles, 'builder')
 where code = 'p999' and 'builder' = any (roles);

-- ---- 3. take existing builder listings off the public surface --------------
-- `hidden_at` is deliberately left NULL: lib/listings/lifecycle.ts soft-deletes
-- anything hidden for 30 days, and this is a policy takedown, not an expiry —
-- the rows must stay recoverable, not quietly become `deleted` next month.
update public.listings l
   set status = 'hidden',
       updated_at = now()
  from public.profiles p
 where p.id = l.profile_id
   and p.role = 'builder'
   and l.status not in ('hidden', 'deleted', 'archived');

-- ---- 3b. boosts bought for those listings can never run --------------------
update public.boosts b
   set status = 'rejected',
       reject_reason = 'Listings are no longer available on Builder accounts — automatically refunded',
       updated_at = now()
  from public.profiles p
 where p.id = b.profile_id
   and p.role = 'builder'
   and b.subject_kind = 'listing'
   and b.status = 'pending_approval';

-- The seller has to be told their money is coming back; `notify()` is server
-- code, so the row is written here in exactly the shape it writes (type +
-- category + href), for the boosts this file just rejected.
insert into public.notifications (profile_id, type, category, title, body, href, data)
select b.profile_id,
       'boost_rejected',
       'listing',
       'Your boost **wasn''t approved**',
       -- Integer rupees, en-IN grouping — the same string `notify()` builds.
       b.reject_reason || ' · ₹' || to_char(b.price_paise / 100, 'FM9,99,99,990') || ' is being refunded (5–7 days).',
       '/boost',
       jsonb_build_object('boostId', b.id, 'deepLink', '/boost')
  from public.boosts b
  join public.profiles p on p.id = b.profile_id
 where p.role = 'builder'
   and b.subject_kind = 'listing'
   and b.status = 'rejected'
   and b.refunded_at is null
   and b.reject_reason = 'Listings are no longer available on Builder accounts — automatically refunded'
   and not exists (
     select 1 from public.notifications n
      where n.profile_id = b.profile_id
        and n.type = 'boost_rejected'
        and n.data->>'boostId' = b.id::text
   );

-- ---- 4. pause existing builder requirements --------------------------------
-- `paused` rather than `deleted`: nothing is destroyed, and the route layer
-- refuses to let a builder flip one back to active, so paused is terminal for
-- them without inventing a new state.
update public.requirements r
   set status = 'paused',
       is_active = false,
       updated_at = now()
  from public.profiles p
 where p.id = r.profile_id
   and p.role = 'builder'
-- Drafts and rejected rows are left alone — neither was ever public, and a
-- draft that reads "paused" would be a state the UI has no words for.
   and r.status in ('live', 'pending_review', 'changes_requested');
