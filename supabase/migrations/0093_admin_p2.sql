-- P2 — A1 login + A2 dashboard.
--
-- Three things the screens need and the schema did not have:
--
-- 1. The My-profile sheet (template 1585-1596) edits a display name, a phone
--    and two preference switches. Without columns to write them to, those
--    controls would be `useState` that persists nothing — the exact fake
--    control CLAUDE.md bans. `email` stays read-only: it comes from Google.
--
-- 2. Doc5 A1 promises "failed attempts logged, 5+ → super alert". The log
--    exists; counting recent failures for one email on every attempt needs an
--    index, or the check gets slower for exactly the account being attacked.
--
-- 3. The dashboard's tiles ask each queue "how many are waiting, and how old is
--    the oldest" on every page load. Those are (status, created_at) scans.

alter table public.staff add column if not exists phone text;
alter table public.staff add column if not exists notify_escalations boolean not null default true;
alter table public.staff add column if not exists daily_digest boolean not null default true;

comment on column public.staff.notify_escalations is
  'My profile → Preferences → "Email me on escalations" (P13 template 1592).';
comment on column public.staff.daily_digest is
  'My profile → Preferences → "Daily queue digest" (P13 template 1593).';

-- 5-failures-in-15-minutes lookup, per email.
create index if not exists admin_login_attempts_email_idx
  on public.admin_login_attempts (lower(email), created_at desc);

-- The bell reads unread-first, newest-first.
create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (created_at desc) where read_at is null;

-- The dashboard's anomaly banners: live ones only.
create index if not exists anomaly_events_live_idx
  on public.anomaly_events (detected_at desc) where dismissed_at is null;

-- Queue tiles: count + oldest, per queue.
create index if not exists listings_status_created_idx
  on public.listings (status, created_at);
create index if not exists requirements_status_created_idx
  on public.requirements (status, created_at);
create index if not exists boosts_status_created_idx
  on public.boosts (status, created_at);
create index if not exists verifications_status_created_idx
  on public.verifications (status, created_at);
create index if not exists moderation_appeals_status_created_idx
  on public.moderation_appeals (status, created_at);
create index if not exists reports_status_created_idx
  on public.reports (status, created_at);
create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at);
