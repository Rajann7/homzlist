-- ---------------------------------------------------------------------------
-- 0133 — admin-tunable durations: how long a session lasts, how long a story
--        stays in the row.
--
-- Two numbers were baked into code as constants and could only change with a
-- deploy:
--   · lib/auth/session.ts  — the refresh-token lifetime = how long a signed-in
--     user stays logged in before they must sign in again (was 30 days).
--   · lib/feed/stories.ts  — the window a newly-approved listing/project shows
--     in the story row (was 24 hours).
--
-- Both are now rows here, read at runtime through lib/system/config.ts (cached,
-- with a code default fallback so a bad read never logs everyone out or hides
-- every story). Edited from admin Settings → "Sessions & content".
--
-- Service-role only, exactly like feature_flags / rate_limits: RLS is ON with
-- NO policy, so anon and authenticated get nothing and only the server (service
-- key, which bypasses RLS) reads or writes these.
-- ---------------------------------------------------------------------------

create table if not exists public.system_durations (
  key         text primary key,
  label       text not null,
  seconds     bigint not null check (seconds > 0),
  -- The admin save path clamps to this band; the padlock the UI could draw is a
  -- picture, this is the control (a crafted POST cannot set a 1-second session).
  min_seconds bigint not null default 60,
  max_seconds bigint not null,
  note        text,
  updated_at  timestamptz not null default now(),
  constraint system_durations_band check (min_seconds <= seconds and seconds <= max_seconds)
);

comment on table public.system_durations is
  'Operator-tunable time windows read at runtime by lib/system/config.ts. Service-role only; edited from admin Settings -> Sessions & content.';

alter table public.system_durations enable row level security;
-- No policy on purpose: only the service_role key (server) may touch this,
-- like feature_flags and rate_limits. RLS-on + no-policy = denied for everyone
-- else.

insert into public.system_durations (key, label, seconds, min_seconds, max_seconds, note) values
  ('session_ttl', 'Session length', 604800, 1800, 2592000,
   'How long a signed-in user stays logged in before they must sign in again. The 15-minute access token refreshes silently within this window.'),
  ('story_window', 'Story window', 2592000, 3600, 7776000,
   'How long a newly approved listing or project stays in the story row.')
on conflict (key) do nothing;
