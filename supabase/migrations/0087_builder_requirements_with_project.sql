-- 0087 — Requirement access is a CATALOG fact, and a builder gets it with the
-- project, never on its own (Rajan, 29 Jul 2026). Supersedes Doc2 §2 line 24
-- ("View requirements … Builder ₹2,999") and §4.2's plan table for builders.
--
-- Three things, all of which were previously either wrong or nowhere:
--
-- 1. `requirement_access` did not EXIST. `hasRequirementAccess()` reads
--    `user_plans.terms->>'requirement_access'` and no plan snapshot has ever
--    carried that key — so the function returned false for every user who has
--    ever paid, and the ₹2,999 "unlock all requirements" was unbuyable in
--    effect: 80 user_plans rows, not one of them able to unlock a card. The
--    flag becomes a real catalog column so the entitlement is DB-driven
--    (CLAUDE.md rule 7) rather than a key someone remembered to type.
--
-- 2. A builder may no longer BUY the requirement-only plan. `roles` is what
--    both `getCatalog` and the checkout/quote guards already read, so dropping
--    'builder' from p2999 hides it from the plans screen AND makes the purchase
--    a 403 — no new code path to keep in sync.
--
-- 3. Existing snapshots are backfilled. `user_plans.terms` is a frozen copy of
--    the catalog row by design (an old plan must keep the terms it was sold
--    under), so adding the column only helps FUTURE purchases; without this
--    backfill every current ₹2,999 and ₹9,999 holder would stay locked out.

alter table plan_catalog
  add column if not exists requirement_access boolean not null default false;

comment on column plan_catalog.requirement_access is
  'Does holding this plan unlock OTHER people''s requirement details (Doc2 §7.3)? Read by hasRequirementAccess() through the user_plans terms snapshot.';

-- Requirement Access (the plan whose whole purpose it is) and Builder Project
-- (Doc2 §4.2: "project + unlimited matched requirements"). A boost buys
-- placement and a top-up buys proposals — neither unlocks anything to read.
update plan_catalog set requirement_access = true  where code in ('p2999', 'p9999');
update plan_catalog set requirement_access = false where code in ('p999', 'topup10', 'boost7', 'boost30');

-- Builder-only-requirements is no longer a product: a builder reaches
-- requirements through the ₹9,999 project plan or not at all.
update plan_catalog set roles = array['owner', 'broker']::text[] where code = 'p2999';

-- Backfill the frozen snapshots so nobody who already paid is left locked.
update user_plans
   set terms = terms || jsonb_build_object('requirement_access', true)
 where catalog_code in ('p2999', 'p9999')
   and coalesce((terms ->> 'requirement_access')::boolean, false) is distinct from true;

update user_plans
   set terms = terms || jsonb_build_object('requirement_access', false)
 where catalog_code in ('p999', 'topup10', 'boost7', 'boost30')
   and terms ? 'requirement_access' = false;
