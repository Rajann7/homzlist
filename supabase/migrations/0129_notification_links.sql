-- ---------------------------------------------------------------------------
-- 0129 — every notification row leads somewhere real.
--
-- The P11 S7 inbox lives on seller.<host>, so EVERY href a row carries is
-- resolved against the SELLER route table. Three classes of link were broken:
--
--   1. Wrong host's route. `verification_*` pointed at `/settings/verification`
--      (146 rows) and `area_added` at `/area/{areaSlug}` (21 rows). Neither
--      path exists under /seller — both 404'd on tap.
--
--   2. No template at all. `report_outcome` (164 rows), `new_device_login`
--      (39) and `area_request_dismissed` (18) had href_template NULL, so the
--      row was not clickable — and report_outcome's config action ("View
--      status") had nowhere to go, i.e. a dead button.
--
--   3. A placeholder with no value. resolveHref() trimmed `/property/{id}`
--      back to `/property`, which is not a route either. There was no place to
--      say what a type's SAFE landing page is, so this adds one:
--      `href_fallback`, a real seller route per type, used whenever the
--      specific target cannot be built.
--
-- notify_upsert had the same trap in SQL: `coalesce(p_href, t.href_template)`
-- stored the RAW template when a caller passed no href — which is exactly how
-- rows carrying the literal text `/requirements/{requirementId}` exist today.
--
-- Finally the existing rows are repaired, because a notification whose link
-- 404s does not stop being broken when the config above it is fixed.
-- ---------------------------------------------------------------------------

-- 1. Where a type lands when the specific target cannot be built -------------
alter table public.notification_types
  add column if not exists href_fallback text;

comment on column public.notification_types.href_fallback is
  'Seller-host route used when href_template has a placeholder we cannot fill, or no template exists. Must be a real route under /seller.';

-- 2. Correct the templates that pointed at routes the seller host does not have
update public.notification_types set href_template = '/profile/verification'
 where code in ('verification_approved', 'verification_rejected', 'verification_revoked');

-- "…is now available — post your listing there" — the create flow IS the
-- place to act on it, and it is the same screen whose location picker took the
-- area request in the first place (components/listings/LocationPicker).
update public.notification_types set href_template = '/create'
 where code in ('area_added', 'area_request_dismissed');

-- "New login from Chrome on Windows" — the screen that lists the sessions.
update public.notification_types set href_template = '/settings/login-activity'
 where code = 'new_device_login';

