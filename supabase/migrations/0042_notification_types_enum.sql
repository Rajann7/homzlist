-- ============================================================================
-- HomzList — Migration 0042: Module 10, NOTIFICATIONS (P11 S7 + system-wide)
--   Doc2 §14 (channels, rules, event catalog) · Doc4 §61 · Doc7 §16 · Doc9 §4
--
-- 0029 shipped a minimal notifications table for the chat module (6 types, no
-- category, no grouping, no channel ledger, no preferences beyond a single
-- `expiry_reminders` boolean). The notifications SCREEN needs far more, and
-- Doc2 §14's rules (grouping, batch/channel dedup, quiet hours, per-category
-- prefs with marketing separated for DPDP, 90-day purge) have nowhere to live.
--
-- This migration adds:
--   * the full event-type catalog as a CONFIG TABLE (notification_types) — the
--     screen's icon, tone, category, deep-link and inline actions all read from
--     it, so no option list is hardcoded in a component (CLAUDE.md §7).
--   * notification_categories — the chip bar's real source.
--   * notifications: category, grouping (group_key/group_count/last_event_at),
--     href, thumb, per-row actions + the taken action, dismissal, quiet-hours
--     hold, marketing flag, entity pointer.
--   * notify_upsert() — ONE atomic entry point that does the grouping so two
--     concurrent events can't create two "Rahul: 1 new message" rows.
--   * notification_deliveries — per-channel ledger, which is what makes channel
--     dedup ("push seen → skip email") and quiet-hours holds auditable.
--   * notification_prefs: per-category toggles, channel toggles, marketing
--     consent (DPDP: separate, default OFF), per-user quiet hours.
--   * notification_settings — singleton config (retention days, quiet window,
--     grouping window) so 90-day purge is configurable, not a magic number.
--   * purge_old_notifications() — the job behind the 90-day promise.
--   * push_tokens: device/browser/OS + standalone(PWA) so delivery can be
--     device-aware (iOS web push only works in an INSTALLED PWA).
--
-- RLS: every table here is deny-all to browser roles. The server (service role)
-- is the only writer AND the only reader — same posture as 0028/0029.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Event type enum — the full Doc2 §14 catalog
-- ---------------------------------------------------------------------------
-- `add value if not exists` is idempotent and cannot run inside a transaction
-- block in older PGs; on 15+ (Supabase) it is fine. Each is its own statement
-- so a partially-applied history heals.
alter type notification_type add value if not exists 'listing_approved';
alter type notification_type add value if not exists 'listing_rejected';
alter type notification_type add value if not exists 'listing_changes_requested';
alter type notification_type add value if not exists 'proposal_accepted';
alter type notification_type add value if not exists 'proposal_declined';
alter type notification_type add value if not exists 'proposal_expired';
alter type notification_type add value if not exists 'price_drop';
alter type notification_type add value if not exists 'saved_listing_status';
alter type notification_type add value if not exists 'requirement_match';
alter type notification_type add value if not exists 'still_available';
alter type notification_type add value if not exists 'requirement_expiring';
alter type notification_type add value if not exists 'plan_expiring';
alter type notification_type add value if not exists 'plan_expired';
alter type notification_type add value if not exists 'trial_ending';
alter type notification_type add value if not exists 'payment_success';
alter type notification_type add value if not exists 'payment_failed';
alter type notification_type add value if not exists 'refund_processed';
alter type notification_type add value if not exists 'suspension_lifted';
alter type notification_type add value if not exists 'report_outcome';
alter type notification_type add value if not exists 'performance_nudge';
alter type notification_type add value if not exists 'area_added';
alter type notification_type add value if not exists 'new_device_login';
alter type notification_type add value if not exists 'weekly_digest';
alter type notification_type add value if not exists 'city_launched';

-- (Everything else — config tables, columns, functions, RLS — is 0043. A new
--  enum value cannot be USED in the same transaction that adds it, and the
--  migration runner wraps each file in one transaction.)

-- ============================================================================
-- End 0042_notification_types_enum.sql
-- ============================================================================
