-- ============================================================================
-- A restored item, and an item held as evidence, have NO purge date.
--
-- `trash_items.purge_at` was NOT NULL, which makes both of those states
-- unrepresentable:
--
--   · A29's Restore clears the countdown — the item is back, there is nothing
--     left to purge.
--   · A24's "Preserve evidence" holds the related rows from the purge job,
--     which is the whole point of preserving them (Section 79).
--
-- Both wrote `purge_at = null`, both were refused by the constraint, and
-- because neither read the error back the API answered 200 over a row that had
-- not moved. Same shape as the `area_requests` bug 0106 fixed — a green toast
-- over a write Postgres rejected.
--
-- So the column becomes nullable, with the meaning stated: NULL is "no purge
-- scheduled", which is exactly what a restored or held item is. The purge job
-- already selects on `purge_at <= now()`, so a NULL row is skipped by
-- construction rather than by a second flag it would have to remember to read.
-- ============================================================================

alter table public.trash_items alter column purge_at drop not null;

comment on column public.trash_items.purge_at is
  'When the item is destroyed for good. NULL = no purge scheduled — the item was restored (A29) or is held as evidence for a dispute (A24).';
