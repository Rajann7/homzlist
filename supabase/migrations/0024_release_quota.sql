-- ============================================================================
-- HomzList — Migration 0024: give quota back when the thing it paid for fails
--
-- `consume_quota` (0004) draws a unit and records a plan_consumptions row in one
-- atomic statement. But the CALLER then inserts the requirement/listing in a
-- SEPARATE statement, and if that insert throws, the draw is never undone: the
-- user is charged a requirement they do not have.
--
-- This is not hypothetical. On the dev database, `plan_consumptions` held two
-- kind='requirement' rows with ref_id IS NULL for a broker who owned ZERO
-- requirement rows, and requirement_used was incremented on both of that
-- profile's plans. Quota spent, nothing delivered, no way back.
--
-- `release_quota` is the compensating half: it decrements the same counter and
-- marks the consumption reverted, so a failed create leaves the pool exactly as
-- it found it. Doc2 §4.2 (atomic counters) / CLAUDE.md "what happens when step
-- 2 of 2 fails" — money and benefit must never separate.
--
-- Deliberately NOT used for the ordinary "turn a requirement off" case: Doc2
-- §4.2 says that does not return quota. This is failure-only.
-- ============================================================================

create or replace function public.release_quota(
  p_profile uuid, p_user_plan uuid, p_kind consumption_kind,
  p_qty integer default 1, p_reason text default 'create failed'
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_consumption uuid;
begin
  if p_qty is null or p_qty <= 0 then return false; end if;

  -- Hand the units back, never below zero (the counter is also CHECK-guarded).
  update public.user_plans set
    listing_used     = greatest(0, listing_used     - case when p_kind = 'listing'     and listing_quota     >= 0 then p_qty else 0 end),
    requirement_used = greatest(0, requirement_used - case when p_kind = 'requirement' and requirement_quota >= 0 then p_qty else 0 end),
    proposal_used    = greatest(0, proposal_used    - case when p_kind = 'proposal'    and proposal_quota    >= 0 then p_qty else 0 end)
  where id = p_user_plan and profile_id = p_profile;

  if not found then return false; end if;

  -- Mark the most recent un-reverted consumption of this kind as rolled back,
  -- so "WHAT YOU'VE USED" and the admin audit both stop counting it.
  select id into v_consumption
    from public.plan_consumptions
   where user_plan_id = p_user_plan and profile_id = p_profile
     and kind = p_kind and reverted_at is null
   order by created_at desc
   limit 1;

  if v_consumption is not null then
    update public.plan_consumptions
       set reverted_at = now(), revert_reason = p_reason
     where id = v_consumption;
  end if;

  return true;
end $$;

revoke all on function public.release_quota(uuid, uuid, consumption_kind, integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Repair the rows the missing compensation already stranded: any consumption
-- that points at nothing and never got a ref_id is a create that died.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select pc.id, pc.user_plan_id, pc.profile_id, pc.kind, pc.qty
      from public.plan_consumptions pc
     where pc.reverted_at is null
       and pc.ref_type = 'requirement'
       and pc.ref_id is null
       and not exists (
         select 1 from public.requirements rq
          where rq.profile_id = pc.profile_id
            and rq.slot_consumed_at is not null
            and rq.created_at between pc.created_at - interval '1 minute'
                                  and pc.created_at + interval '1 minute')
  loop
    perform public.release_quota(r.profile_id, r.user_plan_id, r.kind, r.qty,
                                 'backfill: requirement create failed after the quota draw');
  end loop;
end $$;
