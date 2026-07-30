-- Module 11 Part 2 (A4–A9): the config behind the review screens.
--
-- CLAUDE.md rule 7: every option list a screen renders comes from a config
-- table, not from an array inside a component. A4–A9 render six such lists that
-- the design writes out literally — SOP checklists, change-request field chips
-- and their note templates, verification reject reasons, boost refund reasons,
-- warning templates and suspension durations. Seeded here with the design's
-- exact wording (designs/P13-14-15), so an admin can retire a reason later
-- without a deploy, and the screen still cannot invent one.
--
-- Also closes two holes that would have made A7/A8 unprovable:
--   · `verifications` recorded WHO submitted but never who decided,
--   · `moderation_appeals` had no way to say which admin looked at it beyond
--     resolved_by, and no note of the reject-lock unlock it granted.

-- ---------------------------------------------------------------- SOP checklists
-- Doc5 A4/A5/A7: "SOP checklist" — the reviewer's own ticklist. Per subject,
-- and for verifications per level, because an ID check and a RERA check are not
-- the same job.
create table if not exists public.review_sop_items (
  id           uuid primary key default gen_random_uuid(),
  -- listing | requirement | verification_id | verification_rera
  scope        text not null,
  label        text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (scope, label)
);
create index if not exists review_sop_scope_idx on public.review_sop_items (scope, sort_order);

insert into public.review_sop_items (scope, label, sort_order) values
  ('listing', 'Photos show the actual property (not screenshots or brochures)', 1),
  ('listing', 'Price is plausible for the area', 2),
  ('listing', 'Title and description match the type', 3),
  ('listing', 'Location is complete (area + pincode)', 4),
  ('listing', 'No phone numbers or links in text', 5),
  ('listing', 'Co-ownership / POA is acceptable', 6),
  ('listing', 'Multiple brokers listing the same property is allowed', 7),
  ('requirement', 'Budget range is realistic', 1),
  ('requirement', 'Areas exist in master data', 2),
  ('requirement', 'No contact details in notes', 3),
  ('requirement', 'Not a disguised advertisement', 4),
  ('verification_id', 'Name matches account', 1),
  ('verification_id', 'Document is legible and unexpired', 2),
  ('verification_id', 'Photo matches profile', 3),
  ('verification_id', 'Address is readable', 4),
  ('verification_rera', 'Name matches account', 1),
  ('verification_rera', 'Document is legible and unexpired', 2),
  ('verification_rera', 'RERA number format is valid', 3),
  ('verification_rera', 'Certificate matches the number', 4)
on conflict (scope, label) do nothing;

-- ------------------------------------------------- change-request field chips
-- Doc5 A4: "Request changes note composer (field chips + templates)". The chip
-- is the field the poster must fix; the body is the pre-filled note. `field_key`
-- is what `listings.review_notes` is keyed by, so the poster's own screen shows
-- the note next to the right field.
create table if not exists public.change_request_fields (
  id          uuid primary key default gen_random_uuid(),
  subject_type text not null,           -- listing | requirement
  field_key   text not null,            -- review_notes key
  label       text not null,            -- the chip
  template    text not null,            -- pre-filled note body
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (subject_type, field_key)
);
create index if not exists change_request_fields_idx
  on public.change_request_fields (subject_type, sort_order);

insert into public.change_request_fields (subject_type, field_key, label, template, sort_order) values
  ('listing', 'photos', 'Photos', 'Photos are too dark — please re-upload daylight photos.', 1),
  ('listing', 'price', 'Price', 'Price seems unusually low for this area — please confirm.', 2),
  ('listing', 'title', 'Title', 'Title doesn''t match the property type.', 3),
  ('listing', 'description', 'Description', 'Please remove contact numbers from the description.', 4),
  ('listing', 'location', 'Location', 'Location is incomplete — add the area and pincode.', 5),
  ('listing', 'contact', 'Contact', 'Please verify the display number.', 6),
  ('requirement', 'budget', 'Budget', 'Budget range looks unrealistic for these areas — please confirm.', 1),
  ('requirement', 'areas', 'Areas', 'One or more preferred areas could not be matched — please re-pick them.', 2),
  ('requirement', 'notes', 'Notes', 'Please remove contact numbers from the notes.', 3),
  ('requirement', 'type', 'Type', 'The type doesn''t match what the notes describe.', 4)
on conflict (subject_type, field_key) do nothing;

-- ------------------------------------------------ verification reject reasons
-- Doc5 A7: the reason list differs by level.
create table if not exists public.verification_reject_reasons (
  id         uuid primary key default gen_random_uuid(),
  level      text not null,             -- id | rera
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (level, label)
);

insert into public.verification_reject_reasons (level, label, sort_order) values
  ('id',   'Photo doesn''t match profile', 1),
  ('id',   'Document illegible or expired', 2),
  ('id',   'Name doesn''t match account', 3),
  ('id',   'Suspected fake document', 4),
  ('rera', 'RERA number not found on portal', 1),
  ('rera', 'Certificate doesn''t match the number', 2),
  ('rera', 'Certificate expired', 3),
  ('rera', 'Document illegible', 4)
on conflict (level, label) do nothing;

-- --------------------------------------- moderation action reasons (A6/A8/A9)
-- One table for the short reason-radio lists the action dialogs render: the
-- boost reject-&-refund reasons, the warn-user templates and the suspension
-- durations. Keyed by `kind` so a screen asks for exactly its own list.
create table if not exists public.moderation_action_options (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,             -- boost_refund | warn_template | suspend_duration
  value      text not null,             -- machine value (days for a duration)
  label      text not null,
  body       text,                      -- warn_template only: the message body
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
create index if not exists moderation_action_options_idx
  on public.moderation_action_options (kind, sort_order);

insert into public.moderation_action_options (kind, value, label, body, sort_order) values
  ('boost_refund', 'hidden',    'Listing hidden during review', null, 1),
  ('boost_refund', 'policy',    'Content violates policy', null, 2),
  ('boost_refund', 'duplicate', 'Duplicate boost', null, 3),
  ('warn_template', 'photos',  'Photos don''t match', 'Please ensure your photos match the actual property.', 1),
  ('warn_template', 'contact', 'Contact details in content', 'Please remove phone numbers and links from your listing text.', 2),
  ('warn_template', 'price',   'Misleading price', 'Your listed price does not reflect the actual asking price — please correct it.', 3),
  ('suspend_duration', '7',    '7 days', null, 1),
  ('suspend_duration', '30',   '30 days', null, 2),
  ('suspend_duration', '0',    'Until review', null, 3)
on conflict (kind, value) do nothing;

-- ------------------------------------------------------------ decision columns
-- A7 grants and revokes a badge; nothing recorded which admin did it, so the
-- Approved/Rejected/Revoked tabs could show a decision with no decider. The
-- audit log has the row, but the SCREEN reads this table.
alter table public.verifications add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

-- A8's reject-lock tab grants "one more resubmission". `resolution` holds the
-- note; this records that the lock was actually lifted, which is the thing the
-- poster's own screen depends on.
alter table public.moderation_appeals add column if not exists unlocked_at timestamptz;

-- --------------------------------------------------------------------- RLS
-- Config is read by the server only (service role); the browser never queries
-- these directly. Deny-by-default, like every other admin table (rule 4).
alter table public.review_sop_items enable row level security;
alter table public.change_request_fields enable row level security;
alter table public.verification_reject_reasons enable row level security;
alter table public.moderation_action_options enable row level security;
