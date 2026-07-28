-- ============================================================================
-- HomzList — Migration 0065: a project draws a PROJECT slot, not a listing one
--
-- `createProject` called consume_quota(profile, 'listing', 1), so any plan with
-- a listing slot paid for a builder project. Proven on dev: one 50-slot ₹999
-- grant funded eight projects while the ₹9,999 Builder Project plan was never
-- required — and the review step told the builder "₹9,999 · 6 months · 1
-- project" the whole way through. A ₹999 listing slot and a ₹9,999 project slot
-- are different goods; the counter has to say so.
--
-- Part 1 of 2. `ALTER TYPE ... ADD VALUE` cannot be USED in the transaction
-- that adds it, so this file only adds the label and the columns; 0066 does the
-- backfill and rewrites the quota functions.
-- ============================================================================

alter type public.consumption_kind add value if not exists 'project';

alter table public.plan_catalog add column if not exists project_quota integer not null default 0;
alter table public.user_plans   add column if not exists project_quota integer not null default 0;
alter table public.user_plans   add column if not exists project_used  integer not null default 0;

-- The ₹9,999 plan sells ONE project and no listing. Everything else sells no
-- project. Catalog only — live plans are migrated in 0066.
update public.plan_catalog set project_quota = 1, listing_quota = 0 where code = 'p9999';
update public.plan_catalog set project_quota = 0 where code <> 'p9999';
