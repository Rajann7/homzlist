-- ============================================================================
-- HomzList — Migration 0066: teach the quota functions about 'project'
--
-- Part 2 of 0065. Migrates the plans and the trace that already exist, then
-- rewrites consume_quota / release_quota to carry the new kind with exactly the
-- same contention behaviour 0004 and 0024 established (guarded UPDATE, FIFO,
-- no false exhaustion).
-- ============================================================================

-- ---- 1. live plans -------------------------------------------------------
-- A ₹9,999 plan that has already been bought holds its project entitlement in
-- listing_quota/listing_used, because that is where it was spent. Move it, so
-- the counter reads what the builder actually purchased. Anything already used
-- stays used — this re-labels the unit, it does not refund it.
update public.user_plans
   set project_quota = greatest(listing_quota, 0),
       project_used  = least(listing_used, greatest(listing_quota, 0)),
       listing_quota = 0,
       listing_used  = 0
 where catalog_code = 'p9999'
   and project_quota = 0;

-- ---- 2. the consumed trace ----------------------------------------------
-- Rows written when a project drew a listing unit. My Plan prints these, so
-- leaving them as "listing" would show a builder a listing slot they never got.
update public.plan_consumptions
   set kind = 'project'
 where kind = 'listing'
   and ref_type = 'project';

-- ---- 3. consume_quota ----------------------------------------------------
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
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then return null; end if;

    -- Oldest active plan that still has room (FIFO — Doc2 §4.2).
    select id into v_id
      from public.user_plans
     where profile_id = p_profile
       and status = 'active'
       and (expires_at is null or expires_at > now())
       and case p_kind
             when 'listing'     then listing_quota     <> 0 and (listing_quota     < 0 or listing_used     + p_qty <= listing_quota)
             when 'requirement' then requirement_quota <> 0 and (requirement_quota < 0 or requirement_used + p_qty <= requirement_quota)
             when 'proposal'    then proposal_quota    <> 0 and (proposal_quota    < 0 or proposal_used    + p_qty <= proposal_quota)
             when 'project'     then project_quota     <> 0 and (project_quota     < 0 or project_used     + p_qty <= project_quota)
           end
     order by purchased_at asc, id asc
     limit 1;

    if v_id is null then return null; end if;

    -- Claim it. The WHERE repeats the bound, so losing a race to a concurrent
    -- draw changes zero rows and we reconsider rather than reporting empty.
    update public.user_plans set
      listing_used     = listing_used     + case when p_kind = 'listing'     and listing_quota     >= 0 then p_qty else 0 end,
      requirement_used = requirement_used + case when p_kind = 'requirement' and requirement_quota >= 0 then p_qty else 0 end,
      proposal_used    = proposal_used    + case when p_kind = 'proposal'    and proposal_quota    >= 0 then p_qty else 0 end,
      project_used     = project_used     + case when p_kind = 'project'     and project_quota     >= 0 then p_qty else 0 end
    where id = v_id
      and status = 'active'
      and (expires_at is null or expires_at > now())
      and case p_kind
            when 'listing'     then listing_quota     <> 0 and (listing_quota     < 0 or listing_used     + p_qty <= listing_quota)
            when 'requirement' then requirement_quota <> 0 and (requirement_quota < 0 or requirement_used + p_qty <= requirement_quota)
            when 'proposal'    then proposal_quota    <> 0 and (proposal_quota    < 0 or proposal_used    + p_qty <= proposal_quota)
            when 'project'     then project_quota     <> 0 and (project_quota     < 0 or project_used     + p_qty <= project_quota)
          end
    returning id into v_claimed;

    if v_claimed is not null then
      insert into public.plan_consumptions (user_plan_id, profile_id, kind, qty, ref_type, ref_id, note)
      values (v_claimed, p_profile, p_kind, p_qty, p_ref_type, p_ref_id, p_note);
      return v_claimed;
    end if;
  end loop;
end $$;

revoke all on function public.consume_quota(uuid, consumption_kind, integer, text, uuid, text) from public, anon, authenticated;

-- ---- 4. release_quota ----------------------------------------------------
-- FAILURE-ONLY, exactly as 0024 defined it: this undoes a draw whose creation
-- died afterwards. It is never wired to ordinary withdrawal (Doc2 §4.2).
-- Identical to 0024 apart from the fourth counter — same signature, same
-- "mark the newest un-reverted consumption" behaviour, same return contract.
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
    proposal_used    = greatest(0, proposal_used    - case when p_kind = 'proposal'    and proposal_quota    >= 0 then p_qty else 0 end),
    project_used     = greatest(0, project_used     - case when p_kind = 'project'     and project_quota     >= 0 then p_qty else 0 end)
  where id = p_user_plan and profile_id = p_profile;

  if not found then return false; end if;

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
