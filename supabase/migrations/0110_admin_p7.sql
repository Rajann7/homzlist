-- ============================================================================
-- P7 — A22 Settings · A23 Tickets · A24 Disputes · A25 Staff · A26 Audit
--      A27 System · A28 Analytics · A29 Trash · A30 Exports
--
-- Same shape as 0106: the list views the shared engine needs, plus the one
-- thing that turns a screen full of switches into a screen that does something.
--
-- That thing, this time, is `rate_limits` and `velocity_rules`. Both were
-- seeded — 13 and 8 rows — and NOTHING READ EITHER. The real limiter is
-- lib/auth/rate-limit.ts with the numbers hardcoded at ~40 call sites, so
-- A22's "Limits & velocity" tab was about to ship as a table of editable
-- numbers that changed nothing. It is the exact failure 0096 documented for
-- `number_patterns` and 0106 fixed. The limiter now reads these rows, and the
-- blocks it issues are counted here so the design's "Hits (24h)" column is a
-- query rather than a decoration.
-- ============================================================================

/* ─────────────────────────────── 1 · the limiter gets a hit counter ─────── */

-- Only BLOCKS are recorded, not every allowed request: a row per allowed call
-- would be a write on the hot path of every endpoint on the site, and the
-- number an admin needs is "how often did this limit actually stop someone".
create table if not exists public.rate_limit_hits (
  rule_key text not null,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  blocked integer not null default 0,
  primary key (rule_key, day)
);

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

