-- ---------------------------------------------------------------------------
-- 0130 — a moderation decision must open the thing it decided on.
--
-- lib/listings/moderation notifyModerationDecision is shared by listings,
-- projects and requirements, but the three notification types it sends are
-- listing-shaped: `/listings/{listingId}` and `/create/form?edit={listingId}`.
-- With no href override the template resolved against the PROJECT's or
-- REQUIREMENT's id, so:
--
--   an approved project     → /listings/<project id>
--   an approved requirement → /listings/<requirement id>
--   changes on a project    → /create/form?edit=<project id>   (the flat form)
--
-- Every one of those opens the wrong screen for the row's own subject. The
-- producer now builds the link from `subject`; these are the rows already in
-- people's inboxes, repaired from `entity_kind` — which recorded the true
-- subject all along.
-- ---------------------------------------------------------------------------

update public.notifications
   set href = '/projects/' || entity_id::text
 where type in ('listing_approved', 'listing_rejected')
   and entity_kind = 'project' and entity_id is not null;

update public.notifications
   set href = '/requirements/' || entity_id::text
 where type in ('listing_approved', 'listing_rejected')
   and entity_kind = 'requirement' and entity_id is not null;

update public.notifications
   set href = '/projects/new?edit=' || entity_id::text
 where type = 'listing_changes_requested'
   and entity_kind = 'project' and entity_id is not null;

update public.notifications
   set href = '/requirements/new?edit=' || entity_id::text
 where type = 'listing_changes_requested'
   and entity_kind = 'requirement' and entity_id is not null;

-- The grouped row ("3 requirements approved — tap to review") lands on the
-- list that actually holds them.
update public.notifications
   set href = '/requirements/mine'
 where type = 'listing_approved'
   and entity_kind = 'requirement'
   and group_count > 1;
