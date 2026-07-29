-- 0079 — a project can finally be hidden and deleted.
--
-- A listing has had the whole state machine since Module 4: hide/unhide,
-- delete → 30-day trash → restore, and a purge cron on the 31st day. A PROJECT
-- had none of it. There was no status route and no DELETE route, and the code
-- that reads a builder's projects filtered on a `deleted_at` that nothing in
-- the product ever set — so a scheme posted by mistake stayed on the profile
-- and in the feed permanently, and the ₹9,999 slot it drew could never be
-- released.
--
-- `projects.status` is already the shared `listing_state` enum, so 'hidden' and
-- 'deleted' need no new values. What was missing is the timestamp that says
-- WHEN it was hidden — the listings table has carried `hidden_at` since 0004,
-- and the boost-pause/resume path reads it as the audit trail for a paused
-- window.

alter table public.projects
  add column if not exists hidden_at timestamptz;

comment on column public.projects.hidden_at is
  'When the builder hid this project. Cleared on unhide. Mirrors listings.hidden_at.';

-- The manager, the trash screen and the purge cron all read a builder''s rows
-- filtered by status; without this they sequential-scan `projects` once per
-- screen.
create index if not exists projects_profile_status_idx
  on public.projects (profile_id, status, created_at desc);

-- The 30-day purge sweep looks for exactly this.
create index if not exists projects_deleted_at_idx
  on public.projects (deleted_at)
  where deleted_at is not null;
