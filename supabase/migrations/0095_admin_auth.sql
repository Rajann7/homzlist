-- Module 11 Part 1 — admin authentication & authorisation.
--
-- Doc3 §1.1 requires Google-ONLY sign-in against a whitelist that a Super Admin
-- maintains, with instant revocation, a login audit, and a three-level
-- permission matrix checked server-side. None of that could exist yet:
--
--   * `staff` (0019) had no email at all, so there was nothing for a Google
--     identity to match against — the whitelist Doc3 describes had no key.
--   * No `added_by` / `last_login_at`, so A25's "Added by" and "Last login"
--     columns and the "minimum 2 super admins" rule had no data behind them.
--   * `staff.level` gained 'super' in 0089 but nothing recorded WHO granted it.
--
-- `profile_id` stays the primary key: `admin_audit_log.actor_id`,
-- `staff_sessions.staff_id`, `review_locks` and `isStaff()` all key on it, and
-- re-pointing them would be a much larger change for no gain. A staff member
-- therefore always has a profiles row — the same shape scripts/seed-admin.mjs
-- already created for Priya Shah, Amit Joshi and the rest.

alter table public.staff add column if not exists email         text;
alter table public.staff add column if not exists name          text;
alter table public.staff add column if not exists google_sub    text;
alter table public.staff add column if not exists added_by      uuid references public.profiles(id) on delete set null;
alter table public.staff add column if not exists last_login_at timestamptz;

-- The whitelist key. Case-insensitive: Google hands back the address in
-- whatever case the user typed it, and "Priya@" must not become a second seat.
create unique index if not exists staff_email_key on public.staff (lower(email)) where email is not null;
-- One Google account = one seat, so a revoked email cannot be re-linked by
-- re-adding the same underlying Google identity under a different address.
create unique index if not exists staff_google_sub_key on public.staff (google_sub) where google_sub is not null;

-- Backfill from the profiles rows the seed already linked, so the existing
-- staff can sign in without being re-added by hand.
update public.staff s
   set email = p.email,
       name  = coalesce(s.name, p.name)
  from public.profiles p
 where p.id = s.profile_id
   and s.email is null
   and p.email is not null;

-- A staff row with no email can never authenticate through Google — it is not a
-- seat, it is a hole: it grants isStaff() = true on the user-side moderation
-- endpoints to whoever owns that profile. seed-admin.mjs left exactly one
-- (a seller profile named "Builder" at level 'admin'). Close it, and stop the
-- shape from coming back.
update public.staff set is_active = false where email is null and is_active;

alter table public.staff drop constraint if exists staff_active_needs_email;
alter table public.staff add  constraint staff_active_needs_email
  check (not is_active or email is not null);

-- ---------------------------------------------------------------- admin sessions
-- staff_sessions (0088) records that a session existed. It could not END one:
-- Doc3 §1.1's "remove email = sessions invalidated instantly" and the 30-minute
-- timeout both need a server-side handle on the live session, and the
-- heartbeat needs somewhere to write "still here".
alter table public.staff_sessions add column if not exists jti          text;
alter table public.staff_sessions add column if not exists revoked_at   timestamptz;
alter table public.staff_sessions add column if not exists revoke_reason text;

create unique index if not exists staff_sessions_jti_key on public.staff_sessions (jti) where jti is not null;
create index if not exists staff_sessions_live_idx
  on public.staff_sessions (staff_id, last_seen_at desc) where ended_at is null and revoked_at is null;

-- admin_login_attempts (0088) holds the failures; a SUCCEEDED attempt is just as
-- much a part of the "who/when/IP/device" login audit Doc3 §1.1 asks for.
alter table public.admin_login_attempts add column if not exists outcome text;
update public.admin_login_attempts set outcome = 'denied' where outcome is null;
alter table public.admin_login_attempts alter column outcome set default 'denied';
alter table public.admin_login_attempts drop constraint if exists admin_login_attempts_outcome_check;
alter table public.admin_login_attempts add  constraint admin_login_attempts_outcome_check
  check (outcome = any (array['granted'::text, 'denied_not_whitelisted'::text,
                             'denied_revoked'::text, 'denied'::text]));

-- RLS: deny-by-default, same posture as every other admin table (0088). The
-- admin panel reads and writes exclusively through the service-role key behind
-- server-side permission checks — no client ever touches these directly.
alter table public.staff enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.admin_login_attempts enable row level security;
