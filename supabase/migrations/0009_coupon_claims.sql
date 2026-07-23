-- ============================================================================
-- HomzList — Migration 0009: close the coupon per-user / usage-cap TOCTOU race
--
-- `validateCoupon` counted redemptions + coupon-holding orders and THEN let the
-- caller create the order. Two concurrent checkouts both read the same count,
-- both pass, both create an order holding the same code, and both can be paid —
-- so a per_user_limit of 1 could be redeemed N times. The same read-then-act gap
-- applies to the global `usage_cap`. Doc2 §4.3 (coupons) / Doc9 §11 (coupon
-- abuse) / Doc2 §15 (atomic counters everywhere).
--
-- The fix moves the decision into the database:
--   * `coupon_claims` gives every (coupon, user) a fixed set of numbered slots
--     0..per_user_limit-1, with a UNIQUE index over the live ones. Two racing
--     checkouts contending for the same slot cannot both insert — one gets a
--     unique violation and moves on, and when every slot is taken the claim
--     fails instead of silently over-granting.
--   * `claim_coupon_slot` takes a row lock on the coupon first, so the global
--     usage_cap is evaluated and consumed inside the same critical section.
--
-- A claim is HELD while the order is unpaid, REDEEMED on activation, and
-- RELEASED when the hold lapses or the order fails — so an abandoned checkout
-- returns the slot rather than burning the user's coupon.
-- ============================================================================

create table if not exists public.coupon_claims (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references public.coupons(id)  on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  order_id   uuid not null references public.orders(id)   on delete cascade,
  slot       integer not null check (slot >= 0),
  state      text not null default 'held' check (state in ('held','redeemed','released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- One claim per order: a retried checkout for the same order is a no-op.
  unique (order_id)
);

-- THE guarantee. Released claims are excluded so a lapsed hold frees its slot,
-- while held+redeemed ones occupy it — concurrent inserts collide here.
create unique index if not exists coupon_claims_slot_idx
  on public.coupon_claims (coupon_id, profile_id, slot)
  where state <> 'released';

create index if not exists coupon_claims_coupon_idx on public.coupon_claims (coupon_id, state);

-- ---- backfill ---------------------------------------------------------------
-- Existing redemptions and live coupon-holding orders predate this table. Without
-- them a user who already used a code would find every slot free and get it again.
insert into public.coupon_claims (coupon_id, profile_id, order_id, slot, state, expires_at)
select coupon_id, profile_id, order_id,
       (row_number() over (partition by coupon_id, profile_id order by created_at) - 1)::int,
       state, expires_at
from (
  select r.coupon_id, r.profile_id, r.order_id, r.created_at,
         'redeemed'::text as state, r.created_at + interval '100 years' as expires_at
  from public.coupon_redemptions r
  union all
  select o.coupon_id, o.profile_id, o.id, o.created_at,
         'held'::text, o.created_at + interval '30 minutes'
  from public.orders o
  where o.coupon_id is not null
    and o.status in ('created','pending')
    and not exists (select 1 from public.coupon_redemptions r2 where r2.order_id = o.id)
) src
on conflict do nothing;

-- ---- atomic claim -----------------------------------------------------------
-- Returns true when this order now owns a slot. per_user_limit and usage_cap are
-- read from the LOCKED coupon row, never passed in by the caller.
create or replace function public.claim_coupon_slot(
  p_coupon uuid, p_profile uuid, p_order uuid, p_hold_minutes integer default 30
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_limit    integer;
  v_cap      integer;
  v_used     integer;
  v_held     integer;
  v_redeemed integer;
  v_slot     integer;
begin
  -- Serialize every claim for this coupon: the cap check below and the slot
  -- insert must not straddle another transaction's commit.
  select per_user_limit, usage_cap, used_count
    into v_limit, v_cap, v_used
  from public.coupons
  where id = p_coupon and is_active
  for update;

  if not found then return false; end if;

  -- An order that already holds a slot (retry / idempotent replay) keeps it.
  if exists (select 1 from public.coupon_claims where order_id = p_order and state <> 'released') then
    return true;
  end if;

  -- Lapsed holds free their slot.
  update public.coupon_claims
     set state = 'released'
   where coupon_id = p_coupon and state = 'held' and expires_at < now();

  -- Global cap: live claims plus any legacy redemptions that predate this table.
  if v_cap is not null then
    select count(*) filter (where state = 'held'),
           count(*) filter (where state = 'redeemed')
      into v_held, v_redeemed
    from public.coupon_claims where coupon_id = p_coupon;
    if greatest(coalesce(v_used, 0), coalesce(v_redeemed, 0)) + coalesce(v_held, 0) >= v_cap then
      return false;
    end if;
  end if;

  -- Per-user slots. The unique index is the arbiter, not this loop.
  for v_slot in 0 .. greatest(coalesce(v_limit, 1), 1) - 1 loop
    begin
      insert into public.coupon_claims (coupon_id, profile_id, order_id, slot, expires_at)
      values (p_coupon, p_profile, p_order, v_slot,
              now() + make_interval(mins => greatest(coalesce(p_hold_minutes, 30), 1)));
      return true;
    exception when unique_violation then
      -- Slot already owned by another order → try the next one.
      null;
    end;
  end loop;

  return false;
end $$;

-- Mark the slot permanently consumed once the order is actually paid.
create or replace function public.redeem_coupon_claim(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update public.coupon_claims
     set state = 'redeemed', expires_at = now() + interval '100 years'
   where order_id = p_order and state <> 'released';
$$;

-- Hand the slot back when a checkout is abandoned or the order fails.
create or replace function public.release_coupon_claim(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update public.coupon_claims set state = 'released'
   where order_id = p_order and state = 'held';
$$;

-- SECURITY DEFINER helpers are server-only, exactly like the 0003 set.
revoke all on function public.claim_coupon_slot(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.redeem_coupon_claim(uuid)                    from public, anon, authenticated;
revoke all on function public.release_coupon_claim(uuid)                   from public, anon, authenticated;

-- RLS deny-all: the service role is the only path, same as every billing table.
alter table public.coupon_claims enable row level security;
