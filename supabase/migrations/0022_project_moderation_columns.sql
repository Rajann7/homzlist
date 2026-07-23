-- ============================================================================
-- HomzList — Migration 0022: give projects the moderation columns
--
-- The moderation state machine (migration 0019) works on listings and
-- requirements, but PROJECTS were never given the columns it writes:
-- review_notes / reject_reason / reject_count / is_locked / submitted_at.
--
-- Effect discovered in QA: `reviewQueue('project')` ordered by `submitted_at`,
-- which doesn't exist on projects, so the query errored and returned [] — a
-- builder's ₹9,999 project could NEVER appear in the review queue, and even if
-- it did, approve/reject would fail writing the missing columns. Same
-- dead-end that listings had, for projects specifically.
-- ============================================================================

alter table public.projects
  add column if not exists review_notes  jsonb,
  add column if not exists reject_reason text,
  add column if not exists reject_count  integer not null default 0,
  add column if not exists is_locked     boolean not null default false,
  add column if not exists submitted_at  timestamptz;

-- A project is submitted the moment it's created (no draft step), so existing
-- pending projects get their submit time from creation.
update public.projects set submitted_at = created_at where submitted_at is null;
