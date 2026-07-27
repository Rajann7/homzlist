-- ============================================================================
-- HomzList — Migration 0051: project leads
--
-- The project insights screen shows ONE metric: Leads. That metric had no data
-- source. `leads` carries `listing_id` and `requirement_id` and nothing else,
-- and the chat thread a lead is born from has the same two columns — so a
-- builder has never had any record of who contacted them about a project.
--
-- The project detail's only contact affordances are Call and WhatsApp, which
-- open the dialler / wa.me and leave no trace at all. That is the gap this
-- closes: tapping either now records a lead against the project, which is a
-- defensible definition of the word — a real signed-in person asked to be put
-- in touch about this specific project.
--
-- Nullable and additive: every existing lead keeps its listing or requirement,
-- and the partial unique index below makes the recording idempotent, so a buyer
-- tapping Call four times is one lead, not four.
-- ============================================================================

alter table public.leads
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

-- The insights count is `where project_id = ?`, so it needs an index.
create index if not exists leads_project_idx
  on public.leads (project_id)
  where project_id is not null;

-- One lead per (builder, person, project). A repeat tap updates the existing
-- row's activity rather than minting a duplicate — the index IS the guard, so
-- two parallel taps can't both insert.
--
-- Deliberately NOT a partial index (`where project_id is not null`). Postgres
-- can only infer a partial index for ON CONFLICT when the statement repeats its
-- predicate, which PostgREST does not emit — so the upsert failed silently and
-- no lead was ever written. A plain index is correct anyway: every existing
-- listing/requirement lead has `project_id = null`, and NULLs do not collide in
-- a unique index, so those rows are unaffected.
create unique index if not exists leads_project_unique
  on public.leads (owner_id, lead_profile_id, project_id);

comment on column public.leads.project_id is
  'Project this lead is about (migration 0051). Set when a viewer taps Call or WhatsApp on a project detail; mutually exclusive with listing_id/requirement_id in practice.';
