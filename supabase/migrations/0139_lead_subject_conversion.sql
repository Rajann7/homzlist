-- ============================================================================
-- HomzList — Migration 0139: conversion in the per-subject counts
--
-- With chat gone, the only quality metric a seller has left is what happens to
-- their leads: how many were contacted, and how many turned into something.
-- The Received list already reads one aggregate per owner, so the two numbers
-- ride along with it rather than becoming a second query or — worse — an
-- undesigned analytics screen.
--
-- The return type changes, so the old function is dropped first (Postgres will
-- not widen a returns-table in place).
-- ============================================================================

drop function if exists public.lead_subject_counts(uuid);

create function public.lead_subject_counts(p_owner uuid)
returns table (
  kind       text,
  subject_id uuid,
  total      bigint,
  unseen     bigint,
  contacted  bigint,
  converted  bigint,
  last_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select case
           when listing_id     is not null then 'listing'
           when project_id     is not null then 'project'
           when requirement_id is not null then 'requirement'
         end as kind,
         coalesce(listing_id, project_id, requirement_id) as subject_id,
         count(*)::bigint                                  as total,
         count(*) filter (where seen_at is null)::bigint    as unseen,
         -- "Reached out at least once" — the legacy stages count as contacted
         -- too, so a pipeline built before the rename still reads correctly.
         count(*) filter (
           where stage in ('contacted','visit','negotiation','converted','closed_won')
         )::bigint                                          as contacted,
         count(*) filter (where stage in ('converted','closed_won'))::bigint as converted,
         max(last_activity_at)                              as last_at
    from public.leads
   where owner_id = p_owner
     and is_relevant
     and coalesce(listing_id, project_id, requirement_id) is not null
   group by 1, 2
$$;

revoke all on function public.lead_subject_counts(uuid) from public, anon, authenticated;
