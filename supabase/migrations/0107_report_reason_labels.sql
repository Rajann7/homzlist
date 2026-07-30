-- A9 groups reports by reason and prints that reason on the card. `reports.reason`
-- is free text written by whichever surface raised it, and there are THREE
-- separate hardcoded vocabularies feeding it:
--
--   lib/feed/interactions.ts  → codes      ('fake', 'wrong_price', 'sold', …)
--   lib/chat/thread.ts        → sentences  ('Fraud attempt', 'Abusive language', …)
--   lib/chat/service.ts       → codes      ('spam', 'fake', 'abusive', …)
--
-- so the same complaint arrives as `wrong_price` from the feed and as
-- "Wrong price" from chat, and the admin screen would show both as separate
-- groups. Labels are config here (rule 7) so A9 prints one sentence per reason
-- whichever surface raised it. Unifying the three writers is a Module 4/7 change,
-- recorded in docs/PENDING-INTEGRATIONS.md.
insert into public.moderation_action_options (kind, value, label, sort_order) values
  ('report_reason', 'fake',          'Fake or duplicate listing', 1),
  ('report_reason', 'duplicate',     'Fake or duplicate listing', 2),
  ('report_reason', 'sold',          'Property already sold', 3),
  ('report_reason', 'wrong_price',   'Wrong price', 4),
  ('report_reason', 'wrong_photos',  'Photos not of this property', 5),
  ('report_reason', 'abusive',       'Obscene or abusive content', 6),
  ('report_reason', 'spam',          'Spam / repeated posting', 7),
  ('report_reason', 'fraud',         'Fraud attempt', 8),
  ('report_reason', 'other',         'Other', 9)
on conflict (kind, value) do nothing;

-- Which reasons are HIGH PRIORITY — the design's red dot and its "High priority"
-- filter chip. Drawn in the mock, never computed: priority was not a property of
-- anything, so the chip could only ever have filtered nothing.
create table if not exists public.report_priority_rules (
  id         uuid primary key default gen_random_uuid(),
  -- matched case-insensitively against reports.reason, code or sentence
  pattern    text not null unique,
  priority   text not null default 'high' check (priority in ('high', 'normal')),
  created_at timestamptz not null default now()
);
alter table public.report_priority_rules enable row level security;

-- Fraud, money off-platform, abuse and impersonation are the four that cost a
-- real person real money or safety if they wait in a queue.
insert into public.report_priority_rules (pattern, priority) values
  ('fraud',    'high'),
  ('abusive',  'high'),
  ('obscene',  'high'),
  ('outside platform', 'high'),
  ('asking money', 'high'),
  ('off-platform', 'high'),
  ('posing as owner', 'high'),
  ('fake identity', 'high')
on conflict (pattern) do nothing;
