-- ============================================================================
-- HomzList — Migration 0003: Plans, Payments & Boost (Module 3)
-- Human-run only. Doc2 §4 (plans/payments), §13 (boost); Doc7 §3; Doc9 §12.
--
-- Money is stored as INTEGER PAISE everywhere (Doc2 §15) — never float.
-- RLS: deny-all for clients on every table; the server API (service-role) is
-- the only access path after it authorizes ownership (Doc9 §4).
-- ============================================================================

-- ---- enums ------------------------------------------------------------------
do $$ begin create type billing_kind      as enum ('plan','topup','boost');                                            exception when duplicate_object then null; end $$;
do $$ begin create type order_status      as enum ('created','pending','paid','failed','expired','refunded');           exception when duplicate_object then null; end $$;
do $$ begin create type payment_status    as enum ('pending','success','failed','refunded','chargeback');               exception when duplicate_object then null; end $$;
do $$ begin create type user_plan_status  as enum ('active','expired','revoked');                                       exception when duplicate_object then null; end $$;
do $$ begin create type slot_state        as enum ('reserved','released','consumed');                                   exception when duplicate_object then null; end $$;
do $$ begin create type boost_status      as enum ('pending_payment','pending_approval','active','expired','rejected','stopped','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type consumption_kind  as enum ('listing','requirement','proposal');                                 exception when duplicate_object then null; end $$;
do $$ begin create type coupon_scope      as enum ('plans','boosts','both');                                            exception when duplicate_object then null; end $$;

-- ---- plan catalog (admin-editable; Doc2 §4.1 grandfathering) -----------------
-- Prices/contents change here at any time. A purchase SNAPSHOTS the terms into
-- user_plans, so existing buyers keep their original deal (grandfathering).
create table if not exists public.plan_catalog (
  code             text primary key,           -- 'p999' | 'p2999' | 'p9999' | 'topup10' | 'boost7' | 'boost30'
  kind             billing_kind not null,
  name             text not null,
  sub_label        text,                       -- 'one-time' / '/month' / 'per project · 6 months'
  price_paise      bigint not null check (price_paise >= 0),
  period_days      integer,                    -- null = lifetime
  roles            text[] not null default '{owner,broker,builder}',
  features         text[] not null default '{}',
  listing_quota     integer not null default 0,
  requirement_quota integer not null default 0,
  requirement_days  integer,                   -- validity of a posted requirement
  proposal_quota    integer not null default 0,  -- -1 = unlimited
  proposals_expire_with_plan boolean not null default false,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into public.plan_catalog
  (code, kind, name, sub_label, price_paise, period_days, roles, features,
   listing_quota, requirement_quota, requirement_days, proposal_quota, proposals_expire_with_plan, sort_order)
values
  ('p999',  'plan', 'Listing Plan',      'one-time',                  99900,  null, '{owner,broker,builder}',
   '{"1 property listing (stays live forever)","1 requirement post (30 days)","10 proposals on others'' requirements","Boost eligible"}',
   1, 1, 30, 10, false, 1),
  ('p2999', 'plan', 'Requirement Access', '/month',                   299900,   30, '{owner,broker,builder}',
   '{"View all requirements with full details","30 proposals included","Instant match alerts for your areas","Direct chat after acceptance"}',
   0, 0, null, 30, true, 2),
  ('p9999', 'plan', 'Builder Project',    'per project · 6 months',   999900,  180, '{builder}',
   '{"1 project with unlimited unit types","Unlimited photos + brochure","Unlimited matching requirements","Priority match notifications"}',
   1, 0, null, -1, true, 3),
  ('topup10','topup','Proposal Top-up',   '+10 proposals',             49900, null, '{owner,broker,builder}',
   '{"Use on any requirement"}', 0, 0, null, 10, false, 4),
  ('boost7', 'boost','Boost — 7 Days',    '7 days',                    49900,    7, '{owner,broker,builder}', '{}', 0, 0, null, 0, false, 5),
  ('boost30','boost','Boost — 1 Month',   '1 month',                  149900,   30, '{owner,broker,builder}', '{}', 0, 0, null, 0, false, 6)
on conflict (code) do nothing;

-- ---- coupons (Doc2 §4.3) -----------------------------------------------------
create table if not exists public.coupons (
  id              uuid primary key default gen_random_uuid(),
  -- Stored uppercase (enforced) so lookups are an exact `eq`, never an `ilike`
  -- with a raw param — `%`/`_` would act as wildcards and leak codes (Doc9 §7).
  code            text not null check (code = upper(code)),
  discount_type   text not null default 'flat' check (discount_type in ('flat','percent')),
  discount_value  bigint not null check (discount_value > 0),  -- paise (flat) | percent points
  max_discount_paise bigint,                                   -- cap for percent coupons
  min_value_paise bigint not null default 0,
  applies_to      coupon_scope not null default 'both',
  per_user_limit  integer not null default 1,
  usage_cap       integer,                                     -- null = unlimited
  used_count      integer not null default 0,
  expires_at      timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index if not exists coupons_code_idx on public.coupons (upper(code));

create table if not exists public.coupon_redemptions (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references public.coupons(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  order_id   uuid not null,
  created_at timestamptz not null default now(),
  unique (order_id)
);
create index if not exists coupon_red_user_idx on public.coupon_redemptions (coupon_id, profile_id);

-- ---- orders (amounts computed SERVER-SIDE — Doc9 §12) -----------------------
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  kind               billing_kind not null,
  catalog_code       text not null references public.plan_catalog(code),
  -- Snapshot of catalog terms at purchase time → grandfathering (Doc2 §4.1).
  terms_snapshot     jsonb not null,
  base_paise         bigint not null,
  discount_paise     bigint not null default 0,
  taxable_paise      bigint not null,
  cgst_paise         bigint not null default 0,
  sgst_paise         bigint not null default 0,
  igst_paise         bigint not null default 0,
  total_paise        bigint not null,
  currency           text not null default 'INR',
  coupon_id          uuid references public.coupons(id),
  coupon_code        text,
  gstin              text,
  place_of_supply    text not null default 'GJ',
  razorpay_order_id  text,
  status             order_status not null default 'created',
  -- Client-supplied idempotency key (Doc7 §0) — replays return the same order.
  idempotency_key    text,
  -- Boost intent captured at checkout (listing/duration/targeting).
  boost_request      jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists orders_profile_idx  on public.orders (profile_id, created_at desc);
create unique index if not exists orders_rzp_idx on public.orders (razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists orders_idem_idx on public.orders (profile_id, idempotency_key) where idempotency_key is not null;
-- Double-payment detection (same user + plan within 10 min — Doc2 §4.3).
create index if not exists orders_dupe_idx on public.orders (profile_id, catalog_code, created_at desc);

-- ---- payments ----------------------------------------------------------------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  razorpay_payment_id text,
  status              payment_status not null default 'pending',
  method              text,                     -- upi / card / netbanking
  method_detail       text,                     -- 'UPI · GPay'
  amount_paise        bigint not null,
  currency            text not null default 'INR',
  failure_reason      text,
  refund_id           text,
  refund_reason       text,
  refunded_at         timestamptz,
  captured_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists payments_rzp_idx on public.payments (razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists payments_profile_idx on public.payments (profile_id, created_at desc);
create index if not exists payments_order_idx   on public.payments (order_id);

-- ---- invoices (GST line items — Doc2 §4.3) ----------------------------------
create sequence if not exists public.invoice_seq;

create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique,
  order_id    uuid not null references public.orders(id) on delete cascade,
  payment_id  uuid references public.payments(id) on delete set null,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  gstin       text,
  billed_to   jsonb not null,     -- { name, phone }
  line_items  jsonb not null,     -- [{ title, contents[], amount_paise }]
  totals      jsonb not null,     -- { base, discount, taxable, cgst, sgst, igst, total, couponCode }
  issued_at   timestamptz not null default now(),
  emailed_at  timestamptz
);
create index if not exists invoices_profile_idx on public.invoices (profile_id, issued_at desc);
create unique index if not exists invoices_order_idx on public.invoices (order_id);

-- ---- user plans (the entitlement rows; pooled + FIFO — Doc2 §4.2) -----------
create table if not exists public.user_plans (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  order_id          uuid references public.orders(id) on delete set null,
  catalog_code      text not null references public.plan_catalog(code),
  name              text not null,
  terms             jsonb not null,             -- snapshot (grandfathering)
  listing_quota     integer not null default 0,
  listing_used      integer not null default 0,
  requirement_quota integer not null default 0,
  requirement_used  integer not null default 0,
  proposal_quota    integer not null default 0, -- -1 = unlimited
  proposal_used     integer not null default 0,
  purchased_at      timestamptz not null default now(),
  starts_at         timestamptz not null default now(),
  expires_at        timestamptz,                -- null = lifetime
  status            user_plan_status not null default 'active',
  is_trial          boolean not null default false,
  granted_by        uuid references public.profiles(id),  -- admin who granted a trial
  revoked_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint quota_within_bounds check (
    listing_used     >= 0 and (listing_quota     < 0 or listing_used     <= listing_quota) and
    requirement_used >= 0 and (requirement_quota < 0 or requirement_used <= requirement_quota) and
    proposal_used    >= 0 and (proposal_quota    < 0 or proposal_used    <= proposal_quota)
  )
);
-- FIFO pool order: oldest active plan is drawn from first (Doc2 §4.2).
create index if not exists user_plans_fifo_idx on public.user_plans (profile_id, status, purchased_at);
create index if not exists user_plans_expiry_idx on public.user_plans (status, expires_at) where expires_at is not null;

-- ---- consumption trace ("WHAT YOU'VE USED" + admin audit — Doc2 §4.2) -------
create table if not exists public.plan_consumptions (
  id           uuid primary key default gen_random_uuid(),
  user_plan_id uuid not null references public.user_plans(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         consumption_kind not null,
  qty          integer not null default 1,
  ref_type     text,                     -- 'listing' | 'requirement' | 'proposal'
  ref_id       uuid,
  note         text,                     -- e.g. 'toggle-on after renewal'
  reverted_at  timestamptz,              -- proposal refund (requirement went OFF pre-delivery)
  revert_reason text,
  created_at   timestamptz not null default now()
);
create index if not exists consumptions_profile_idx on public.plan_consumptions (profile_id, created_at desc);
create index if not exists consumptions_plan_idx    on public.plan_consumptions (user_plan_id);

-- ---- listing slot state machine (reserved → released|consumed — Doc2 §4.2) --
create table if not exists public.listing_slots (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  user_plan_id uuid not null references public.user_plans(id) on delete cascade,
  order_id     uuid references public.orders(id) on delete set null,
  listing_id   uuid,                    -- FK added in the listings module
  state        slot_state not null default 'reserved',
  released_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists slots_profile_idx on public.listing_slots (profile_id, state);
create unique index if not exists slots_listing_idx on public.listing_slots (listing_id) where listing_id is not null;

-- ---- boosts (Doc2 §13) -------------------------------------------------------
create table if not exists public.boosts (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  listing_id     uuid not null,
  order_id       uuid references public.orders(id) on delete set null,
  catalog_code   text not null references public.plan_catalog(code),
  duration_days  integer not null,
  targeting      text not null check (targeting in ('area','city','state','india')),
  target_label   text not null,
  price_paise    bigint not null,
  status         boost_status not null default 'pending_payment',
  approved_at    timestamptz,
  starts_at      timestamptz,
  ends_at        timestamptz,
  reject_reason  text,
  stopped_reason text,
  refunded_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists boosts_profile_idx on public.boosts (profile_id, created_at desc);
create index if not exists boosts_listing_idx on public.boosts (listing_id, status);
create index if not exists boosts_expiry_idx  on public.boosts (status, ends_at) where ends_at is not null;

-- ---- webhook idempotency (Doc9 §12) -----------------------------------------
create table if not exists public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'razorpay',
  event_id     text not null,
  event_type   text,
  payload      jsonb,
  status       text not null default 'processed' check (status in ('processed','skipped','failed','mismatch')),
  note         text,
  received_at  timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---- billing settings (admin-editable knobs) --------------------------------
create table if not exists public.billing_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (key, value) values
  ('gst_rate_bps',   '1800'::jsonb),                                            -- 18.00%
  ('home_state',     '"GJ"'::jsonb),                                            -- place of supply for CGST/SGST split
  ('grace_hours',    '24'::jsonb),                                              -- ₹2,999 expiry grace (Doc2 §4.3)
  ('double_pay_window_minutes', '10'::jsonb),
  ('boost_reach',    '{"area":"~2,400 users","city":"~18k","state":"~90k","india":"~2.1L"}'::jsonb)
on conflict (key) do nothing;

-- ---- triggers ---------------------------------------------------------------
drop trigger if exists plan_catalog_updated_at on public.plan_catalog;
create trigger plan_catalog_updated_at before update on public.plan_catalog
  for each row execute function public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
drop trigger if exists user_plans_updated_at on public.user_plans;
create trigger user_plans_updated_at before update on public.user_plans
  for each row execute function public.set_updated_at();
drop trigger if exists listing_slots_updated_at on public.listing_slots;
create trigger listing_slots_updated_at before update on public.listing_slots
  for each row execute function public.set_updated_at();
drop trigger if exists boosts_updated_at on public.boosts;
create trigger boosts_updated_at before update on public.boosts
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Atomic business-logic functions (row-locked — Doc2 §4.2 / Doc9 §11).
-- These run inside a single statement so concurrent callers cannot double-spend
-- a quota. Callers are server-side only (service-role) and must have already
-- authorized ownership.
-- ============================================================================

-- Draw `p_qty` units of `p_kind` from the caller's pooled plans, oldest first.
-- Returns the user_plan_id it consumed from, or null when the pool is exhausted.
create or replace function public.consume_quota(
  p_profile uuid, p_kind consumption_kind, p_qty integer,
  p_ref_type text default null, p_ref_id uuid default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_plan public.user_plans%rowtype; v_left integer;
begin
  -- FIFO: oldest active, non-expired plan with room. FOR UPDATE serialises
  -- concurrent proposal sends on the same row (Doc2 §15 atomic counters).
  select * into v_plan from public.user_plans
   where profile_id = p_profile
     and status = 'active'
     and (expires_at is null or expires_at > now())
     and case p_kind
           when 'listing'     then (listing_quota     < 0 or listing_used     + p_qty <= listing_quota)
           when 'requirement' then (requirement_quota < 0 or requirement_used  + p_qty <= requirement_quota)
           when 'proposal'    then (proposal_quota    < 0 or proposal_used     + p_qty <= proposal_quota)
         end
     and case p_kind
           when 'listing'     then listing_quota     <> 0
           when 'requirement' then requirement_quota <> 0
           when 'proposal'    then proposal_quota    <> 0
         end
   order by purchased_at asc
   for update skip locked
   limit 1;

  if not found then return null; end if;

  update public.user_plans set
    listing_used     = listing_used     + case when p_kind = 'listing'     and listing_quota     >= 0 then p_qty else 0 end,
    requirement_used = requirement_used + case when p_kind = 'requirement' and requirement_quota >= 0 then p_qty else 0 end,
    proposal_used    = proposal_used    + case when p_kind = 'proposal'    and proposal_quota    >= 0 then p_qty else 0 end
  where id = v_plan.id;

  insert into public.plan_consumptions (user_plan_id, profile_id, kind, qty, ref_type, ref_id, note)
  values (v_plan.id, p_profile, p_kind, p_qty, p_ref_type, p_ref_id, p_note);

  return v_plan.id;
end $$;

-- Give a proposal back — ONLY valid when the requirement went OFF pre-delivery
-- (Doc2 §4.2). Never used for listings/requirements: off/delete still counted.
create or replace function public.refund_proposal(
  p_consumption uuid, p_reason text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_c public.plan_consumptions%rowtype;
begin
  select * into v_c from public.plan_consumptions
   where id = p_consumption and kind = 'proposal' and reverted_at is null
   for update;
  if not found then return false; end if;

  update public.user_plans
     set proposal_used = greatest(0, proposal_used - v_c.qty)
   where id = v_c.user_plan_id and proposal_quota >= 0;

  update public.plan_consumptions
     set reverted_at = now(), revert_reason = p_reason
   where id = p_consumption;
  return true;
end $$;

-- Atomic refund revoke (Doc2 §4.3): money back AND benefit gone, together.
-- Marks the plan revoked and releases any slot it reserved/consumed so the
-- listings module can unpublish. Returns the affected listing ids.
create or replace function public.revoke_plan_for_refund(
  p_order uuid, p_reason text
) returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  update public.user_plans
     set status = 'revoked', revoked_reason = p_reason
   where order_id = p_order and status <> 'revoked';

  return query
    update public.listing_slots
       set state = 'released', released_reason = p_reason
     where order_id = p_order and state <> 'released'
    returning listing_id;
end $$;

-- Invoice numbering + coupon counter, exposed as RPCs for the server layer.
create or replace function public.nextval_invoice() returns bigint
language sql security definer set search_path = public as $$
  select nextval('public.invoice_seq')
$$;

create or replace function public.increment_coupon_use(p_coupon uuid) returns void
language sql security definer set search_path = public as $$
  update public.coupons set used_count = used_count + 1 where id = p_coupon
$$;

-- These SECURITY DEFINER helpers must never be callable by browser roles.
revoke all on function public.consume_quota(uuid, consumption_kind, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.refund_proposal(uuid, text)          from public, anon, authenticated;
revoke all on function public.revoke_plan_for_refund(uuid, text)   from public, anon, authenticated;
revoke all on function public.nextval_invoice()                    from public, anon, authenticated;
revoke all on function public.increment_coupon_use(uuid)           from public, anon, authenticated;

-- ---- RLS (deny-all for clients; server service-role is the access path) -----
alter table public.plan_catalog       enable row level security;
alter table public.coupons            enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.orders             enable row level security;
alter table public.payments           enable row level security;
alter table public.invoices           enable row level security;
alter table public.user_plans         enable row level security;
alter table public.plan_consumptions  enable row level security;
alter table public.listing_slots      enable row level security;
alter table public.boosts             enable row level security;
alter table public.webhook_events     enable row level security;
alter table public.billing_settings   enable row level security;

-- No policies are created: with RLS enabled and zero policies, anon/authenticated
-- clients get nothing. service_role bypasses RLS and is server-only (Doc9 §4).
-- Doc7 §11 RLS matrix "billing/payments/invoices → owner+admin" is enforced by
-- the API's ownership checks; the browser never queries these tables directly.
