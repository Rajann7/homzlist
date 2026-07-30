-- A7 grants, refuses and revokes the verified badge — the tick eleven surfaces
-- read (feed, chat, leads, proposals, profile). None of those three outcomes had
-- a notification type, so the catalog (`notification_types`, Doc2 §14) could not
-- describe them and a user would have had a badge appear or disappear with no
-- word about it.
--
-- `notifications.type` and `notification_types.code` are the `notification_type`
-- ENUM, so the labels must exist before any row can name them. Postgres allows
-- adding an enum value inside a transaction but NOT using it in that same
-- transaction, and this runner wraps each file in one — so the catalog rows are
-- migration 0105, deliberately separate.
alter type notification_type add value if not exists 'verification_approved';
alter type notification_type add value if not exists 'verification_rejected';
alter type notification_type add value if not exists 'verification_revoked';
