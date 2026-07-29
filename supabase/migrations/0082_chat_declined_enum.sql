-- ============================================================================
-- HomzList — Migration 0082: `chat_declined` notification type (enum value)
--
-- Accept notified the sender ("you can chat now"); decline notified nobody, so a
-- declined sender learned it only by re-opening the thread — and never learned
-- the cooldown date their DeclinedCard quotes. Both halves of the poster's
-- decision now behave the same way.
--
-- The enum value lands ALONE in this file: a migration is one transaction, and
-- Postgres refuses to USE a value added by the same transaction. 0083 is the
-- first statement allowed to reference it.
-- ============================================================================

alter type notification_type add value if not exists 'chat_declined';

-- ============================================================================
-- End 0082_chat_declined_enum.sql
-- ============================================================================