create or replace function public.hz_record_rate_block(p_key text)
returns void language sql security definer set search_path = public as $$
  insert into public.rate_limit_hits (rule_key, day, blocked)
  values (p_key, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (rule_key, day) do update set blocked = rate_limit_hits.blocked + 1;
$$;
revoke all on function public.hz_record_rate_block(text) from public, anon, authenticated;

-- Velocity rules need the same: a rule that has never fired has never been
-- proven, and the design prints a status per rule.
create table if not exists public.velocity_hits (
  rule_key text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists velocity_hits_rule_idx
  on public.velocity_hits (rule_key, created_at desc);

alter table public.velocity_hits enable row level security;
revoke all on public.velocity_hits from anon, authenticated;

/* ══════════════════════════════════════════════ 2 · the P7 list views ═════ */

-- A22 · Feature flags (template 2337). "Last changed" is the audit log's, not
-- a second column that has to be remembered on every write.
create or replace view public.admin_flag_list as
select
  f.key                                    as id,
  f.key,
  f.label,
  f.description,
  f.enabled,
  f.scope,
  f.scope_value,
  f.updated_at,
  s.display_name                           as updated_by_name
from public.feature_flags f
left join public.staff s on s.profile_id = f.updated_by;

-- A22 · Rate limits (template 2367) and velocity rules.
create or replace view public.admin_rate_limit_list as
select
  r.key                                    as id,
  r.key,
  r.label,
  r.scope,
  r.window_seconds,
  r.max_requests,
  r.block_seconds,
  r.is_active,
  r.updated_at,
  coalesce(h.blocked, 0)                   as hits_24h
from public.rate_limits r
left join lateral (
  select sum(blocked) blocked from public.rate_limit_hits h
   where h.rule_key = r.key
     and h.day >= ((now() at time zone 'Asia/Kolkata')::date - 1)
) h on true;

create or replace view public.admin_velocity_list as
select
  v.key                                    as id,
  v.key,
  v.label,
  v.threshold,
  v.window_hours,
  v.action,
  v.is_active,
  coalesce(h.n, 0)                         as hits_24h
from public.velocity_rules v
left join lateral (
  select count(*) n from public.velocity_hits h
   where h.rule_key = v.key and h.created_at > now() - interval '24 hours'
) h on true;

-- A23 · Tickets (template 2432). The SLA state is DERIVED from the due date —
-- a stored "overdue" flag is one nobody remembers to flip at the deadline, and
-- the design paints the whole row red off this.
create or replace view public.admin_ticket_list as
select
  t.id,
  t.number,
  t.subject,
  t.category,
  t.priority,
  t.status,
  t.is_grievance,
  t.sla_due_at,
  t.acked_at,
  t.closed_at,
  t.last_activity_at,
  t.created_at,
  t.reopen_count,
  t.profile_id,
  p.name                                   as user_name,
  p.photo_url                              as user_photo,
  p.role                                   as user_role,
  p.phone                                  as user_phone,
  t.assignee_id,
  s.display_name                           as assignee_name,
  t.payment_id,
  t.listing_id,
  case
    when t.status = 'closed'                                    then 'none'
    when t.sla_due_at is null                                   then 'none'
    when t.sla_due_at < now()                                   then 'over'
    when t.sla_due_at < now() + interval '4 hours'              then 'warn'
    else 'ok'
  end                                      as sla_state,
  -- the design prints "2h left" / "3h over"
  extract(epoch from (t.sla_due_at - now()))::bigint            as sla_seconds_left
from public.support_tickets t
left join public.profiles p on p.id = t.profile_id
left join public.staff s on s.profile_id = t.assignee_id;

-- A24 · Disputes (template 2489).
create or replace view public.admin_dispute_list as
select
  d.id,
  d.number,
  d.category,
  d.summary,
  d.amount_claimed_paise,
  d.status,
  d.outcome,
  d.resolution,
  d.evidence_preserved,
  d.created_at,
  d.resolved_at,
  d.listing_id,
  l.title                                  as listing_title,
  l.cover_url                              as listing_cover,
  d.thread_id,
  d.party_a,
  a.name                                   as party_a_name,
  a.photo_url                              as party_a_photo,
  d.party_b,
  b.name                                   as party_b_name,
  b.photo_url                              as party_b_photo
from public.disputes d
left join public.profiles a on a.id = d.party_a
left join public.profiles b on b.id = d.party_b
left join public.listings l on l.id = d.listing_id;

-- A25 · Staff (template 2523). "Online" is a fact about a live session, not a
-- flag someone sets — `staff.is_online` would be stale the moment a browser
-- closes without logging out.
create or replace view public.admin_staff_list as
select
  s.profile_id                             as id,
  s.profile_id,
  s.email,
  s.display_name,
  s.level,
  s.is_active,
  s.state,
  s.created_at,
  s.invited_at,
  s.last_login_at,
  s.added_by,
  adder.display_name                       as added_by_name,
  exists (
    select 1 from public.staff_sessions ss
     where ss.staff_id = s.profile_id
       and ss.ended_at is null and ss.revoked_at is null
       and ss.last_seen_at > now() - interval '5 minutes'
  )                                        as is_online,
  -- the design's "Pending first login" badge
  (s.last_login_at is null)                as pending_first_login,
  (select count(*) from public.admin_audit_log al where al.actor_id = s.profile_id) as action_count
from public.staff s
left join public.staff adder on adder.profile_id = s.added_by;

-- A27 · Cron (template 2606).
create or replace view public.admin_cron_list as
select
  c.code                                   as id,
  c.code,
  c.name,
  c.schedule,
  c.description,
  c.enabled,
  c.last_run_at,
  c.last_status,
  c.last_duration_ms,
  c.next_run_at,
  c.failure_count,
  (select r.error from public.cron_runs r
    where r.job_code = c.code order by r.started_at desc limit 1) as last_error
from public.cron_jobs c;

-- A29 · Trash (template 2694). "Purge in" is a fact about a date.
create or replace view public.admin_trash_list as
select
  t.id,
  t.entity_type,
  t.entity_id,
  t.label,
  t.deleted_by_kind,
  t.deleted_by,
  t.deleted_by_name,
  t.reason,
  t.deleted_at,
  t.purge_at,
  t.restored_at,
  extract(epoch from (t.purge_at - now()))::bigint / 86400      as purge_days_left,
  case
    when t.restored_at is not null                              then 'restored'
    when t.purge_at is null                                     then 'ok'
    when t.purge_at < now()                                     then 'over'
    when t.purge_at < now() + interval '5 days'                 then 'warn'
    else 'ok'
  end                                      as purge_state
from public.trash_items t;

-- A30 · Exports (template 2721). `exports` already carries everything P1b's
-- machinery writes; this only adds the expiry state the design colours by.
create or replace view public.admin_export_list as
select
  e.id,
  e.name,
  e.entity,
  e.filters,
  e.format,
  e.row_count,
  e.status,
  e.reason,
  e.contains_personal_data,
  e.file_key,
  e.requested_by,
  e.requested_by_name,
  e.expires_at,
  e.created_at,
  case
    when e.status <> 'ready'                                    then e.status
    when e.expires_at is null                                   then 'ready'
    when e.expires_at < now()                                   then 'expired'
    else 'ready'
  end                                      as state_key,
  extract(epoch from (e.expires_at - now()))::bigint            as expires_in_seconds
from public.exports e;

-- A28 · Analytics events (template 2650). One row per event NAME with its
-- 30-day count and the previous 30 days, so the design's ▲/▼ badge is a real
-- comparison rather than a fixture.
create or replace view public.admin_event_summary as
select
  e.name                                   as id,
  e.name,
  count(*) filter (where e.created_at > now() - interval '30 days')                    as count_30d,
  count(*) filter (where e.created_at > now() - interval '60 days'
                     and e.created_at <= now() - interval '30 days')                   as count_prev_30d,
  max(e.created_at)                        as last_seen_at
from public.analytics_events e
group by e.name;

/* ─────────────────────────────────────────────────────────── grants ─────── */

revoke all on public.admin_flag_list        from anon, authenticated;
revoke all on public.admin_rate_limit_list  from anon, authenticated;
revoke all on public.admin_velocity_list    from anon, authenticated;
revoke all on public.admin_ticket_list      from anon, authenticated;
revoke all on public.admin_dispute_list     from anon, authenticated;
revoke all on public.admin_staff_list       from anon, authenticated;
revoke all on public.admin_cron_list        from anon, authenticated;
revoke all on public.admin_trash_list       from anon, authenticated;
revoke all on public.admin_export_list      from anon, authenticated;
revoke all on public.admin_event_summary    from anon, authenticated;