-- An admin broadcast has no other screen to open; linking it at
-- `/notifications` navigated the inbox to itself. Tapping now just marks it
-- read (the component's behaviour for a row with no target).
update public.notification_types set href_template = null
 where code = 'admin_message';

-- 3. A real fallback for every type ------------------------------------------
update public.notification_types set href_fallback = '/messages'
 where href_template like '/messages/%';

update public.notification_types set href_fallback = '/listings'
 where code in ('listing_approved', 'listing_rejected', 'listing_changes_requested',
                'still_available', 'performance_nudge', 'weekly_digest');

update public.notification_types set href_fallback = '/saved'
 where code in ('price_drop', 'saved_listing_status');

update public.notification_types set href_fallback = '/requirements'
 where code in ('requirement_match', 'requirement_expiring');

update public.notification_types set href_fallback = '/proposals'
 where code in ('proposal_received', 'proposal_accepted', 'proposal_declined', 'proposal_expired');

update public.notification_types set href_fallback = '/help/tickets'
 where code in ('support_ticket_created', 'support_ticket_replied');

-- The reporter's outcome: the reported thing's own page when there is one
-- (lib/notifications/admin-events hrefForSubject), support otherwise — a
-- message or user report has no page the reporter may open.
update public.notification_types set href_fallback = '/help'
 where code = 'report_outcome';

-- Everything else already points at a static screen; its own path is the
-- safest landing page it can have.
update public.notification_types
   set href_fallback = href_template
 where href_fallback is null
   and href_template is not null
   and href_template not like '%{%';

-- `admin_message` is deliberately the one type with NO target: its content is
-- the row itself and there is no second screen to open. Tapping it marks it
-- read (components/notifications/Notifications onOpen), so it is still a live
-- control — it is just not a navigation. Every other type must have somewhere
-- to go, and a NULL fallback here would be an oversight, so it is asserted.
do $$
declare v_missing text;
begin
  select string_agg(code::text, ', ') into v_missing
    from public.notification_types
   where href_fallback is null and code <> 'admin_message';
  if v_missing is not null then
    raise exception 'notification types with no href_fallback: %', v_missing;
  end if;
end $$;

-- 4. notify_upsert must never store an unresolved template -------------------
create or replace function public.notify_upsert(
  p_profile     uuid,
  p_type        notification_type,
  p_title       text,
  p_body        text default null,
  p_group_key   text default null,
  p_href        text default null,
  p_thumb_url   text default null,
  p_actions     jsonb default null,
  p_thread_id   uuid default null,
  p_actor_id    uuid default null,
  p_data        jsonb default '{}'::jsonb,
  p_entity_kind text default null,
  p_entity_id   uuid default null,
  p_hold_until  timestamptz default null
) returns table (id uuid, grouped boolean, group_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  t          public.notification_types%rowtype;
  v_id       uuid;
  v_count    integer;
  v_href     text;
begin
  select * into t from public.notification_types where code = p_type;
  if not found then
    raise exception 'unknown notification type %', p_type;
  end if;

  -- The caller's href wins. Failing that, the type's template — but ONLY when
  -- it has no placeholder left in it, because storing `/requirements/{id}`
  -- ships a 404 to the user. An unfillable template falls back to the type's
  -- safe route instead.
  v_href := coalesce(
    p_href,
    case when t.href_template like '%{%' then null else t.href_template end,
    t.href_fallback
  );

  if p_group_key is not null and t.group_window_minutes > 0 then
    update public.notifications n
       set group_count   = n.group_count + 1,
           title         = p_title,
           body          = coalesce(p_body, n.body),
           thumb_url     = coalesce(p_thumb_url, n.thumb_url),
           href          = coalesce(v_href, n.href),
           data          = coalesce(p_data, n.data),
           last_event_at = now(),
           hold_until    = p_hold_until
     where n.profile_id = p_profile
       and n.group_key  = p_group_key
       and n.read_at is null
       and n.dismissed_at is null
       and n.last_event_at > now() - make_interval(mins => t.group_window_minutes)
    returning n.id, n.group_count into v_id, v_count;

    if v_id is not null then
      return query select v_id, true, v_count;
      return;
    end if;
  end if;

  insert into public.notifications
    (profile_id, type, category, title, body, thread_id, actor_id, data,
     group_key, group_count, last_event_at, href, thumb_url, actions,
     is_marketing, entity_kind, entity_id, hold_until)
  values
    (p_profile, p_type, t.category, p_title, p_body, p_thread_id, p_actor_id,
     coalesce(p_data, '{}'::jsonb),
     p_group_key, 1, now(), v_href, p_thumb_url,
     coalesce(p_actions, t.actions), t.is_marketing, p_entity_kind, p_entity_id,
     p_hold_until)
  returning notifications.id into v_id;

  return query select v_id, false, 1;
end;
$$;

revoke all on function public.notify_upsert(uuid, notification_type, text, text, text, text, text, jsonb, uuid, uuid, jsonb, text, uuid, timestamptz) from public, anon, authenticated;

-- 5. Repair the rows that are already sitting in people's inboxes ------------
-- (a) an id we still have → build the real link
update public.notifications n
   set href = '/messages/' || (n.thread_id::text)
 where n.thread_id is not null
   and (n.href is null or n.href like '%{threadId}%' or n.href = '/notifications')
   and n.type in ('inquiry_received', 'new_message', 'chat_accepted', 'chat_declined',
                  'number_requested', 'number_shared', 'proposal_received');

update public.notifications n
   set href = '/requirements/' || (n.data->>'requirementId')
 where n.href like '%{requirementId}%'
   and n.data->>'requirementId' is not null;

update public.notifications n
   set href = '/create/form?edit=' || (n.data->>'listingId')
 where n.href like '%{listingId}%'
   and n.data->>'listingId' is not null;

-- (b) the routes that simply do not exist under /seller
update public.notifications set href = '/profile/verification' where href = '/settings/verification';
update public.notifications set href = '/create'               where href = '/area' or href like '/area/%';
update public.notifications set href = '/saved'                where href = '/property';

-- (c) whatever is left with no link, a self-link, or an unresolved placeholder
update public.notifications n
   set href = t.href_fallback
  from public.notification_types t
 where t.code = n.type
   and (n.href is null or n.href like '%{%' or n.href = '/notifications')
   and t.href_fallback is not null
   and t.href_fallback <> '/';

-- The admin broadcast keeps no link on purpose (see step 2) — tapping marks it
-- read. Undo the blanket repair for exactly that type.
update public.notifications set href = null where type = 'admin_message';

-- 6. The admin panel's own bell (components/admin/panel/BellSheet) -----------
-- Every producer in the code sets link_screen; rows without one are leftovers
-- from an older seeder and render as bell entries that cannot be opened. A
-- sign-in alert belongs on the audit log, which is where lib/admin/sign-in
-- points its own.
update public.admin_notifications set link_screen = 'audit'
 where link_screen is null and (kind = 'login_failures' or title ilike '%sign-in%');

update public.admin_notifications set link_screen = 'dashboard'
 where link_screen is null;
