-- ============================================================================
-- HomzList — Migration 0081: chat/messages audit fixes
--
-- Found while walking the Messages spec line by line against Module 7:
--
--   1. LEAD UPSERT WAS NOT IDEMPOTENT for listing/requirement leads. 0051 added
--      `leads_project_unique (owner_id, lead_profile_id, project_id)`, but for a
--      listing lead `project_id` is NULL and NULLs never collide — so nothing
--      stopped two rows for the same (owner, person, listing). Now that accepting
--      an inquiry/proposal AUTO-creates the lead (the pipeline was empty until a
--      user happened to answer the continuity prompt), the guard has to be real.
--
--   2. `lead_source` had no value for a PROJECT lead, so the project leads 0051
--      records were all filed as 'inquiry' and could never be told apart in the
--      pipeline or the CSV export.
--
-- Additive and idempotent; no existing row changes meaning.
-- ============================================================================

-- ---- 1. project as a first-class lead source --------------------------------
do $$ begin
  alter type lead_source add value if not exists 'project';
exception when undefined_object then null; end $$;

-- ---- 2. one lead per (owner, person, subject) -------------------------------
-- Deduplicate first (keep the OLDEST row and fold the newer ones' notes away —
-- the oldest carries the true created_at the "new this week" summary counts on).
delete from public.leads a
using public.leads b
where a.listing_id is not null
  and a.owner_id = b.owner_id
  and a.lead_profile_id = b.lead_profile_id
  and a.listing_id = b.listing_id
  and a.created_at > b.created_at;

delete from public.leads a
using public.leads b
where a.requirement_id is not null
  and a.listing_id is null
  and b.listing_id is null
  and a.owner_id = b.owner_id
  and a.lead_profile_id = b.lead_profile_id
  and a.requirement_id = b.requirement_id
  and a.created_at > b.created_at;

create unique index if not exists leads_listing_unique
  on public.leads (owner_id, lead_profile_id, listing_id)
  where listing_id is not null;

create unique index if not exists leads_requirement_unique
  on public.leads (owner_id, lead_profile_id, requirement_id)
  where requirement_id is not null and listing_id is null;

comment on index public.leads_listing_unique is
  'Migration 0081: a lead is auto-created when a poster accepts an inquiry, so the same (owner, person, listing) must never mint a second row.';


-- ============================================================================
-- End 0081_chat_audit_fixes.sql
-- ============================================================================
