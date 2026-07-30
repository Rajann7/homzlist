-- 0093 — Support ticket categories as configuration
--
-- P12's category sheet is seven rows, and choosing one reveals a different
-- conditional field (Payment ID / alternate contact / link to the user or
-- listing). That mapping is a config table, not an array inside the component —
-- CLAUDE.md rule 7: option lists come from the database.
--
-- The codes match what 0088's admin seed already writes into
-- support_tickets.category, so the admin desk and the user form speak the same
-- vocabulary. `grievance` is deliberately not in the picker: it is reached from
-- the Grievance Officer page, and it carries the 2021-Rules SLA
-- (24h acknowledgement, 15-day resolution) instead of the ordinary one.

create table if not exists public.ticket_categories (
  code           text primary key,
  label          text not null,
  icon           text not null default 'more',
  -- which conditional field the form reveals: null | payment_ref | alt_contact | report_link
  extra_field    text,
  extra_label    text,
  extra_hint     text,
  extra_warning  text,
  is_grievance   boolean not null default false,
  in_picker      boolean not null default true,
  ack_hours      int not null default 24,
  resolve_days   int not null default 7,
  sort_order     int not null default 0,
  is_active      boolean not null default true
);

insert into public.ticket_categories
  (code, label, icon, extra_field, extra_label, extra_hint, extra_warning, is_grievance, in_picker, ack_hours, resolve_days, sort_order)
values
  ('payment_refund', 'Payment or refund', 'card', 'payment_ref', 'Payment ID',
   'Find it in Payments → Details', null, false, true, 24, 7, 1),
  ('listing_not_approved', 'Listing not approved', 'building', null, null, null, null, false, true, 24, 7, 2),
  ('number_recovery', 'Lost access to my number', 'phone', 'alt_contact', 'Alternate number or email', null,
   'You''ll be asked to verify ownership. Our team will contact you on your alternate number or email.',
   false, true, 24, 7, 3),
  ('report', 'Report a user or listing', 'alert', 'report_link', 'Link to the user or listing', null, null,
   false, true, 24, 7, 4),
  ('verification', 'Verification issue', 'verified', null, null, null, null, false, true, 24, 7, 5),
  ('bug', 'Bug or technical problem', 'settings', null, null, null, null, false, true, 24, 7, 6),
  ('other', 'Something else', 'more', null, null, null, null, false, true, 24, 7, 7),
  ('grievance', 'Grievance complaint', 'shield', 'report_link', 'Link to the listing, profile or content', null,
   'Grievances are acknowledged within 24 hours with a ticket number and resolved within 15 days, as required by the IT Rules, 2021.',
   true, false, 24, 15, 8)
on conflict (code) do update set
  label = excluded.label, icon = excluded.icon, extra_field = excluded.extra_field,
  extra_label = excluded.extra_label, extra_hint = excluded.extra_hint,
  extra_warning = excluded.extra_warning, is_grievance = excluded.is_grievance,
  in_picker = excluded.in_picker, ack_hours = excluded.ack_hours,
  resolve_days = excluded.resolve_days, sort_order = excluded.sort_order, is_active = true;

alter table public.ticket_categories enable row level security;

-- 0088's admin seed already reached TKT-2869; keep human-facing numbers moving
-- forward from there rather than colliding.
select setval('public.support_ticket_seq', greatest(
  2870,
  coalesce((select max(nullif(regexp_replace(number, '\D', '', 'g'), ''))::int from public.support_tickets), 0) + 1
), false);
