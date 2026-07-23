-- ============================================================================
-- HomzList — Migration 0012: never hold a buyer's money in a dead-end state
--
-- `activateBoostForOrder` parks a paid boost at `pending_approval`, and NOTHING
-- transitions it to `active` — approve/reject is the admin module (P13-15),
-- which isn't built. So today a user pays ₹499 and the boost sits there forever
-- with no refund path: a dead-end state the user PAID to reach.
--
-- The safety valve is auto-REFUND, not auto-approve: approving without review
-- would bypass the moderation gate Doc2 §13 requires, which is a quality/abuse
-- control, not a formality. Refunding is always the safe direction — the user
-- gets their money back and can simply buy again once admin exists.
--
-- The window is a SETTING, not a constant, so it can be tuned (or effectively
-- disabled with a large value) without a deploy once the admin queue is live.
-- ============================================================================

insert into public.billing_settings (key, value) values
  -- Hours a paid boost may wait for admin approval before it is auto-refunded.
  ('boost_pending_max_hours', '48'::jsonb)
on conflict (key) do nothing;

-- `EXPIRED10` was seeded to exercise the expired-coupon branch but never given
-- an expiry, so it validated as a LIVE ₹100 coupon — the opposite of its intent.
update public.coupons
   set expires_at = now() - interval '1 day'
 where code = 'EXPIRED10' and expires_at is null;
