-- ============================================================================
-- HomzList — Migration 0087: which UNIT a project chat is about
--
-- A project chat's subject is the project, but a builder's first question is
-- always "which unit?" — the design prefixes every row of a project card with
-- it ("3 BHK · Send the payment plan"). Until now the unit only ever existed
-- inside the message text the unit-level Enquire button prefilled, so it could
-- not be grouped, filtered or shown anywhere.
--
-- One nullable column. Null is the normal case: a chat opened from "Contact
-- builder" is about the whole project, and that is a real answer, not missing
-- data.
-- ============================================================================

alter table public.chat_threads
  add column if not exists unit_id uuid references public.project_units(id) on delete set null;

comment on column public.chat_threads.unit_id is
  'The project unit this chat is about (0087). Null = the whole project. '
  'Only ever set alongside project_id; on delete set null so removing a unit '
  'type from the scheme leaves the conversation intact.';

-- The builder's inbox reads threads by project and shows the unit on each row.
create index if not exists chat_threads_unit_idx
  on public.chat_threads (unit_id)
  where unit_id is not null;

-- A unit may only be attached to a thread whose subject is a project.
do $$ begin
  alter table public.chat_threads
    add constraint chat_threads_unit_needs_project
    check (unit_id is null or project_id is not null) not valid;
exception when duplicate_object then null; end $$;

alter table public.chat_threads validate constraint chat_threads_unit_needs_project;
