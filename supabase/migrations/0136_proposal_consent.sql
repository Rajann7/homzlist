-- ============================================================================
-- HomzList — Migration 0136: consent record on proposals
--
-- A requirement answer shares the sender's contact details exactly like a
-- property inquiry does, so it needs the same evidence: which consent wording
-- was shown, when it was accepted, and from where. A ticked checkbox with no
-- row behind it is not a consent record (DPDP).
--
-- Additive and idempotent; existing proposals keep null and are unaffected.
-- ============================================================================

alter table public.proposals add column if not exists consent_version text;
alter table public.proposals add column if not exists consent_at      timestamptz;
alter table public.proposals add column if not exists consent_ip      text;
