-- ============================================================================
-- A11's Send-message sheet offers three channels; the row has to say what each
-- one actually did.
--
-- 0088 gave `admin_messages` a single `delivered_at`, which can only express
-- "something went". With three channels that is a lie waiting to happen: an
-- email that no provider is configured for, sent alongside an in-app message
-- that DID arrive, would inherit the same timestamp. `delivery` records the
-- per-channel outcome the way `notification_deliveries` already does for
-- notifications — sent / failed, and the provider's reason when it failed.
-- ============================================================================
alter table public.admin_messages
  add column if not exists delivery jsonb not null default '{}'::jsonb;

comment on column public.admin_messages.delivery is
  'per-channel outcome, e.g. {"in_app":{"sent":true},"email":{"sent":false,"reason":"no_credentials"}}';
