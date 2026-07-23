-- ============================================================================
-- HomzList — Migration 0016: WebP variant URLs per photo
--
-- The image worker (lib/queues/worker.ts) generates thumb/medium/large/original
-- WebP renditions and needs somewhere to record them. `variants` doubles as the
-- worker's idempotency marker: a photo that already has it is skipped, so a
-- retried BullMQ job never re-encodes.
--
-- Optimisation only — the security gate remains `commitPhotos`, which magic-byte
-- validates the real bytes before a photo is usable whether or not the worker
-- ever runs.
-- ============================================================================

alter table public.listing_photos
  add column if not exists variants jsonb;
