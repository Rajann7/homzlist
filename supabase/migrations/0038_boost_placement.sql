-- ============================================================================
-- HomzList — Migration 0038: Boost placement, subjects & admin approval
--   Doc2 §13 (boost) · Doc2 §9.1-9.2 (feed/story placement) · Doc7 §38-42 · Doc9 §11
--
-- Module 3 shipped the boost PURCHASE (checkout → pending_approval → refund
-- sweep). What it could not do:
--
--  1. Go live. Nothing in the codebase moved `pending_approval` → `active`, so
--     every paid boost eventually hit the 48h timeout in migration 0012 and was
--     refunded. `approve_boost` / `reject_boost` below are that missing step,
--     staff-driven and race-sealed.
--
--  2. Target anywhere. `targeting`/`target_label` were free text with no
--     location ids behind them, so placement could not tell whether a boost
--     applied to the viewer. "All India" was sold and did literally nothing
--     (the feed is city-scoped). The resolved `target_*_id` columns are what
--     placement actually matches on.
--
--  3. Boost anything but a listing. Doc2 §13 makes projects and requirements
--     boostable too (requirement boost is the "locked-but-top" case in §9.2).
--     `subject_kind` names what `listing_id` points at, so one boost row shape
--     serves all three without a second table.
--
--  4. Pause. Doc2 §13 "Admin-hide → pause/resume" had no state to sit in.
--
-- Everything here is additive; existing rows keep working (`subject_kind`
-- defaults to 'listing', and their targeting is backfilled from the subject).
-- ============================================================================

-- ---- 1. new boost status: paused (admin-hide → pause/resume) ----------------
-- Postgres cannot add an enum value inside a transaction that also uses it, and
-- `if not exists` makes the migration re-runnable.
alter type boost_status add value if not exists 'paused';

-- ---- 2. boost subjects ------------------------------------------------------
-- `listing_id` keeps its name (every existing query uses it) but is now "the
-- subject id"; `subject_kind` says which table to resolve it in. No FK, because
-- it deliberately points at one of three tables — the service layer validates
-- existence + ownership on every write, and the queue joins explicitly.
alter table public.boosts
  add column if not exists subject_kind text not null default 'listing';

alter table public.boosts drop constraint if exists boosts_subject_kind_chk;
alter table public.boosts
  add constraint boosts_subject_kind_chk
  check (subject_kind in ('listing', 'project', 'requirement'));

-- ---- 3. resolved targeting -------------------------------------------------
-- Written once at purchase from the subject's own location, never from the
-- browser. `targeting` stays the scope the buyer chose; these are the ids
-- placement compares against the viewer.
alter table public.boosts
  add column if not exists target_area_id  uuid references public.locations(id) on delete set null,
  add column if not exists target_city_id  uuid references public.locations(id) on delete set null,
  add column if not exists target_state_id uuid references public.locations(id) on delete set null;

-- Who approved/rejected, for the admin detail panel's "Boost approved by Amit".
alter table public.boosts
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists paused_at   timestamptz;

-- Placement reads "every boost live right now" on every feed/search request, so
-- it gets its own covering index rather than riding boosts_listing_idx.
create index if not exists boosts_placement_idx
  on public.boosts (status, starts_at, ends_at)
  where status = 'active';

create index if not exists boosts_queue_idx
  on public.boosts (status, created_at)
  where status = 'pending_approval';

-- ---- 4. backfill targeting for the boosts that already exist ---------------
-- Their `target_label` was text-only; resolve the real ids from the listing so
-- placement treats historical rows the same as new ones.
update public.boosts b
   set target_area_id  = l.area_id,
       target_city_id  = l.city_id,
       target_state_id = l.state_id
  from public.listings l
 where l.id = b.listing_id
   and b.subject_kind = 'listing'
   and b.target_city_id is null;

-- ---- 5. boost_reviews — the decision audit trail ---------------------------
-- `moderation_log` is keyed to the listing/requirement/project state machine
-- (approve → live). A boost decision is a different machine (approve → active
-- window, reject → refund), and it must be attributable on its own: money moves
-- because of it.
create table if not exists public.boost_reviews (
  id         uuid primary key default gen_random_uuid(),
  boost_id   uuid not null references public.boosts(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null check (action in ('approve', 'reject', 'pause', 'resume', 'auto_stop', 'auto_expire')),
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists boost_reviews_boost_idx on public.boost_reviews (boost_id, created_at desc);

-- ---- 6. settings: the city boost cap ---------------------------------------
-- The admin boost-detail panel (P13-15) shows an eligibility check reading
-- "City boost cap: 4 of 10 used". That cap has to be a real, enforced number
-- rather than a label, so approval refuses past it.
insert into public.billing_settings (key, value) values
  ('boost_city_cap',            '10'::jsonb),
  ('boost_expiry_notice_days',  '1'::jsonb)
on conflict (key) do nothing;

-- ---- 7. notification types for boost events --------------------------------
-- Doc2 §14's event catalog lists "boost approval/active/expiry+renew". None of
-- them existed in the enum, so the renew notification in the P11 notifications
-- design had no producer.
alter type notification_type add value if not exists 'boost_approved';
alter type notification_type add value if not exists 'boost_rejected';
alter type notification_type add value if not exists 'boost_expiring';
alter type notification_type add value if not exists 'boost_expired';
alter type notification_type add value if not exists 'boost_stopped';

-- ---- 8. RLS ----------------------------------------------------------------
-- Deny-all to browser roles, like every other billing table: the server API
-- (service-role) is the only path (Doc9 §4).
alter table public.boost_reviews enable row level security;

-- ============================================================================
-- End 0038_boost_placement.sql
-- ============================================================================
