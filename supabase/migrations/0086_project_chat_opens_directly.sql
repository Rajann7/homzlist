-- ============================================================================
-- HomzList — Migration 0086: a project chat opens directly, never as a request
--
-- 0084 modelled a project inquiry on a listing inquiry, which meant it inherited
-- accept-before-seen: the buyer's message sat in the builder's Requests screen
-- until they tapped Accept. That rule exists to protect a private seller from
-- strangers. A project is published marketing whose builder's phone number is
-- public on the page (Doc2 §6) — making them accept a stranger before they can
-- read a question protects nobody and costs the lead. Project chats now open
-- accepted (lib/chat/service.ts, ensureProjectInquiryThread).
--
-- This repairs the threads written under the old rule. Two states are moved:
--
--   pending  → accepted. Otherwise these sit in a Requests screen that will
--              never show them again (the inbox filters pending out) — a
--              buyer's question stuck behind a tap nobody can make.
--   declined → accepted, cooldown cleared. The decline came from a screen that
--              no longer offers the choice for projects; leaving the sender in
--              a 30-day cooldown enforced by a UI that is gone is a trap.
--
-- Every thread moved to accepted also gets its builder's pipeline row, because
-- accepting is what used to write it.
-- ============================================================================

-- ---- 1. open the conversations --------------------------------------------
update public.chat_threads
   set status = 'accepted',
       cooldown_until = null
 where project_id is not null
   and status in ('pending', 'declined');

-- ---- 2. the leads those accepts would have written -------------------------
-- Same shape upsertLeadFromThread writes: source 'project', stage 'new'. The
-- partial unique index (owner, lead_profile, project) makes this idempotent, so
-- a builder who already has the lead keeps the one they have — including its
-- stage, which must never be dragged backwards to 'new'.
insert into public.leads (owner_id, lead_profile_id, project_id, source, stage, last_activity)
select t.poster_id, t.buyer_id, t.project_id, 'project', 'new', 'Asked about the project'
  from public.chat_threads t
 where t.project_id is not null
   and t.status = 'accepted'
on conflict (owner_id, lead_profile_id, project_id) do nothing;
