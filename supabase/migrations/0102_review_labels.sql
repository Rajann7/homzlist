-- Two option lists the review screens have to print but nothing could resolve,
-- so A5 showed a reviewer raw database codes: "Urgency: exploring" and
-- "Risk: number_in_notes".
--
-- CLAUDE.md rule 7 — the label belongs in config, not in a component. `urgency`
-- joins `field_definitions` alongside every other answer the forms collect (its
-- labels are currently hardcoded in components/listings/RequirementForm.tsx,
-- which is recorded in docs/PENDING-INTEGRATIONS.md as the copy to retire), and
-- the auto-flag codes get labels of their own so the risk block reads as English.

insert into public.field_definitions (key, label, control, options, "group", sort_order, is_active)
values (
  'urgency',
  'Urgency',
  'select',
  '[{"value":"immediate","label":"Immediate (within 1 month)"},
    {"value":"1_3_months","label":"1–3 months"},
    {"value":"exploring","label":"Just exploring"}]'::jsonb,
  null,
  95,
  true
)
on conflict (key) do update set options = excluded.options, label = excluded.label;

-- The `flagged_reason` codes the create/submit paths write. `+3` in the risk
-- block is the same number either way; this is only what the reviewer reads.
insert into public.moderation_action_options (kind, value, label, sort_order) values
  ('flag_reason', 'phone_number_in_text', 'Phone number detected in the text', 1),
  ('flag_reason', 'number_in_notes',      'Phone number detected in the notes', 2),
  ('flag_reason', 'number_pattern',       'Contact-number pattern detected', 3),
  ('flag_reason', 'blocklist_word',       'Blocked word detected', 4),
  ('flag_reason', 'duplicate_suspect',    'Looks like a duplicate of an existing post', 5)
on conflict (kind, value) do nothing;
