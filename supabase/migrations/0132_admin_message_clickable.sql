-- ---------------------------------------------------------------------------
-- 0132 — the admin broadcast becomes clickable too.
--
-- 0129 left `admin_message` as the one type with no target, on the reasoning
-- that its content is the row itself. That was wrong: the message is always
-- ABOUT something the user can open. There are five producers —
--
--   lib/admin/decisions      "A note from the HomzList team"  (a warning)
--   lib/admin/listings-master a compliance edit / a hidden listing
--   lib/admin/users           a granted trial
--   lib/admin/users           a broadcast to a segment
--
-- — and the ones that know their subject now pass an href (the listing, the
-- plan). Everything else lands on Account status, which is the screen that
-- already lists exactly these notices: rejections, warnings and report
-- outcomes with their severity dots (components/profile/AccountStatus).
-- ---------------------------------------------------------------------------

update public.notification_types
   set href_fallback = '/settings/account-status'
 where code = 'admin_message';

-- Existing rows that recorded WHICH listing or project they were about open it.
update public.notifications
   set href = '/listings/' || entity_id::text
 where type = 'admin_message' and entity_kind = 'listing' and entity_id is not null;

update public.notifications
   set href = '/projects/' || entity_id::text
 where type = 'admin_message' and entity_kind = 'project' and entity_id is not null;

update public.notifications
   set href = '/requirements/' || entity_id::text
 where type = 'admin_message' and entity_kind = 'requirement' and entity_id is not null;

-- Every other broadcast lands on Account status.
update public.notifications
   set href = '/settings/account-status'
 where type = 'admin_message' and href is null;

-- From here on there is no such thing as a notification you cannot open.
do $$
declare v_dead integer;
begin
  select count(*) into v_dead from public.notifications where href is null;
  if v_dead > 0 then
    raise exception '% notification row(s) still have no link', v_dead;
  end if;
  select count(*) into v_dead from public.notification_types where href_fallback is null;
  if v_dead > 0 then
    raise exception '% notification type(s) still have no landing page', v_dead;
  end if;
end $$;
