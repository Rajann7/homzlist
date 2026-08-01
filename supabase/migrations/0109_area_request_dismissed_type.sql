-- ============================================================================
-- The row for the enum value 0108 added.
--
-- Split into its own migration on purpose: Postgres will not let a transaction
-- USE an enum value it added in the same transaction, and the migration runner
-- wraps each file in one. 0108 adds the label, this adds the row that describes
-- it — the same two-step every enum addition in this schema needs.
-- ============================================================================

insert into public.notification_types
  (code, category, label, lead_kind, lead_icon, lead_tone, href_template, actions,
   is_urgent, is_marketing, default_push, default_email, group_window_minutes,
   show_thumb, sort_order, pref_group)
select 'area_request_dismissed', 'listing', 'Area request', 'icon', 'pin', 'neutral',
       null, '[]'::jsonb, false, false, true, false, 0, false, 0, 'n_perf'
where not exists (
  select 1 from public.notification_types where code::text = 'area_request_dismissed'
);
