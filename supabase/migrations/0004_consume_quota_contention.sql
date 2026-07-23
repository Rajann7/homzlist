-- ============================================================================
-- HomzList — Migration 0004: fix consume_quota under contention
--
-- 0003 selected the FIFO plan with `FOR UPDATE SKIP LOCKED`. That prevents
-- double-spend, but it also makes concurrent callers SKIP a plan that merely
-- has a lock on it and then report the pool as exhausted. Measured: 25
-- concurrent draws against a pool of 19 granted only 2 and denied 23 — users
-- would see a false "out of proposals" whenever two sends overlapped.
--
-- This version claims a plan with a guarded UPDATE instead. The UPDATE takes
-- the row lock itself and re-checks the quota bound as part of its WHERE, so:
--   * no overspend  — the bound is enforced inside the same statement, and
--   * no false exhaustion — losing the race just moves us to the next candidate
--     rather than giving up.
-- Doc2 §4.2 (atomic counters, FIFO pool) / Doc2 §15 (atomic counters everywhere).
-- ============================================================================

create or replace function public.consume_quota(
  p_profile uuid, p_kind consumption_kind, p_qty integer,
  p_ref_type text default null, p_ref_id uuid default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid;
  v_claimed  uuid;
  v_attempts integer := 0;
begin
  if p_qty is null or p_qty <= 0 then return null; end if;

  loop
    -- Guard against pathological spinning; the pool is small in practice.
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then return null; end if;

    -- Oldest active plan that still has room (FIFO — Doc2 §4.2).
    -- No row lock here: the UPDATE below is what actually claims it.
    select id into v_id
      from public.user_plans
     where profile_id = p_profile
       and status = 'active'
       and (expires_at is null or expires_at > now())
       and case p_kind
             when 'listing'     then listing_quota     <> 0 and (listing_quota     < 0 or listing_used     + p_qty <= listing_quota)
             when 'requirement' then requirement_quota <> 0 and (requirement_quota < 0 or requirement_used + p_qty <= requirement_quota)
             when 'proposal'    then proposal_quota    <> 0 and (proposal_quota    < 0 or proposal_used    + p_qty <= proposal_quota)
           end
     order by purchased_at asc, id asc
     limit 1;

    -- Pool genuinely exhausted.
    if v_id is null then return null; end if;

    -- Claim it. The WHERE repeats the bound, so if a concurrent transaction
    -- consumed the remaining balance between our SELECT and this UPDATE, zero
    -- rows change and we simply try the next plan.
    update public.user_plans set
      listing_used     = listing_used     + case when p_kind = 'listing'     and listing_quota     >= 0 then p_qty else 0 end,
      requirement_used = requirement_used + case when p_kind = 'requirement' and requirement_quota >= 0 then p_qty else 0 end,
      proposal_used    = proposal_used    + case when p_kind = 'proposal'    and proposal_quota    >= 0 then p_qty else 0 end
    where id = v_id
      and status = 'active'
      and (expires_at is null or expires_at > now())
      and case p_kind
            when 'listing'     then listing_quota     <> 0 and (listing_quota     < 0 or listing_used     + p_qty <= listing_quota)
            when 'requirement' then requirement_quota <> 0 and (requirement_quota < 0 or requirement_used + p_qty <= requirement_quota)
            when 'proposal'    then proposal_quota    <> 0 and (proposal_quota    < 0 or proposal_used    + p_qty <= proposal_quota)
          end
    returning id into v_claimed;

    if v_claimed is not null then
      insert into public.plan_consumptions (user_plan_id, profile_id, kind, qty, ref_type, ref_id, note)
      values (v_claimed, p_profile, p_kind, p_qty, p_ref_type, p_ref_id, p_note);
      return v_claimed;
    end if;
    -- Lost the race for this plan — loop and reconsider.
  end loop;
end $$;

revoke all on function public.consume_quota(uuid, consumption_kind, integer, text, uuid, text) from public, anon, authenticated;
