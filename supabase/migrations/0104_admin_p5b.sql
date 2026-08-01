-- ============================================================================
-- P5b — A16 Finance · A17/A18 Payments list.
--
-- The payment PANEL shipped in P4 (A11's Payments tab pushes it). This is the
-- list it sits under, and the four Finance tabs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A17 — the payments list.
--
-- The design's row draws the payment ID, the USER, the ITEM, the amount with
-- its pre-discount strike-through, the method and the date (template 1136).
-- Every one of those lives on a different table, and the engine filters and
-- sorts on real columns only — so they are flattened here.
--
-- `strike_paise` is the design's struck-out original: it is only present when a
-- coupon actually reduced the order, so the cell cannot show "₹999 → ₹999".
-- ---------------------------------------------------------------------------
create or replace view public.admin_payment_list
with (security_invoker = true) as
select
  pay.id,
  pay.razorpay_payment_id,
  pay.profile_id,
  p.name                                          as user_name,
  p.photo_url                                     as user_photo,
  pay.order_id,
  o.catalog_code,
  coalesce(pc.name, o.catalog_code)               as item_name,
  o.kind::text                                    as order_kind,
  pay.amount_paise,
  case when o.discount_paise > 0 then o.base_paise end as strike_paise,
  o.coupon_code,
  o.cgst_paise + o.sgst_paise + o.igst_paise      as gst_paise,
  pay.method,
  pay.method_detail,
  -- "UPI · GPay" — one cell in the design, two columns in the schema
  trim(both ' ·' from concat_ws(' · ', pay.method, pay.method_detail)) as method_label,
  pay.status::text                                as status_key,
  pay.failure_reason,
  pay.refunded_at,
  pay.captured_at,
  pay.created_at,
  o.razorpay_order_id,
  exists (select 1 from public.chargebacks cb where cb.payment_id = pay.id) as has_chargeback,
  (select i.number from public.invoices i where i.payment_id = pay.id limit 1) as invoice_number
from public.payments pay
join public.orders o on o.id = pay.order_id
join public.profiles p on p.id = pay.profile_id
left join public.plan_catalog pc on pc.code = o.catalog_code;

-- ---------------------------------------------------------------------------
-- 2. A17's "Abandoned" tab — checkouts started and never finished.
--
-- NOT a payment: there is no payments row, which is exactly what makes it
-- abandoned. It is an ORDER that never reached `paid`, so it needs its own
-- relation rather than a status on the payments view — a filter that pretended
-- otherwise would show an empty tab forever.
-- ---------------------------------------------------------------------------
create or replace view public.admin_abandoned_checkouts
with (security_invoker = true) as
select
  o.id,
  o.profile_id,
  p.name                                          as user_name,
  p.phone                                         as user_phone,
  p.email                                         as user_email,
  o.catalog_code,
  coalesce(pc.name, o.catalog_code)               as item_name,
  o.total_paise,
  o.created_at,
  o.status::text                                  as order_status
from public.orders o
join public.profiles p on p.id = o.profile_id
left join public.plan_catalog pc on pc.code = o.catalog_code
where o.status in ('created', 'pending')
  and not exists (
    select 1 from public.payments pay
     where pay.order_id = o.id and pay.status = 'success'
  );

-- ---------------------------------------------------------------------------
-- 3. A16 Churn — plans about to expire, and whether they were renewed.
--
-- "Renewed?" is the column the design draws (template 1152). A plan is renewed
-- when the SAME user bought the SAME product again after this one started —
-- which is a fact about orders, not a flag anybody sets.
-- ---------------------------------------------------------------------------
create or replace view public.admin_churn_list
with (security_invoker = true) as
select
  up.id,
  up.profile_id,
  p.name                                          as user_name,
  p.photo_url                                     as user_photo,
  up.catalog_code,
  coalesce(pc.name, up.catalog_code)              as plan_name,
  pc.price_paise,
  up.purchased_at,
  up.expires_at,
  up.status::text                                 as plan_status,
  up.is_trial,
  (up.expires_at < now() + interval '7 days')     as expiring_soon,
  exists (
    select 1 from public.orders o2
     where o2.profile_id = up.profile_id
       and o2.catalog_code = up.catalog_code
       and o2.status = 'paid'
       and o2.created_at > up.purchased_at
  )                                               as renewed
from public.user_plans up
join public.profiles p on p.id = up.profile_id
left join public.plan_catalog pc on pc.code = up.catalog_code
where up.expires_at is not null
  and up.status = 'active';

do $$
declare v text;
begin
  foreach v in array array[
    'admin_payment_list','admin_abandoned_checkouts','admin_churn_list'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', v);
  end loop;
end $$;

create index if not exists payments_profile_idx     on public.payments (profile_id, created_at desc);
create index if not exists payments_status_idx      on public.payments (status, created_at desc);
create index if not exists orders_profile_status_idx on public.orders (profile_id, status);
create index if not exists user_plans_expiry_idx    on public.user_plans (expires_at)
  where status = 'active' and expires_at is not null;
create index if not exists invoices_payment_idx     on public.invoices (payment_id);
create index if not exists chargebacks_payment_idx  on public.chargebacks (payment_id);
