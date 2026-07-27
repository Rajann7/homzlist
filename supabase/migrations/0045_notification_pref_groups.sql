-- ============================================================================
-- HomzList — Migration 0045: preference GROUPS, exactly as designs/P10 S7 has them
--   Doc4 §63 (Notification Prefs) · Doc2 §14 (per-category prefs, marketing
--   separate — DPDP) · Doc9 §4
--
-- 0043 modelled preferences as four CATEGORY toggles (inquiry / listing /
-- requirement / payment) because that is what the P11 chip bar shows. Reading
-- designs/P10 S7 afterwards showed the real control surface is finer: 17 named
-- toggles in 6 sections ("New inquiries", "Approval updates", "Price drops on
-- saved"…), one of them LOCKED ("Payment updates · Can't be turned off"), one
-- default-OFF ("Status changes on saved"), plus a separate Marketing consent,
-- Quiet hours with a window, and a Weekly digest toggle.
--
-- Shipping the four-category version would have meant a settings screen whose
-- switches don't match the design. So the groups become config rows, each
-- notification type points at one, and a user's choice is a row per group.
-- The chip bar keeps using `notifications.category` — that is a different axis
-- (how the LIST is filtered), not a preference.
--
-- A type with pref_group = NULL is CRITICAL and always delivered: suspension
-- lifted, report outcome. There is no toggle for them in the design either.
-- ============================================================================

-- ---- 1. the groups ---------------------------------------------------------
create table if not exists public.notification_pref_groups (
  code        text primary key,
  section     text not null,          -- the design's section heading
  label       text not null,
  sublabel    text,
  default_on  boolean not null default true,
  -- "Can't be turned off" (payments + security). Rendered dimmed with a lock.
  is_locked   boolean not null default false,
  sort_order  integer not null default 0
);

insert into public.notification_pref_groups (code, section, label, sublabel, default_on, is_locked, sort_order) values
  ('n_inq',       'Inquiries & chats',        'New inquiries',        'Someone inquires about your listing',                    true,  false, 10),
  ('n_msg',       'Inquiries & chats',        'New messages',          null,                                                     true,  false, 20),
  ('n_numreq',    'Inquiries & chats',        'Number requests',       null,                                                     true,  false, 30),
  ('n_msgreq',    'Inquiries & chats',        'Message requests',      null,                                                     true,  false, 40),
  ('n_appr',      'Your listings',            'Approval updates',      'When your listing is approved, rejected or needs changes', true, false, 50),
  ('n_remind',    'Your listings',            'Listing reminders',     'Still-available checks every 2 months',                   true,  false, 60),
  ('n_perf',      'Your listings',            'Performance tips',      null,                                                     true,  false, 70),
  ('n_prop',      'Requirements & proposals', 'New proposals',         null,                                                     true,  false, 80),
  ('n_propresp',  'Requirements & proposals', 'Proposal responses',    null,                                                     true,  false, 90),
  ('n_match',     'Requirements & proposals', 'Matching requirements', 'New requirements matching your area or projects',        true,  false, 100),
  ('n_expiry',    'Requirements & proposals', 'Requirement expiry',    null,                                                     true,  false, 110),
  ('n_drop',      'Saved & alerts',           'Price drops on saved',  null,                                                     true,  false, 120),
  ('n_srchmatch', 'Saved & alerts',           'Saved search matches',  null,                                                     true,  false, 130),
  ('n_status',    'Saved & alerts',           'Status changes on saved', null,                                                   false, false, 140),
  ('n_pay',       'Plans & payments',         'Payment updates',       'Can''t be turned off',                                   true,  true,  150),
  ('n_planexp',   'Plans & payments',         'Plan expiry reminders', null,                                                     true,  false, 160),
  ('n_boost',     'Plans & payments',         'Boost updates',         null,                                                     true,  false, 170),
  ('n_digest',    'Weekly digest',            'Weekly digest',         'Every Monday · saved-search matches and your listing performance', true, false, 180)
on conflict (code) do update set
  section = excluded.section, label = excluded.label, sublabel = excluded.sublabel,
  default_on = excluded.default_on, is_locked = excluded.is_locked, sort_order = excluded.sort_order;

-- ---- 2. every type points at a group (or is critical) ----------------------
alter table public.notification_types
  add column if not exists pref_group text references public.notification_pref_groups(code);

update public.notification_types set pref_group = 'n_inq'       where code = 'inquiry_received';
update public.notification_types set pref_group = 'n_msg'       where code = 'new_message';
update public.notification_types set pref_group = 'n_numreq'    where code in ('number_requested','number_shared');
update public.notification_types set pref_group = 'n_msgreq'    where code = 'chat_accepted';
update public.notification_types set pref_group = 'n_appr'      where code in ('listing_approved','listing_rejected','listing_changes_requested');
update public.notification_types set pref_group = 'n_remind'    where code = 'still_available';
update public.notification_types set pref_group = 'n_perf'      where code in ('performance_nudge','area_added');
update public.notification_types set pref_group = 'n_prop'      where code = 'proposal_received';
update public.notification_types set pref_group = 'n_propresp'  where code in ('proposal_accepted','proposal_declined','proposal_expired');
update public.notification_types set pref_group = 'n_match'     where code = 'requirement_match';
update public.notification_types set pref_group = 'n_expiry'    where code = 'requirement_expiring';
update public.notification_types set pref_group = 'n_drop'      where code = 'price_drop';
update public.notification_types set pref_group = 'n_srchmatch' where code in ('saved_search_match','city_launched');
update public.notification_types set pref_group = 'n_status'    where code = 'saved_listing_status';
update public.notification_types set pref_group = 'n_pay'       where code in ('payment_success','payment_failed','refund_processed','new_device_login');
update public.notification_types set pref_group = 'n_planexp'   where code in ('plan_expiring','plan_expired','trial_ending');
update public.notification_types set pref_group = 'n_boost'     where code in ('boost_approved','boost_rejected','boost_expiring','boost_expired','boost_stopped');
update public.notification_types set pref_group = 'n_digest'    where code = 'weekly_digest';
-- Critical, no toggle in the design, never suppressed:
update public.notification_types set pref_group = null where code in ('suspension_lifted','report_outcome');

-- The design's "Performance tips" and "Weekly digest" are PRODUCT notices with
-- their own switches, not promotional messages — so they must not be gated on
-- marketing consent, or ticking their switch would do nothing. Marketing
-- consent stays what DPDP means by it: promotional-only.
update public.notification_types set is_marketing = false
 where code in ('performance_nudge','area_added','weekly_digest','city_launched');

-- ---- 3. one row per (user, group) they have actually changed ---------------
-- Absent row = the group's default. That keeps "I never touched it" and
-- "I turned it back on" distinguishable, and a new group ships with its
-- designed default for everyone without a backfill.
create table if not exists public.notification_pref_values (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  group_code text not null references public.notification_pref_groups(code) on delete cascade,
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, group_code)
);

-- ---- 4. retire the four category booleans (single source of truth) ---------
alter table public.notification_prefs drop column if exists cat_inquiry;
alter table public.notification_prefs drop column if exists cat_listing;
alter table public.notification_prefs drop column if exists cat_requirement;
alter table public.notification_prefs drop column if exists cat_payment;

-- The design's quiet-hours row reads "11:00 PM – 8:00 AM".
update public.notification_settings set quiet_end = '08:00' where quiet_end = '07:00';

alter table public.notification_pref_groups enable row level security;
alter table public.notification_pref_values enable row level security;

-- ============================================================================
-- End 0045_notification_pref_groups.sql
-- ============================================================================
