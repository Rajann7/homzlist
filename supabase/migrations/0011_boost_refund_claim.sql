-- ============================================================================
-- HomzList — Migration 0011: make the boost refund single-flight
--
-- Two code paths refund a cancelled/rejected boost: the inline handler in
-- POST /billing/boost/:id/cancel, and the hourly `refundRejectedBoosts` sweep.
-- Both selected on `refunded_at is null` and then called Razorpay, with no lock
-- between the read and the call. If the sweep ran inside the window between
-- the cancel flipping status and the handler writing `refunded_at`, BOTH could
-- issue a refund for the same payment. Razorpay would probably reject the
-- second, but "the gateway will catch it" is not a control we own (Doc2 §15
-- atomic counters / Doc9 §12).
--
-- `refund_claimed_at` is the claim. A refund attempt must win a conditional
-- UPDATE before it may talk to Razorpay; the loser skips. A claim that dies
-- mid-flight (process killed) goes stale after `p_stale_minutes` so the boost
-- can never be stranded un-refunded forever.
-- ============================================================================

alter table public.boosts add column if not exists refund_claimed_at timestamptz;

-- Refund workers scan on this; keep it cheap.
create index if not exists boosts_refund_pending_idx
  on public.boosts (status, refunded_at, refund_claimed_at)
  where refunded_at is null;

/**
 * Try to become the single refunder for this boost.
 * Returns true only for the caller that wins the claim.
 */
create or replace function public.claim_boost_refund(
  p_boost uuid, p_stale_minutes integer default 15
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed integer;
begin
  update public.boosts
     set refund_claimed_at = now()
   where id = p_boost
     and refunded_at is null
     -- free, or a previous attempt that died before finishing
     and (refund_claimed_at is null
          or refund_claimed_at < now() - make_interval(mins => greatest(coalesce(p_stale_minutes, 15), 1)));
  get diagnostics v_claimed = row_count;
  return v_claimed > 0;
end $$;

/** Hand the claim back when the refund attempt failed, so the sweep retries. */
create or replace function public.release_boost_refund_claim(p_boost uuid) returns void
language sql security definer set search_path = public as $$
  update public.boosts set refund_claimed_at = null
   where id = p_boost and refunded_at is null;
$$;

-- Server-only, same as every other SECURITY DEFINER helper in this schema.
revoke all on function public.claim_boost_refund(uuid, integer)   from public, anon, authenticated;
revoke all on function public.release_boost_refund_claim(uuid)    from public, anon, authenticated;
