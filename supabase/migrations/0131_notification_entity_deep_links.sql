-- ---------------------------------------------------------------------------
-- 0131 — rows that knew their subject but linked to a list page.
--
-- A producer that set `entityKind`/`entityId` but did not ALSO repeat the id
-- inside `data` produced a template with an unfillable placeholder, which fell
-- back to the type's list screen: 127 "Your listing is now live" rows opened
-- My Listings instead of the listing. lib/notifications/service now fills the
-- placeholder from the entity itself; these are the rows already written.
--
-- Grouped rows are left alone on purpose — "8 listings approved — tap to
-- review" is ABOUT the list, and its own href was set deliberately.
-- ---------------------------------------------------------------------------

update public.notifications n
   set href = '/listings/' || n.entity_id::text
 where n.type in ('listing_approved', 'listing_rejected')
   and n.entity_kind = 'listing'
   and n.entity_id is not null
   and n.href = '/listings'
   and coalesce(n.group_count, 1) = 1;

update public.notifications n
   set href = '/create/form?edit=' || n.entity_id::text
 where n.type in ('listing_changes_requested', 'performance_nudge')
   and n.entity_kind = 'listing'
   and n.entity_id is not null
   and n.href = '/listings';

update public.notifications n
   set href = '/listings/' || n.entity_id::text
 where n.type = 'still_available'
   and n.entity_kind = 'listing'
   and n.entity_id is not null
   and n.href = '/listings';

update public.notifications n
   set href = '/requirements/' || n.entity_id::text
 where n.type in ('requirement_match', 'requirement_expiring')
   and n.entity_kind = 'requirement'
   and n.entity_id is not null
   and n.href = '/requirements';
